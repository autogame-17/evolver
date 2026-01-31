const fs = require('fs');
const path = require('path');
const { program } = require('commander');

function normalize(text) {
    // Normalize line endings to LF and strip trailing whitespace per line
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(line => line.trimEnd()).join('\n');
}

function safeUpdate(filePath, options) {
    const absPath = path.resolve(filePath);
    
    // 1. Read fresh content (Atomic Read start)
    if (!fs.existsSync(absPath)) {
        console.error(`File not found: ${absPath}`);
        process.exit(1);
    }
    
    let content = fs.readFileSync(absPath, 'utf8');
    let originalContent = content;

    // 2. Normalize (Strategy C)
    content = normalize(content);

    // 3. Apply changes (Strategy B: In-memory modify)
    let modified = false;

    if (options.operation === 'replace') {
        const search = options.old ? options.old : options.search; // Alias
        const replace = options.new ? options.new : options.replace; // Alias
        
        if (!search || replace === undefined) {
            console.error("Replace operation requires --old/--search and --new/--replace");
            process.exit(1);
        }

        // Try exact match first (on normalized content)
        if (content.includes(search)) {
            content = content.replace(search, replace);
            modified = true;
            console.log("Status: Exact match successful.");
        } else {
            // Fallback: Normalized fuzzy search? 
            // For now, let's treat "old text not found" as a failure trigger for "Automatic Downgrade" logic
            // But wait, if I'm the script, I AM the downgrade mechanism if I supply regex.
            
            // Try normalizing the search string too
            const normSearch = normalize(search);
            if (content.includes(normSearch)) {
                content = content.replace(normSearch, replace);
                modified = true;
                console.log("Status: Normalized match successful.");
            } else {
                console.error("Error: Could not find target text even after normalization.");
                console.log("Diagnostics - Target text start:", search.substring(0, 50));
                console.log("Diagnostics - File content preview:", content.substring(0, 100));
                process.exit(1);
            }
        }
    } else if (options.operation === 'append') {
        if (!options.content) {
            console.error("Append requires --content");
            process.exit(1);
        }
        // Ensure ends with newline before appending
        if (!content.endsWith('\n')) content += '\n';
        content += options.content + '\n';
        modified = true;
        console.log("Status: Append successful.");
    }

    // 4. Write back (Strategy B: Atomic Write)
    if (modified) {
        // Simple check: did it actually change?
        if (content === normalize(originalContent)) {
             console.log("Warning: Content unchanged after operation.");
        }
        
        try {
            fs.writeFileSync(absPath, content, 'utf8');
            console.log("Success: Memory file updated safely.");
        } catch (e) {
            console.error(`Write failed: ${e.message}`);
            // Strategy D: Retry logic could go here, but fs.writeFileSync is blocking and atomic-ish on many OSs for replace
            process.exit(1);
        }
    } else {
        console.log("No changes applied.");
    }
}

program
  .requiredOption('-f, --file <path>', 'Target file path', 'MEMORY.md')
  .requiredOption('-o, --operation <type>', 'Operation: replace | append')
  .option('--old <text>', 'Text to replace (exact or normalized)')
  .option('--new <text>', 'Replacement text')
  .option('--search <text>', 'Alias for --old')
  .option('--replace <text>', 'Alias for --new')
  .option('--content <text>', 'Content to append')
  .option('--content-file <path>', 'Read content from file')
  .parse(process.argv);

const options = program.opts();

// Handle file input for content args to avoid shell escaping hell
if (options.contentFile) {
    try {
        options.content = fs.readFileSync(options.contentFile, 'utf8');
    } catch (e) {
        console.error(`Failed to read content file: ${e.message}`);
        process.exit(1);
    }
}

safeUpdate(options.file, options);
