const fetch = require('node-fetch');

async function fetchSheetContent(token, accessToken) {
  // 1. Get metainfo to find sheetIds
  const metaUrl = `https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/${token}/sheets/query`;
  const metaRes = await fetch(metaUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const metaData = await metaRes.json();

  if (metaData.code !== 0) {
     // Fallback or error
     return { title: "Sheet", content: `Error fetching sheet meta: ${metaData.msg}` };
  }

  const sheets = metaData.data.sheets;
  if (!sheets || sheets.length === 0) {
    return { title: "Sheet", content: "Empty spreadsheet." };
  }

  let fullContent = [];

  // 2. Fetch content for the first sheet (or all?) - Let's do first sheet for now to save tokens/time
  for (const sheet of sheets.slice(0, 1)) { // Limit to 1 for efficiency in this basic skill
    const sheetId = sheet.sheet_id;
    const title = sheet.title;
    
    // Fetch values
    // Range: just the sheetId will often fetch the used range or we need to specify?
    // v2 API: /values/{range}
    // range can be "sheetId!A1:Z100"
    
    // Let's guess a reasonable range or use the grid info if available. 
    // Simplified: "sheetId" usually works? No, strict range often required.
    // Let's try fetching a large range A1:Z100
    const range = `${sheetId}!A1:E50`; 
    const valUrl = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${token}/values/${range}`;
    
    const valRes = await fetch(valUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const valData = await valRes.json();

    fullContent.push(`## Sheet: ${title}`);
    
    if (valData.code === 0 && valData.data && valData.data.valueRange) {
      const rows = valData.data.valueRange.values;
      fullContent.push(markdownTable(rows));
    } else {
      fullContent.push(`(Could not fetch values: ${valData.msg})`);
    }
  }

  return {
    title: "Feishu Sheet",
    content: fullContent.join("\n\n")
  };
}

function markdownTable(rows) {
  if (!rows || rows.length === 0) return "";
  
  // Normalize row length
  const maxLength = Math.max(...rows.map(r => r.length));
  
  const header = rows[0];
  const body = rows.slice(1);
  
  let md = "| " + header.map(c => c || "").join(" | ") + " |\n";
  md += "| " + header.map(() => "---").join(" | ") + " |\n";
  
  for (const row of body) {
    // Pad row if needed
    const padded = [...row];
    while(padded.length < maxLength) padded.push("");
    md += "| " + padded.map(c => c || "").join(" | ") + " |\n";
  }
  
  return md;
}

module.exports = {
  fetchSheetContent
};
