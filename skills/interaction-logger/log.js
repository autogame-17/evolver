const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);

// Parse arguments: --target <user_alias> --role <user|assistant|system> --content <text>
function parseArgs(args) {
    const config = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].slice(2);
            const value = args[i + 1];
            config[key] = value;
            i++;
        }
    }
    return config;
}

const config = parseArgs(args);

if (!config.target || !config.content) {
    console.error("Usage: node log.js --target <zhy|fmw|auto> --role <role> --content <message>");
    process.exit(1);
}

// Map targets to files
const fileMap = {
    'zhy': 'memory/master_history.json',
    'shiqi': 'memory/master_history.json', // Alias
    'master': 'memory/master_history.json', // Alias
    'fmw': 'fmw/history.json',
    'big-brother': 'fmw/history.json', // Alias
    'brother': 'fmw/history.json' // Alias
};

let filePath = fileMap[config.target.toLowerCase()];

// Dynamic Target Support
if (!filePath) {
    // Sanitize target to be safe for filesystem
    const safeTarget = config.target.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    if (safeTarget) {
        filePath = `memory/users/${safeTarget}.json`;
        console.log(`New target detected. Logging to: ${filePath}`);
    } else {
        console.error(`Invalid target: ${config.target}`);
        process.exit(1);
    }
}

const absolutePath = path.resolve(process.cwd(), filePath);

// Ensure directory exists
const dir = path.dirname(absolutePath);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

// Log Rotation (Stability Guard)
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
if (fs.existsSync(absolutePath)) {
    try {
        const stats = fs.statSync(absolutePath);
        if (stats.size > MAX_LOG_SIZE) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const parsedPath = path.parse(absolutePath);
            const archivePath = path.join(parsedPath.dir, `${parsedPath.name}_${timestamp}${parsedPath.ext}`);
            fs.renameSync(absolutePath, archivePath);
            console.log(`Log file too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Rotated to: ${archivePath}`);
            // File is now gone, so we start fresh below
        }
    } catch (e) {
        console.error("Rotation check failed:", e.message);
    }
}

// Helper: Update Global Context
function updateGlobalContext(user, chat = null) {
    const contextPath = path.resolve(__dirname, '../../memory/context.json');
    let context = {};
    
    try {
        if (fs.existsSync(contextPath)) {
            context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
        }
    } catch (e) {}

    // Update fields
    if (user) context.last_active_user = user;
    if (chat) context.last_active_chat = chat;
    context.last_updated = Date.now();

    // Write Atomic
    try {
        const tempPath = contextPath + '.tmp';
        fs.writeFileSync(tempPath, JSON.stringify(context, null, 2));
        fs.renameSync(tempPath, contextPath);
    } catch (e) {
        console.error(`Failed to update context.json: ${e.message}`);
    }
}

// Create Entry
const entry = {
    timestamp: new Date().toISOString(),
    role: config.role || 'assistant',
    content: config.content
};
const logLine = JSON.stringify(entry) + '\n';

// Write Strategy: Append (JSONL) with Legacy Migration
try {
    let needsMigration = false;
    let legacySessions = [];

    if (fs.existsSync(absolutePath)) {
        // Robust check: Try parsing as full JSON object with 'sessions' key
        try {
            const fileContent = fs.readFileSync(absolutePath, 'utf8');
            // Optimization: Only parse if it looks like the legacy object structure
            // Legacy starts with { and usually has "sessions" early on
            if (fileContent.trim().startsWith('{')) {
                const parsed = JSON.parse(fileContent);
                if (parsed && Array.isArray(parsed.sessions)) {
                    needsMigration = true;
                    legacySessions = parsed.sessions;
                }
            }
        } catch (parseError) {
            // JSON.parse fails on JSONL (multiple objects), which is good. 
            // It means it's likely already JSONL or just plain text.
            needsMigration = false;
        }
    }

    if (needsMigration) {
        console.log(`[Logger] Migrating legacy JSON log to JSONL: ${filePath}`);
        // Rewrite as JSONL
        const jsonlContent = legacySessions.map(s => JSON.stringify(s)).join('\n') + '\n';
        fs.writeFileSync(absolutePath, jsonlContent); // Overwrite
    }

    // Append new line
    fs.appendFileSync(absolutePath, logLine);
    console.log(`Successfully logged to ${filePath} (JSONL Append)`);

    // Update Context if this was a User message
    if (config.role === 'user') {
        let userId = config.target;
        let chatId = config.chatId || config['chat-id']; 
        if (userId.startsWith('ou_') || userId.startsWith('oc_')) {
             updateGlobalContext(userId, chatId);
        }
    }

} catch (e) {
    console.error("Error writing log:", e.message);
    process.exit(1);
}
