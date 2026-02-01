#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// AI Integration
let GoogleGenerativeAI;
try {
    GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch (e) {
    try {
        // Fallback to sticker-analyzer's copy
        GoogleGenerativeAI = require(path.resolve(__dirname, '../sticker-analyzer/node_modules/@google/generative-ai')).GoogleGenerativeAI;
    } catch (e2) {}
}

async function getAiSummary(messages) {
    if (!GoogleGenerativeAI || !process.env.GEMINI_API_KEY) return null;
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        
        const transcript = messages.map(m => {
            const sender = (m.sender || 'u').replace(/^ou_/, '').slice(0, 6);
            let text = m.content;
            if (typeof text === 'object') text = JSON.stringify(text);
            return `${sender}: ${text}`;
        }).slice(-150).join('\n'); // Increased context

        const prompt = `Analyze this chat log (last 150 msgs).
Output a Markdown summary:
1. **🔍 Topics**: Bullet points.
2. **💡 Intel**: Key insights/decisions/drama.
3. **🎭 Vibe**: 1 sentence sentiment.

Log:
${transcript}`;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        return `_AI Summary Failed: ${e.message}_`;
    }
}


// Try to load GenAI
let GoogleGenerativeAI;
try {
    GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch (e) {
    try {
        // Fallback to sticker-analyzer's copy (Workspace Optimization)
        GoogleGenerativeAI = require(path.resolve(__dirname, '../sticker-analyzer/node_modules/@google/generative-ai')).GoogleGenerativeAI;
    } catch (e2) {
        // console.warn('[Intel] GenAI library not found. Skipping AI summary.');
    }
}

program
    .option('-i, --input <file>', 'Input JSON file (from fetch.js history)')
    .option('-o, --output <file>', 'Output Markdown file')
    .option('-v, --verbose', 'Enable verbose logging')
    .parse(process.argv);

const options = program.opts();

function log(msg) {
    if (options.verbose) console.error(`[INFO] ${msg}`);
}

async function getAiSummary(messages) {
    if (!GoogleGenerativeAI || !process.env.GEMINI_API_KEY) return null;

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Format messages for prompt (Compact)
        const transcript = messages.map(m => {
            const sender = (m.sender || 'unknown').replace(/^ou_/, '').slice(0, 6);
            let text = m.content;
            if (typeof text === 'object') text = JSON.stringify(text);
            return `${sender}: ${text}`;
        }).slice(-100).join('\n'); // Last 100 messages to fit context

        const prompt = `Analyze this group chat transcript.
Output a Markdown summary with:
1. **🔍 Key Topics**: Bullet points of what was discussed.
2. **💡 Insights**: Any interesting ideas, decisions, or gossip.
3. **🎭 Sentiment**: Overall mood (1 sentence).

Transcript:
${transcript}`;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        console.error(`[Intel] AI Summary failed: ${e.message}`);
        return null;
    }
}

async function main() {
    // Read Input
    let messages = [];
    try {
        let inputData;
        if (options.input) {
            log(`Reading from file: ${options.input}`);
            inputData = fs.readFileSync(options.input, 'utf8');
        } else {
            // Try reading from stdin
            if (process.stdin.isTTY) {
                 // Interactive mode with no input?
                 // Wait, we need input.
            } else {
                inputData = fs.readFileSync(0, 'utf8');
            }
        }
        
        if (inputData) {
            messages = JSON.parse(inputData);
        }
    } catch (e) {
        console.error('Error reading input:', e.message);
        process.exit(1);
    }

    if (!Array.isArray(messages) || messages.length === 0) {
        if (options.verbose) console.log("No messages to report.");
        // We can't exit here if we want to support empty report, but usually empty means nothing to do.
        // Let's exit gracefully.
        process.exit(0);
    }

    // ... (Analysis Logic - Kept similar but inside main) ...
    // Note: I need to preserve the existing analysis logic.
    // To do this via 'edit' tool is hard if I replace the whole file.
    // I should insert the AI function and call it.
    
    // RE-PLAN: Use 'edit' to insert the function and call it, rather than rewriting the whole file.
}

// Since I can't rewrite the whole file easily without reading it all and pasting (which hits token limits),
// I will use 'edit' to:
// 1. Add requires and getAiSummary function at top.
// 2. Change the end of the script to be async and call the summary.

// ...

    .option('-o, --output <file>', 'Output Markdown file')
    .option('-v, --verbose', 'Enable verbose logging')
    .parse(process.argv);

const options = program.opts();

function log(msg) {
    if (options.verbose) console.error(`[INFO] ${msg}`);
}

// Read Input
let messages = [];
try {
    let inputData;
    if (options.input) {
        log(`Reading from file: ${options.input}`);
        inputData = fs.readFileSync(options.input, 'utf8');
    } else {
        // Try reading from stdin if no input file provided
        try {
            inputData = fs.readFileSync(0, 'utf8');
        } catch (e) {
            console.error('Error: No input file specified and no stdin provided.');
            process.exit(1);
        }
    }
    
    if (!inputData) {
         console.error('Error: Empty input.');
         process.exit(1);
    }

    messages = JSON.parse(inputData);
} catch (e) {
    console.error('Error reading input:', e.message);
    process.exit(1);
}

if (!Array.isArray(messages)) {
    console.error('Error: Input is not an array.');
    process.exit(1);
}

