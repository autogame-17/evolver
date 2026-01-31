const fetch = require('node-fetch');
const { getTenantAccessToken } = require('./auth');

async function getAllUsers() {
  const token = await getTenantAccessToken();
  let users = [];
  let pageToken = '';
  
  do {
    const url = `https://open.feishu.cn/open-apis/contact/v3/users?department_id_type=open_department_id&department_id=0&page_size=50${pageToken ? '&page_token=' + pageToken : ''}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    if (data.code !== 0) {
      console.warn('Failed to fetch users:', data.msg);
      break;
    }
    if (data.data.items) {
      users = users.concat(data.data.items);
    }
    pageToken = data.data.page_token;
  } while (pageToken);

  return users;
}

async function getAttendance(userIds, dateInt) {
  const token = await getTenantAccessToken();
  const url = 'https://open.feishu.cn/open-apis/attendance/v1/user_tasks/query?employee_type=employee_id';
  
  const chunks = [];
  for (let i = 0; i < userIds.length; i += 50) {
    chunks.push(userIds.slice(i, i + 50));
  }

  let allTasks = [];

  for (const chunk of chunks) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_ids: chunk,
        check_date_from: dateInt,
        check_date_to: dateInt
      })
    });
    const data = await response.json();
    if (data.code === 0 && data.data.user_task_results) {
      allTasks = allTasks.concat(data.data.user_task_results);
    } else {
      console.error('Attendance query failed for chunk:', JSON.stringify(data));
    }
  }

  return allTasks;
}

async function sendMessage(receiveId, text) {
  const token = await getTenantAccessToken();
  const url = 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id'; 
  
  const type = receiveId.startsWith('ou_') ? 'open_id' : 'user_id';

  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${type}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: 'text',
      content: JSON.stringify({ text: text })
    })
  });
  
  return response.json();
}

module.exports = {
  getAllUsers,
  getAttendance,
  sendMessage
};
