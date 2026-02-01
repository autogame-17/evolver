const { getTenantAccessToken } = require('./lib/auth');
const { resolveWiki } = require('./lib/wiki');
const { fetchDocxContent } = require('./lib/docx');
const { fetchSheetContent } = require('./lib/sheet');
const { fetchBitableContent } = require('./lib/bitable');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const url = args[1];
  const noCache = args.includes('--no-cache');

  if (command !== 'fetch') {
    console.log("Usage: node index.js fetch <url> [--no-cache]");
    process.exit(1);
  }

  if (!url) {
    console.error("Error: URL is required.");
    process.exit(1);
  }

  try {
    // Ensure cache dir exists
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    // Attempt cache read
    // We need to parse the token first to get the cache key, but that logic is inside processUrl.
    // Let's refactor slightly to extract token first? 
    // Actually, let's just use a hash of the full URL for simplicity and robustness.
    const cacheKey = Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);

    if (!noCache && fs.existsSync(cacheFile)) {
      const stats = fs.statSync(cacheFile);
      const age = Date.now() - stats.mtimeMs;
      
      if (age < CACHE_TTL_MS) {
        // Cache hit
        const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        // Add a debug note (optional, but good for transparency)
        cachedData._source = "cache";
        cachedData._cachedAt = stats.mtime;
        console.log(JSON.stringify(cachedData, null, 2));
        return;
      }
    }

    const accessToken = await getTenantAccessToken();
    const result = await processUrl(url, accessToken);
    
    // Save to cache
    if (result && !result.error) {
       fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));
    }

    // Output JSON result
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

async function processUrl(url, accessToken) {
  // Regex to detect type and token
  // Wiki: /wiki/<token>
  // Docx: /docx/<token>
  // Doc: /docs/<token>
  // Sheets: /sheets/<token>
  // Bitable: /base/<token>

  const wikiRegex = /\/wiki\/([a-zA-Z0-9]+)/;
  const docxRegex = /\/docx\/([a-zA-Z0-9]+)/;
  const docRegex = /\/docs\/([a-zA-Z0-9]+)/;
  const sheetRegex = /\/sheets\/([a-zA-Z0-9]+)/;
  const bitableRegex = /\/base\/([a-zA-Z0-9]+)/;

  let token = '';
  let type = '';

  if (wikiRegex.test(url)) {
    token = url.match(wikiRegex)[1];
    type = 'wiki';
  } else if (docxRegex.test(url)) {
    token = url.match(docxRegex)[1];
    type = 'docx';
  } else if (docRegex.test(url)) {
    token = url.match(docRegex)[1];
    type = 'doc';
  } else if (sheetRegex.test(url)) {
    token = url.match(sheetRegex)[1];
    type = 'sheet';
  } else if (bitableRegex.test(url)) {
    token = url.match(bitableRegex)[1];
    type = 'bitable';
  } else {
    throw new Error("Unsupported Feishu URL format.");
  }

  // If Wiki, resolve to real object
  if (type === 'wiki') {
    const wikiInfo = await resolveWiki(token, accessToken);
    if (wikiInfo) {
      token = wikiInfo.obj_token;
      type = wikiInfo.obj_type;
      console.error(`Wiki resolved to: ${type} (${token})`); // Log to stderr to not pollute JSON output
    } else {
      throw new Error("Could not resolve Wiki info.");
    }
  }

  // Fetch content based on type
  if (type === 'docx') {
    return await fetchDocxContent(token, accessToken);
  } else if (type === 'doc') {
    return { error: "Legacy 'doc' format not fully implemented yet." };
  } else if (type === 'sheet') {
    return await fetchSheetContent(token, accessToken);
  } else if (type === 'bitable') {
    return await fetchBitableContent(token, accessToken);
  } else {
    return { error: `Unknown type: ${type}` };
  }
}

if (require.main === module) {
  main();
}