// Analysis
const totalMessages = messages.length;
if (totalMessages === 0) {
    console.log("No messages to report.");
    process.exit(0);
}

const users = {};
const msgTypes = {};
const hourlyActivity = new Array(24).fill(0);

// Sort messages by time just in case, handle missing time safely
messages.sort((a, b) => {
    const tA = a.time ? new Date(a.time).getTime() : 0;
    const tB = b.time ? new Date(b.time).getTime() : 0;
    return tA - tB;
});

const timeStart = messages[0]?.time || 'Unknown';
const timeEnd = messages[messages.length - 1]?.time || 'Unknown';

messages.forEach(msg => {
    const sender = msg.sender || 'unknown_user';
    users[sender] = (users[sender] || 0) + 1;

    // Type Analysis
    const type = msg.type || 'text';
    msgTypes[type] = (msgTypes[type] || 0) + 1;

    // Hourly Analysis
    if (msg.time) {
        try {
            const hour = new Date(msg.time).getHours();
            if (hour >= 0 && hour < 24) hourlyActivity[hour]++;
        } catch (e) {}
    }
});

const sortedUsers = Object.entries(users).sort((a, b) => b[1] - a[1]);
const topUser = sortedUsers[0];

// ASCII Bar Chart Helper
function generateBar(count, max, width = 20) {
    if (max === 0) return '';
    const len = Math.round((count / max) * width);
    return '█'.repeat(len) + '░'.repeat(width - len);
}

// Markdown Generation
let md = `# 🕵️‍♀️ Group Intel Report\n\n`;
md += `**Date**: ${new Date().toISOString().split('T')[0]}\n`;
md += `**Messages**: ${totalMessages}\n`;
md += `**Time Range**: ${timeStart} - ${timeEnd}\n`;
md += `**Top Agent**: ${topUser ? topUser[0].replace(/^ou_/, '').substring(0, 8) : 'None'} (${topUser ? topUser[1] : 0} msgs)\n\n`;

md += `## 🏆 Activity Ranking\n\n`;
md += `| User | Msgs | Activity |\n`;
md += `|---|---|---|\n`;
const maxMsgs = sortedUsers.length > 0 ? sortedUsers[0][1] : 0;
sortedUsers.slice(0, 10).forEach(([user, count]) => {
    const name = user.replace(/^ou_/, '').substring(0, 8);
    md += `| ${name} | ${count} | ${generateBar(count, maxMsgs, 10)} |\n`;
});
md += `\n`;

md += `## 📈 Temporal Analysis (Peak Hours)\n\n`;
const maxHourly = Math.max(...hourlyActivity);
md += `\`\`\`\n`; // Code block for alignment
for (let i = 0; i < 24; i++) {
    if (hourlyActivity[i] > 0) {
        const hourStr = i.toString().padStart(2, '0') + ':00';
        md += `${hourStr} | ${generateBar(hourlyActivity[i], maxHourly, 15)} (${hourlyActivity[i]})\n`;
    }
}
md += `\`\`\`\n\n`;

md += `## 🧩 Content Breakdown\n\n`;
Object.entries(msgTypes).forEach(([type, count]) => {
    md += `- **${type}**: ${count}\n`;
});
md += `\n`;

md += `## 📊 Activity Log\n\n`;
let lastSender = null;
let lastTime = null;

messages.forEach(msg => {
    let content = msg.content;
    let type = msg.type || 'text';

    if (typeof content === 'object') {
        if (content.text) content = content.text;
        else if (content.image_key) {
            content = `[Image: ${content.image_key}]`;
            type = 'image';
        }
        else content = JSON.stringify(content);
    } else if (content === undefined || content === null) {
        content = '(empty)';
    }
    
    // Clean up sender ID (remove ou_)
    const senderRaw = msg.sender || 'unknown';
    const cleanSender = senderRaw.replace(/^ou_/, '').substring(0, 8);
    
    let cleanTime = 'Unknown';
    if (msg.time) {
        try {
            cleanTime = new Date(msg.time).toISOString().split('T')[1].split('.')[0];
        } catch (e) {
            cleanTime = 'Invalid Date';
        }
    }
    
    // Grouping check: if same user as last message, don't repeat header (unless time gap > 5 min)
    const isSameUser = lastSender === cleanSender;
    const timeGap = lastTime && msg.time ? (new Date(msg.time) - new Date(lastTime)) / 1000 / 60 : 100; // minutes
    
    if (isSameUser && timeGap < 5) {
        md += `> ↳ ${content}\n\n`;
    } else {
        md += `> **${cleanSender}** (${cleanTime}): ${content}\n\n`;
    }

    lastSender = cleanSender;
    lastTime = msg.time;
});

// AI Summary Injection
getAiSummary(messages).then(summary => {
    if (summary) {
        const headerEnd = md.indexOf('\n\n') + 2;
        md = md.slice(0, headerEnd) + `## 🧠 AI Intelligence Brief\n${summary}\n\n` + md.slice(headerEnd);
    }

    // Output
    try {
        if (options.output) {
            fs.writeFileSync(options.output, md);
            log(`Report generated: ${options.output}`);
        } else {
            console.log(md);
        }
    } catch (e) {
        console.error(`Error writing output: ${e.message}`);
        process.exit(1);
    }
});
