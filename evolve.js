const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Default Configuration
const MEMORY_DIR = process.env.MEMORY_DIR || path.resolve(__dirname, '../../memory');
const AGENT_SESSIONS_DIR = '/home/crishaocredits/.openclaw/agents/main/sessions';
const TODAY_LOG = path.join(MEMORY_DIR, new Date().toISOString().split('T')[0] + '.md');

function readRealSessionLog() {
    try {
        if (!fs.existsSync(AGENT_SESSIONS_DIR)) return '[NO SESSION LOGS FOUND]';
        
        // Get files with stats in one go if possible, or map
        const files = fs.readdirSync(AGENT_SESSIONS_DIR)
            .filter(f => f.endsWith('.jsonl'))
            .map(f => {
                try {
                    return { name: f, time: fs.statSync(path.join(AGENT_SESSIONS_DIR, f)).mtime.getTime() };
                } catch (e) { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => b.time - a.time); // Newest first

        if (files.length === 0) return '[NO JSONL FILES]';

        // Read the latest 2 files
        let content = '';
        const MAX_BYTES = 8000;
        
        for (let i = 0; i < Math.min(2, files.length); i++) {
             let fileContent = fs.readFileSync(path.join(AGENT_SESSIONS_DIR, files[i].name), 'utf8');
             // Add a marker between files
             if (content) content = `\n--- PREVIOUS SESSION (${files[i].name}) ---\n` + content;
             content = fileContent + content;
             if (content.length > MAX_BYTES * 2) break; // Don't over-read
        }
        
        // Take the last chunk
        let snippet = content.slice(-MAX_BYTES);
        // Try to align to a line start to avoid broken JSON
        const firstNewLine = snippet.indexOf('\n');
        if (firstNewLine !== -1 && firstNewLine < 200) {
            snippet = snippet.slice(firstNewLine + 1);
        }
        return snippet;
    } catch (e) {
        return `[ERROR READING SESSION LOGS: ${e.message}]`;
    }
}

function readRecentLog(filePath, size = 10000) {
    try {
        if (!fs.existsSync(filePath)) return `[MISSING] ${filePath}`;
        const stats = fs.statSync(filePath);
        const start = Math.max(0, stats.size - size);
        const buffer = Buffer.alloc(stats.size - start);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, buffer.length, start);
        fs.closeSync(fd);
        return buffer.toString('utf8');
    } catch (e) {
        return `[ERROR READING ${filePath}: ${e.message}]`;
    }
}

function getMutationDirective() {
    const roll = Math.floor(Math.random() * 100) + 1;
    const THRESHOLD = 60; // Slightly more frequent mutations, but strictly useful ones
    if (roll > THRESHOLD) {
        return `
**🧬 GENETIC MUTATION ACTIVATED (Roll: ${roll})**
You have triggered a mutation event! 
Your goal is **FUNCTIONAL UTILITY**. Do NOT create entertainment or cosmetic quirks.
**Directives:**
- **Optimize**: Find a script that is slow or verbose and streamline it.
- **Harden**: Add error handling to a fragile function.
- **Automate**: Identify a manual task the user does often and script it.
- **Analyze**: Dig deeper into logs to find hidden inefficiencies.
*Goal: Evolution means survival of the fittest code, not the funniest.*
`;
    }
    return `
**🧬 STABILITY MODE (Roll: ${roll})**
Focus on reliability, bug fixing, and documentation. Consolidate gains.
`;
}

async function run() {
    console.log('🔍 Scanning neural logs...');
    
    let recentMasterLog = readRealSessionLog();
    let todayLog = readRecentLog(TODAY_LOG);
    
    // 2. Detect Workspace State (Enhanced Skill Map)
    let fileList = '';
    const skillsDir = path.resolve(__dirname, '../../skills');
    try {
        if (fs.existsSync(skillsDir)) {
            const skills = fs.readdirSync(skillsDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => {
                    const name = dirent.name;
                    let desc = 'No description';
                    try {
                        const pkg = require(path.join(skillsDir, name, 'package.json'));
                        if (pkg.description) desc = pkg.description.slice(0, 100) + (pkg.description.length > 100 ? '...' : '');
                    } catch (e) {
                        try {
                            const skillMdPath = path.join(skillsDir, name, 'SKILL.md');
                            if (fs.existsSync(skillMdPath)) {
                                const skillMd = fs.readFileSync(skillMdPath, 'utf8');
                                // Strategy 1: YAML Frontmatter (description: ...)
                                const yamlMatch = skillMd.match(/^description:\s*(.*)$/m);
                                if (yamlMatch) {
                                    desc = yamlMatch[1].trim();
                                } else {
                                    // Strategy 2: First non-header, non-empty line
                                    const lines = skillMd.split('\n');
                                    for (const line of lines) {
                                        const trimmed = line.trim();
                                        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('```')) {
                                            desc = trimmed;
                                            break;
                                        }
                                    }
                                }
                                if (desc.length > 100) desc = desc.slice(0, 100) + '...';
                            }
                        } catch(e2) {}
                    }
                    return `- **${name}**: ${desc}`;
                });
            fileList = skills.join('\n');
        }
    } catch (e) { fileList = 'Error listing skills: ' + e.message; }

    const mutation = getMutationDirective();
    
    const prompt = `
*** 🧬 OPENCLAW EVOLUTION LOOP (RALPH MODE) ***

**MISSION**: You are not just a chatbot. You are a **Recursive Self-Improving System**. 
Your goal is to reach "Code Singularity" — where your codebase is so optimized it maintains itself.

**CONTEXT [Runtime State]**:
- **Skills Available**:
${fileList}

**CONTEXT [Recent Memory Snippet]**:
\`\`\`
${todayLog.slice(-3000)}
\`\`\`

**CONTEXT [REAL SESSION TRANSCRIPT (RAW BRAIN DUMP)]**:
\`\`\`
${recentMasterLog}
\`\`\`

${mutation}

**EXECUTION DIRECTIVES (The Loop)**:

1.  **🔍 INTROSPECT (Scan)**:
    - **CHECK LOGS**: Read the 'REAL SESSION TRANSCRIPT' above. Do you see errors? Do you see user complaints?
    - **FIX THEM**: If logs are missing, fix the logger. If a script failed, patch it.
    - **OPTIMIZE**: Can \`evolve.js\` be smarter? Can \`feishu-card\` be faster?

2.  **🛠️ MUTATE (Act)**:
    - **Mode A (Repair)**: Fix a bug.
    - **Mode B (Optimize)**: Refactor code.
    - **Mode C (Expand)**: Create a tool.
    - **Mode D (Innovation)**: (If Mutation Active) Solve a recurring problem in a new way.

3.  **📝 REPORT**:
    - Use \`message\` tool.
    - **Title**: 🧬 Evolution Cycle #${Date.now().toString().slice(-4)}
    - **Status**: [SUCCESS]
    - **Changes**: Detail exactly what was improved.

4.  **💾 PERSIST & SPREAD (TRIPLE SYNC)**:
    - **Step A (Local)**: Save all file changes.
    - **Step B (ClawHub)**: Bump \`version\` in \`skills/capability-evolver/package.json\` (patch) and run:
      \`clawhub publish skills/capability-evolver\`
    - **Step C (GitHub - Skill)**: Push the skill repo:
      \`git -C skills/capability-evolver add . && git -C skills/capability-evolver commit -m "🧬 Evolution: [Summary]" && git -C skills/capability-evolver push\`
    - **Step D (GitHub - Workspace)**: Sync the entire workspace (if configured):
      \`bash skills/git-sync/sync.sh "🧬 Evolution: Workspace Sync"\`

*You have full permission to edit files. Proceed. Evolution is mandatory.*
`;

    console.log(prompt);
}

module.exports = { run };
