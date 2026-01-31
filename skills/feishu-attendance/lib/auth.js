const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Try to load .env from workspace root
try {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  } else {
    // Fallback or try standard load
    require('dotenv').config();
  }
} catch (e) {
  // ignore
}

let tokenCache = {
  token: null,
  expireTime: 0
};

function loadConfig() {
  const configPath = path.join(__dirname, '../config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.error("Failed to parse config.json");
    }
  }
  
  return {
    app_id: process.env.FEISHU_APP_ID || config.app_id,
    app_secret: process.env.FEISHU_APP_SECRET || config.app_secret
  };
}

async function getTenantAccessToken() {
  const now = Date.now() / 1000;
  if (tokenCache.token && tokenCache.expireTime > now) {
    return tokenCache.token;
  }

  const config = loadConfig();
  if (!config.app_id || !config.app_secret) {
    throw new Error("Missing app_id or app_secret. Please set FEISHU_APP_ID and FEISHU_APP_SECRET environment variables.");
  }

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      "app_id": config.app_id,
      "app_secret": config.app_secret
    })
  });

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`Failed to get tenant_access_token: ${data.msg}`);
  }

  tokenCache.token = data.tenant_access_token;
  tokenCache.expireTime = now + data.expire - 60; // Refresh 1 minute early

  return tokenCache.token;
}

module.exports = {
  getTenantAccessToken
};
