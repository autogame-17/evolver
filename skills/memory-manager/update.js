const fs = require('fs');
const path = require('path');
const { program } = require('commander');

// MAX RETRIES for lock acquisition
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 200;
const LOCK_STALE_MS = 10000; // 10s max lock time

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(text) {
    // Normalize line endings to LF and strip trailing whitespace per line
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(line => line.trimEnd()).join('\n');
}

// Atomic Locking via mkdir (POSIX atomic)
// We use a directory as a lock because mkdir is atomic.
function acquireLock(file) {
    const lockPath = `${file}.lock`;
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
        try {
            // Check for stale lock
            if (fs.existsSync(lockPath)) {
                const stats = fs.statSync(lockPath);
                if (Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
                    console.warn(`[Lock] Found stale lock ${lockPath}, removing...`);
                    fs.rmdirSync(lockPath);
                }
            }
            
            fs.mkdirSync(lockPath); // Atomic
            return lockPath;
        } catch (e) {
            attempts++;
            // console.log(`[Lock] Waiting for lock on ${file}...`);
            const delay = RETRY_DELAY_MS + Math.floor(Math.random() * 50);
            // Sync sleep simulation for simplicity or require deasync? No, we are async function safeUpdate.
            // Wait, acquireLock needs to be async or we need sleepSync.
            // We'll make safeUpdate call this and await sleep. But we are inside loop.
            // Let's return null if fail, handle retry in caller? 
            // Better: use fs.mkdirSync and if it fails (EEXIST), return null.
            return null;
        }
    }
    throw new Error(`Could not acquire lock for ${file} after ${MAX_RETRIES} attempts.`);
}

function releaseLock(lockPath) {
    try {
        if (lockPath && fs.existsSync(lockPath)) {
            fs.rmdirSync(lockPath);
        }
    } catch (e) {
        console.error(`[Lock] Failed to release lock: ${e.message}`);
    }
}

async function safeUpdate(filePath, options) {
    const absPath = path.resolve(filePath);
    let lockPath = null;
    let attempts = 0;

    while (attempts < MAX_RETRIES) {
        attempts++;
        try {
            // 1. Acquire Lock
            lockPath = `${absPath}.lock`;
            try {
                if (fs.existsSync(lockPath)) {
                     const stats = fs.statSync(lockPath);
                     if (Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
                         console.warn(`[Lock] Pruning stale lock.`);
                         fs.rmdirSync(lockPath);
                     }
                }
                fs.mkdirSync(lockPath);
            } catch (e) {
                // Lock busy
                if (attempts === MAX_RETRIES) throw new Error("Lock acquisition timeout");
                const delay = RETRY_DELAY_MS + Math.floor(Math.random() * 100);
                await sleep(delay);
                continue;
            }

            // CRITICAL SECTION START
            
            // 2. Read fresh content
            if (!fs.existsSync(absPath)) {
                if (options.operation === 'create') {
                    fs.writeFileSync(absPath, '', 'utf8');
                } else {
                    throw new Error(`File not found: ${absPath}`);
                }
            }
            
            let content = fs.readFileSync(absPath, 'utf8');
            
            // 3. Apply changes
            let modified = false;

            if (options.operation === 'replace') {
                const search = (options.old !== undefined) ? options.old : options.search;
                const replace = (options.new !== undefined) ? options.new : options.replace;
                
                if (search === undefined || replace === undefined) throw new Error("Replace requires --old and --new");

                // Try exact match
                if (content.includes(search)) {
                    content = content.replace(search, replace);
                    modified = true;
                    console.log("Status: Exact match successful.");
                } else {
                    // Try normalized match
                    const normContent = normalize(content);
                    const normSearch = normalize(search);
                    if (normContent.includes(normSearch)) {
                         // This is tricky because replacing in normalized string doesn't map back to original easily.
                         // But if we just overwrite with normalized content, it might be okay for Markdown.
                         // For safety, let's just stick to "Exact Match" usually, or simple replacement.
                         // Actually, the original code normalized *content* then wrote it back.
                         // That changes line endings/whitespace for the WHOLE file.
                         // We will keep that behavior for consistency.
                         content = normalize(content).replace(normSearch, replace);
                         modified = true;
                         console.log("Status: Normalized match successful.");
                    } else {
                        console.error("Error: Text not found.");
                        process.exit(1);
                    }
                }
            } else if (options.operation === 'append') {
                if (!options.content) throw new Error("Append requires --content");
                if (!content.endsWith('\n') && content.length > 0) content += '\n';
                content += options.content + '\n';
                modified = true;
                console.log("Status: Append successful.");
            }

            // 4. Write back
            if (modified) {
                // Atomic Write via rename for extra safety
                const tempPath = `${absPath}.tmp`;
                fs.writeFileSync(tempPath, content, 'utf8');
                fs.renameSync(tempPath, absPath);
                console.log("Success: Memory file updated safely.");
            } else {
                console.log("No changes needed.");
            }
            
            // CRITICAL SECTION END
            return; // Done

        } catch (e) {
            console.error(`Attempt ${attempts} failed: ${e.message}`);
            if (attempts >= MAX_RETRIES) process.exit(1);
        } finally {
            if (lockPath) releaseLock(lockPath);
        }
    }
}

program
  .requiredOption('-f, --file <path>', 'Target file path', 'MEMORY.md')
  .requiredOption('-o, --operation <type>', 'Operation: replace | append | create')
  .option('--old <text>', 'Text to replace')
  .option('--new <text>', 'Replacement text')
  .option('--search <text>', 'Alias for --old')
  .option('--replace <text>', 'Alias for --new')
  .option('--content <text>', 'Content to append')
  .option('--content-file <path>', 'Read content from file')
  .option('--old-file <path>', 'Read old text from file')
  .option('--new-file <path>', 'Read new text from file')
  .parse(process.argv);

const options = program.opts();

// Handle file inputs
if (options.contentFile) options.content = fs.readFileSync(options.contentFile, 'utf8').trim();
if (options.oldFile) options.old = fs.readFileSync(options.oldFile, 'utf8').trim();
if (options.newFile) options.new = fs.readFileSync(options.newFile, 'utf8').trim();

safeUpdate(options.file, options);
