const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { program } = require('commander');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Configuration
const CACHE_DIR = path.resolve(__dirname, '../../memory/arxiv_cache');
const STATE_FILE = path.resolve(__dirname, '../../memory/arxiv_watch_state.json');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

program
    .requiredOption('-q, --query <string>', 'Search query (e.g. "cat:cs.AI AND ti:agent")')
    .option('-l, --limit <number>', 'Max results', '10')
    .option('-w, --watch', 'Enable watch mode (stateful tracking)', false)
    .option('--json', 'Output JSON', false)
    .option('--days <number>', 'Filter by last N days')
    .option('--notify <target>', 'Send Feishu notification to target ID')
    .parse(process.argv);

const opts = program.opts();
const QUERY = opts.query;
const MAX_RESULTS = parseInt(opts.limit);
const WATCH_MODE = opts.watch;
const OUTPUT_FORMAT = opts.json ? 'json' : 'markdown';
const DAYS_FILTER = opts.days ? parseInt(opts.days) : null;
const NOTIFY_TARGET = opts.notify;

// --- Helpers ---

function getCacheKey(query, max) {
    return crypto.createHash('md5').update(`${query}_${max}`).digest('hex');
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch(e) {}
    return {};
}

function saveState(state) {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch(e) {}
}

async function fetchArxiv(query, max) {
    const url = `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=${max}&sortBy=submittedDate&sortOrder=descending`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
}

function sendNotification(papers, target) {
    if (!papers.length) return;
    const { spawnSync } = require('child_process');
    const script = path.resolve(__dirname, '../feishu-card/send.js');
    
    // Construct Card Text
    const list = papers.map(p => `- [${p.id}] **${p.title}**`).join('\n');
    const text = `Found ${papers.length} new papers for query: \`${QUERY}\`\n\n${list}`;
    
    spawnSync('node', [script, '--target', target, '--title', 'ArXiv Watcher', '--color', 'blue', '--text', text], { stdio: 'ignore' });
}

// --- Main ---

