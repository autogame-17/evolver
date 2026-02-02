const fetch = require('node-fetch');
const path = require('path');
const { getTenantAccessToken } = require('../feishu-doc/lib/auth');

async function apiRequest(url, method = 'GET', body = null) {
    const token = await getTenantAccessToken();
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    const data = await res.json();
    return data;
}

async function listTables(appToken) {
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`;
    const data = await apiRequest(url);
    if (data.code !== 0) throw new Error(`List Tables Failed: ${data.msg}`);
    return data.data.items;
}

async function addRecord(appToken, tableId, fields) {
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
    const data = await apiRequest(url, 'POST', { fields });
    if (data.code !== 0) throw new Error(`Add Record Failed: ${data.msg}`);
    return data.data.record;
}

async function main() {
    const appToken = 'D1albdySZaU6ncsx4WzcGZfOn1B';
    const tableName = '数据表';
    
    try {
        // 1. Find Table ID
        console.log(`Listing tables for App ${appToken}...`);
        const tables = await listTables(appToken);
        const table = tables.find(t => t.name === tableName);
        
        if (!table) {
            console.error(`Table "${tableName}" not found. Available: ${tables.map(t => t.name).join(', ')}`);
            return;
        }
        
        const tableId = table.table_id;
        console.log(`Found Table ID: ${tableId}`);

        // 2. Add Record
        // Fields: { "文本": "调整NPC晚上睡眠值下降速度", "单选": "P1" }
        const newRecord = {
            "文本": "调整NPC晚上睡眠值下降速度",
            "单选": "P1" // Assuming P1 for "Important"
        };

        console.log(`Adding record: ${JSON.stringify(newRecord)}...`);
        const record = await addRecord(appToken, tableId, newRecord);
        console.log(`✅ Record Added! Record ID: ${record.record_id}`);

    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

main();
