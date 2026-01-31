const fs = require('fs');
const path = require('path');

const LOG_FILE = '/home/crishaocredits/.openclaw/workspace/lmx/history.json';

// Helper to log messages
function logInteraction(role, content, timestamp) {
    let history = [];
    try {
        if (fs.existsSync(LOG_FILE)) {
            const data = fs.readFileSync(LOG_FILE, 'utf8');
            if (data.trim()) {
                try {
                    history = JSON.parse(data);
                } catch (parseError) {
                    console.error('Failed to parse existing history, starting fresh:', parseError);
                    history = [];
                }
            }
        }
    } catch (e) {
        console.error('Failed to read history:', e);
    }

    history.push({
        role,
        content,
        timestamp: timestamp || new Date().toISOString()
    });

    try {
        fs.writeFileSync(LOG_FILE, JSON.stringify(history, null, 2));
    } catch (e) {
        console.error('Failed to write history:', e);
    }
}

// Just a utility script to invoke when needed
const args = process.argv.slice(2);
if (args.length >= 2) {
    logInteraction(args[0], args[1]);
}