async function main() {
    try {
        if (!WATCH_MODE && OUTPUT_FORMAT !== 'json') console.error(`[ArXiv] Searching for: "${QUERY}" (limit: ${MAX_RESULTS})`);
        
        // Cache Logic
        const CACHE_TTL = 15 * 60 * 1000; // 15 min
        const cacheKey = getCacheKey(QUERY, MAX_RESULTS);
        const cacheFile = path.join(CACHE_DIR, `${cacheKey}.xml`);
        let xml = null;

        // 1. Try Cache
        if (fs.existsSync(cacheFile)) {
            const stats = fs.statSync(cacheFile);
            if (Date.now() - stats.mtimeMs < CACHE_TTL) {
                if (!WATCH_MODE && OUTPUT_FORMAT !== 'json') console.error(`[ArXiv] Cache Hit (${cacheKey}).`);
                xml = fs.readFileSync(cacheFile, 'utf8');
            }
        }

        // 2. Fetch if missing
        if (!xml) {
             await new Promise(r => setTimeout(r, Math.random() * 2000)); // Jitter
             xml = await fetchArxiv(QUERY, MAX_RESULTS);
             try { fs.writeFileSync(cacheFile, xml); } catch(e) {}
             if (!WATCH_MODE && OUTPUT_FORMAT !== 'json') console.error(`[ArXiv] Cache Updated.`);
        }

        // Parsing (Simple Regex approach to avoid deps)
        const entries = xml.split('<entry>');
        entries.shift(); // Remove header

        let papers = entries.map(entry => {
            const idMatch = /<id>(.*?)<\/id>/.exec(entry);
            const publishedMatch = /<published>(.*?)<\/published>/.exec(entry);
            const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry);
            const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry);
            
            const categoryMatch = /<arxiv:primary_category[^>]*term=["']([^"']+)["']/.exec(entry) || /<category[^>]*term=["']([^"']+)["']/.exec(entry);
            const category = categoryMatch ? categoryMatch[1] : 'CS';

            const authorMatches = [];
            const authorRegex = /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g;
            let authorMatch;
            while ((authorMatch = authorRegex.exec(entry)) !== null) {
                authorMatches.push(authorMatch[1]);
            }

            let pdfLink = null;
            const linkRegex = /<link\s+([^>]*)\/?>/g;
            let linkMatch;
            while ((linkMatch = linkRegex.exec(entry)) !== null) {
                const attrs = linkMatch[1];
                const hrefMatch = /href=["']([^"']*)["']/.exec(attrs);
                const titleMatch = /title=["']([^"']*)["']/.exec(attrs);
                const href = hrefMatch ? hrefMatch[1] : null;
                const title = titleMatch ? titleMatch[1] : null;
                if (href && title === 'pdf') {
                    pdfLink = href;
                    break;
                }
            }

            // Clean ID (http://arxiv.org/abs/2101.12345v1 -> 2101.12345v1)
            let id = idMatch ? idMatch[1] : null;
            if (id) {
                const parts = id.split('/');
                id = parts[parts.length - 1];
            }

            return {
                id: id,
                published: publishedMatch ? publishedMatch[1] : null,
                title: titleMatch ? cleanText(titleMatch[1]) : 'No Title',
                category: category,
                authors: authorMatches,
                summary: summaryMatch ? cleanText(summaryMatch[1]) : '',
                pdf_link: pdfLink
            };
        });

        // Date Filtering
        if (DAYS_FILTER) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - DAYS_FILTER);
            const initialCount = papers.length;
            papers = papers.filter(p => new Date(p.published) >= cutoff);
            if (!WATCH_MODE && OUTPUT_FORMAT !== 'json') console.error(`[ArXiv] Date Filter: Kept ${papers.length}/${initialCount} papers (Last ${DAYS_FILTER} days).`);
        }

        // Watch Mode Logic
        if (WATCH_MODE) {
            const state = loadState();
            if (!state[QUERY] || typeof state[QUERY] !== 'object') {
                state[QUERY] = { seenIds: [] };
            }
            
            const seenIds = new Set(state[QUERY].seenIds || []);
            const newPapers = papers.filter(p => p.id && !seenIds.has(p.id));
            
            if (newPapers.length > 0) {
                newPapers.forEach(p => seenIds.add(p.id));
                const updatedIds = Array.from(seenIds);
                // Keep last 500 IDs
                if (updatedIds.length > 500) updatedIds.splice(0, updatedIds.length - 500);
                
                state[QUERY] = { seenIds: updatedIds, lastUpdated: new Date().toISOString() };
                saveState(state);
                
                if (!OUTPUT_FORMAT === 'json') console.error(`[ArXiv] Watch Mode: Found ${newPapers.length} new papers.`);
                
                if (NOTIFY_TARGET) {
                    sendNotification(newPapers, NOTIFY_TARGET);
                }
                papers = newPapers; // Output only new papers
            } else {
                 if (OUTPUT_FORMAT !== 'json') console.error(`[ArXiv] Watch Mode: No new papers found.`);
                 papers = [];
            }
        }

        // Output
        if (papers.length > 0) {
            if (OUTPUT_FORMAT === 'markdown') {
                const md = papers.map(p => {
                    const auth = p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' et al.' : '');
                    const date = p.published ? p.published.split('T')[0] : '';
                    return `- **${p.title}**\n  *${auth}* | \`${p.category}\` | ${date} | [PDF](${p.pdf_link || '#'})\n  > ${p.summary.slice(0, 300)}...`;
                }).join('\n\n');
                console.log(md);
            } else {
                console.log(JSON.stringify(papers, null, 2));
            }
        } else {
            if (OUTPUT_FORMAT === 'markdown') console.log("_No results found._");
            else console.log("[]");
        }

    } catch (error) {
        console.error("Error fetching ArXiv data:", error);
        process.exit(1);
    }
}

main();
