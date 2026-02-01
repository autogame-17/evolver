const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const https = require('https');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const TOKEN_CACHE_FILE = path.resolve(__dirname, '../../memory/feishu_token.json');

program
  .option('--source <string>', 'Source Chat ID')
  .option('--target <string>', 'Target Receiver ID')
  .option('--limit <number>', 'Number of messages', 20)
  .parse(process.argv);

const options = program.opts();

async function post(url, data, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function get(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function getToken() {
  try {
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
      if (cached.expire > Date.now() / 1000 + 300) return cached.token;
    }
  } catch (e) {}

  const res = await post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: APP_ID,
    app_secret: APP_SECRET
  });
  
  if (!res.tenant_access_token) throw new Error(`Token fetch failed: ${JSON.stringify(res)}`);

  try {
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({
      token: res.tenant_access_token,
      expire: Date.now() / 1000 + res.expire
    }));
  } catch (e) {}

  return res.tenant_access_token;
}

async function main() {
  if (!options.source || !options.target) {
    console.error("Missing args: --source, --target");
    process.exit(1);
  }

  try {
    const token = await getToken();
    console.log(`Fetching last ${options.limit} messages from ${options.source}...`);

    // 1. List messages
    // Note: page_size max is 50 usually.
    const listUrl = `https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${options.source}&page_size=${options.limit}&sort_type=ByCreateTimeDesc`;
    const listRes = await get(listUrl, token);

    if (listRes.code !== 0) {
      console.error("Failed to list messages:", listRes);
      process.exit(1);
    }

    if (!listRes.data.items || listRes.data.items.length === 0) {
      console.log("No messages found.");
      return;
    }

    // Messages come in Descending order (newest first).
    // Merge Forward usually looks better in Chronological order (Oldest -> Newest).
    const messageIds = listRes.data.items.map(m => m.message_id).reverse();

    console.log(`Forwarding ${messageIds.length} messages...`);

    // 2. Merge Forward
    // API: POST https://open.feishu.cn/open-apis/im/v1/messages/merge_forward
    let receiveIdType = 'open_id';
    if (options.target.startsWith('oc_')) receiveIdType = 'chat_id';

    const forwardRes = await post(`https://open.feishu.cn/open-apis/im/v1/messages/merge_forward?receive_id_type=${receiveIdType}`, {
      receive_id: options.target,
      message_id_list: messageIds
    }, token);

    if (forwardRes.code !== 0) {
      console.error("Forward failed:", forwardRes);
      process.exit(1);
    }

    console.log("Successfully forwarded messages!");

  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
}

main();
