const fetch = require('node-fetch');
const { getTenantAccessToken } = require('./auth');

async function resolveWiki(token, accessToken) {
  // Try to resolve via get_node API first to get obj_token and obj_type
  // API: GET https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token={token}
  
  const url = `https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${token}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  const data = await response.json();
  
  if (data.code === 0 && data.data && data.data.node) {
    return {
      obj_token: data.data.node.obj_token,
      obj_type: data.data.node.obj_type, // 'docx', 'doc', 'sheet', 'bitable'
      title: data.data.node.title
    };
  }

  // Handle specific errors if needed (e.g., node not found)
  if (data.code !== 0) {
    throw new Error(`Wiki resolution failed: ${data.msg} (Code: ${data.code})`);
  }
  
  return null;
}

module.exports = {
  resolveWiki
};
