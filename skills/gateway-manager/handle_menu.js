const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read payload from stdin
let payload = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
    payload += chunk;
});

process.stdin.on('end', () => {
    try {
        if (!payload.trim()) {
            console.log('No payload received');
            return;
        }
        const data = JSON.parse(payload);
        
        // Handle Feishu Event Structure
        const eventData = data.event || data;
        const eventKey = eventData.event_key;
        const userId = data.header?.sender?.sender_id?.user_id || data.sender?.sender_id?.user_id || 'unknown';

        // Log to file so Agent can see it
        const logEntry = {
            timestamp: new Date().toISOString(),
            eventKey,
            userId,
            raw: data // Optional: keep raw for debug if needed, or trim
        };
        
        const logPath = path.join(__dirname, '../../memory/menu_events.json');
        
        let logs = [];
        if (fs.existsSync(logPath)) {
            try {
                logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
            } catch(e) {}
        }
        logs.push(logEntry);
        // Keep last 50 events
        if (logs.length > 50) logs = logs.slice(-50);
        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

        console.log(`[MenuHandler] Processing event_key: ${eventKey} from user: ${userId}`);

        // Security Check
        const MASTER_ID = 'ou_cdc63fe05e88c580aedead04d851fc04';
        if (eventKey === 'restart_gateway') {
            if (userId !== MASTER_ID) {
                console.error(`[Security] UNAUTHORIZED RESTART ATTEMPT by ${userId}`);
                return;
            }
            console.log('🚀 RESTART COMMAND VERIFIED. INITIATING RESTART...');
            try {
                execSync('openclaw gateway restart', { stdio: 'inherit' });
            } catch (err) {
                console.error('Failed to restart gateway:', err.message);
            }
        } else {
            console.log(`[MenuHandler] Ignored event_key: ${eventKey}`);
        }
    } catch (e) {
        console.error('[MenuHandler] Error:', e.message);
    }
});
