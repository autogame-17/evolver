
async function fetchBitableContent(token, accessToken) {
  // 1. List tables
  const tablesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${token}/tables`;
  const tablesRes = await fetch(tablesUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const tablesData = await tablesRes.json();

  if (tablesData.code !== 0) {
    return { title: "Bitable", content: `Error fetching bitable tables: ${tablesData.msg}` };
  }

  const tables = tablesData.data.items;
  if (!tables || tables.length === 0) {
    return { title: "Bitable", content: "Empty Bitable." };
  }

  let fullContent = [];

  // 2. Fetch records
  // Prioritize Ignacia's table (tblJgZHOmPybgX60) if present
  const targetTableId = "tblJgZHOmPybgX60";
  const targetTable = tables.find(t => t.table_id === targetTableId);
  // If target found, only fetch it. Otherwise fetch first 3 to be safe/fast.
  const tablesToFetch = targetTable ? [targetTable] : tables.slice(0, 3);

  for (const table of tablesToFetch) {
    const tableId = table.table_id;
    const tableName = table.name;
    
    // List records
    const recordsUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${token}/tables/${tableId}/records?page_size=20`;
    const recRes = await fetch(recordsUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const recData = await recRes.json();
    
    fullContent.push(`## Table: ${tableName}`);

    if (recData.code === 0 && recData.data && recData.data.items) {
      const records = recData.data.items;
      // Convert records (objects with fields) to table
      // We need to know all possible fields to make a header
      const allFields = new Set();
      records.forEach(r => Object.keys(r.fields).forEach(k => allFields.add(k)));
      const headers = Array.from(allFields);
      
      let md = "| " + headers.join(" | ") + " |\n";
      md += "| " + headers.map(() => "---").join(" | ") + " |\n";
      
      for (const rec of records) {
        md += "| " + headers.map(h => {
          const val = rec.fields[h];
          if (typeof val === 'object') return JSON.stringify(val);
          return val || "";
        }).join(" | ") + " |\n";
      }
      
      fullContent.push(md);
    } else {
      fullContent.push(`(Could not fetch records: ${recData.msg})`);
    }
  }

  return {
    title: "Feishu Bitable",
    content: fullContent.join("\n\n")
  };
}

module.exports = {
  fetchBitableContent
};
