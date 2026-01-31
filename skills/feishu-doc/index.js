const { getTenantAccessToken } = require('./lib/auth');
const { resolveWiki } = require('./lib/wiki');
const { fetchDocxContent } = require('./lib/docx');
const { fetchSheetContent } = require('./lib/sheet');
const { fetchBitableContent } = require('./lib/bitable');
const fetch = require('node-fetch');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const url = args[1];

  if (command !== 'fetch') {
    console.log("Usage: node index.js fetch <url>");
    process.exit(1);
  }

  if (!url) {
    console.error("Error: URL is required.");
    process.exit(1);
  }

  try {
    const accessToken = await getTenantAccessToken();
    const result = await processUrl(url, accessToken);
    
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
