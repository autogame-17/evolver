const fs = require('fs');
const path = require('path');
const os = require('os');

// Config
const AGENT_SESSIONS_DIR = path.join(os.homedir(), '.openclaw/agents/main/sessions');
const HISTORY_FILE = path.resolve(__dirname, '../../memory/master_history.json');
const STATE_FILE = path.join(__dirname, 'sync_state.json');

// Helper: Get latest log file
function getLatestSessionFile() {
    if (!fs.existsSync(AGENT_SESSIONS_DIR)) return null;
    const files = fs.readdirSync(AGENT_SESSIONS_DIR)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ name: f, time: fs.statSync(path.join(AGENT_SESSIONS_DIR, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);
    return files.length ? path.join(AGENT_SESSIONS_DIR, files[0].name) : null;
}

// Helper: Read state
function getState() {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { lastProcessedBytes: 0, lastFile: '' };
}

// Helper: Save state
function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Helper: Append to history
function appendToHistory(entries) {
    if (entries.length === 0) return;

    // 1. Check file format / Migrate if needed (Align with log.js JSONL strategy)
    let needsMigration = false;
    let legacySessions = [];
    
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            // Optimization: Read first 100 bytes to check signature
            const fd = fs.openSync(HISTORY_FILE, 'r');
            const buffer = Buffer.alloc(100);
            const bytesRead = fs.readSync(fd, buffer, 0, 100, 0);
            fs.closeSync(fd);
            
            const startContent = buffer.toString('utf8', 0, bytesRead).trim();
            
            // Legacy JSON format usually starts with {"sessions": [ ...
            if (startContent.startsWith('{') && startContent.includes('"sessions"')) {
                const fullContent = fs.readFileSync(HISTORY_FILE, 'utf8');
                try {
                    const parsed = JSON.parse(fullContent);
                    if (parsed && Array.isArray(parsed.sessions)) {
                        needsMigration = true;
                        legacySessions = parsed.sessions;
                    }
                } catch (e) {
                    // Not valid JSON, likely already JSONL or mixed. Assume JSONL.
                }
            }
        } catch(e) {}
    }

    if (needsMigration) {
        console.log(`[Sync] Migrating legacy JSON to JSONL: ${HISTORY_FILE}`);
        const jsonl = legacySessions.map(s => JSON.stringify(s)).join('\n') + '\n';
        fs.writeFileSync(HISTORY_FILE, jsonl);
    }

    // 2. Append new entries as JSONL
    const newContent = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFileSync(HISTORY_FILE, newContent);
}

async function processFile(filePath, startByte, onEntries) {
    try {
        const stats = fs.statSync(filePath);
        if (stats.size <= startByte) return stats.size;

        const stream = fs.createReadStream(filePath, { start: startByte });
        const chunks = [];
        
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        
        // Combine chunks into one Buffer
        const buffer = Buffer.concat(chunks);
        
        // Find the last newline byte (0x0A)
        let lastNewlineIndex = -1;
        for (let i = buffer.length - 1; i >= 0; i--) {
            if (buffer[i] === 0x0A) {
                lastNewlineIndex = i;
                break;
            }
        }

        // If no newline, we can't process any complete JSON lines yet.
        // Wait for more data (don't advance pointer).
        if (lastNewlineIndex === -1) {
            return startByte;
        }

        // Slice up to the last newline (inclusive)
        const processableBuffer = buffer.subarray(0, lastNewlineIndex + 1);
        const contentStr = processableBuffer.toString('utf8');
        
        const lines = contentStr.split('\n');
        const newEntries = [];

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const event = JSON.parse(line);
                if (event.type === 'message' && event.message) {
                    const msg = event.message;
                    let content = '';
                    if (typeof msg.content === 'string') content = msg.content;
                    else if (Array.isArray(msg.content)) {
                        content = msg.content.map(c => c.text || '').join('');
                    }
                    
                    if (content) {
                        newEntries.push({
                            timestamp: event.timestamp || new Date().toISOString(),
                            role: msg.role,
                            content: content
                        });
                    }
                }
            } catch (e) {
                // Ignore parse errors (partial lines)
            }
        }

        if (newEntries.length > 0) {
            onEntries(newEntries);
        }
        
        // Calculate new offset based on BYTES processed
        // startByte + length of processed buffer
        return startByte + processableBuffer.length;
        
    } catch (e) {
        console.error(`[Sync] Error reading ${filePath}: ${e.message}`);
        return startByte; // Don't advance on error
    }
}

async function run() {
    const sessionFile = getLatestSessionFile();
    if (!sessionFile) return;

    const state = getState();

    // 1. Handle File Rotation (Finish old file if it exists)
    if (state.lastFile && state.lastFile !== sessionFile) {
        if (fs.existsSync(state.lastFile)) {
             // console.log(`[Sync] Detected rotation. Finishing: ${path.basename(state.lastFile)}`);
             await processFile(state.lastFile, state.lastProcessedBytes, (entries) => {
                 appendToHistory(entries);
                 console.log(`[Sync] Recovered ${entries.length} messages from rotated log.`);
             });
        }
        // Reset for new file
        state.lastFile = sessionFile;
        state.lastProcessedBytes = 0;
    }
    
    // 2. Initialize state if missing
    if (!state.lastFile) {
        state.lastFile = sessionFile;
        state.lastProcessedBytes = 0;
    }

    // 3. Process Current File
    const newSize = await processFile(sessionFile, state.lastProcessedBytes, (entries) => {
        appendToHistory(entries);
        console.log(`Synced ${entries.length} messages.`);
    });

    state.lastProcessedBytes = newSize;
    saveState(state);
}

run();
