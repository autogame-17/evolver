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
  
  // Sort sheets by index just in case
  sheets.sort((a, b) => a.index - b.index);

  // 2. Fetch content for up to 3 sheets to balance context vs info
  // Skip hidden sheets
  const visibleSheets = sheets.filter(s => !s.hidden).slice(0, 3);

  for (const sheet of visibleSheets) {
    const sheetId = sheet.sheet_id;
    const title = sheet.title;
    
    // Determine Range based on grid properties
    // Default safe limits: Max 20 columns (T), Max 100 rows
    // This prevents massive JSON payloads
    let maxRows = 100;
    let maxCols = 20;

    if (sheet.grid_properties) {
      maxRows = Math.min(sheet.grid_properties.row_count, 100);
      maxCols = Math.min(sheet.grid_properties.column_count, 20);
    }
    
    // Avoid fetching empty grids (though unlikely for valid sheets)
    if (maxRows === 0 || maxCols === 0) {
        fullContent.push(`## Sheet: ${title} (Empty)`);
        continue;
    }

    const lastColName = indexToColName(maxCols); // 1-based index to A, B, ... T
    const range = `${sheetId}!A1:${lastColName}${maxRows}`;
    
    const valUrl = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${token}/values/${range}`;
    
    const valRes = await fetch(valUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const valData = await valRes.json();

    fullContent.push(`## Sheet: ${title}`);
    
    if (valData.code === 0 && valData.data && valData.data.valueRange) {
      const rows = valData.data.valueRange.values;
      fullContent.push(markdownTable(rows));
      
      if (sheet.grid_properties && sheet.grid_properties.row_count > maxRows) {
        fullContent.push(`*(Truncated: showing first ${maxRows} of ${sheet.grid_properties.row_count} rows)*`);
      }
    } else {
      fullContent.push(`(Could not fetch values: ${valData.msg})`);
    }
  }

  return {
    title: "Feishu Sheet",
    content: fullContent.join("\n\n")
  };
}

function indexToColName(num) {
  let ret = '';
  while (num > 0) {
    num--;
    ret = String.fromCharCode(65 + (num % 26)) + ret;
    num = Math.floor(num / 26);
  }
  return ret || 'A';
}

function markdownTable(rows) {
  if (!rows || rows.length === 0) return "";
  
  // Normalize row length
  const maxLength = Math.max(...rows.map(r => r ? r.length : 0));
  
  if (maxLength === 0) return "(Empty Table)";

  // Ensure all rows are arrays and have strings
  const cleanRows = rows.map(row => {
      if (!Array.isArray(row)) return Array(maxLength).fill("");
      return row.map(cell => {
          if (cell === null || cell === undefined) return "";
          if (typeof cell === 'object') return JSON.stringify(cell); // Handle rich text segments roughly
          return String(cell).replace(/\n/g, "<br>"); // Keep single line
      });
  });

  const header = cleanRows[0];
  const body = cleanRows.slice(1);
  
  // Handle case where header might be shorter than max length
  const paddedHeader = [...header];
  while(paddedHeader.length < maxLength) paddedHeader.push("");

  let md = "| " + paddedHeader.join(" | ") + " |\n";
  md += "| " + paddedHeader.map(() => "---").join(" | ") + " |\n";
  
  for (const row of body) {
    // Pad row if needed
    const padded = [...row];
    while(padded.length < maxLength) padded.push("");
    md += "| " + padded.join(" | ") + " |\n";
  }
  
  return md;
}

module.exports = {
  fetchSheetContent
};
