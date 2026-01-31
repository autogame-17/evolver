const fetch = require('node-fetch');

async function fetchDocxContent(documentId, accessToken) {
  // 1. Get document info for title
  const infoUrl = `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}`;
  const infoRes = await fetch(infoUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const infoData = await infoRes.json();
  let title = "Untitled Docx";
  if (infoData.code === 0 && infoData.data && infoData.data.document) {
    title = infoData.data.document.title;
  }

  // 2. Fetch all blocks
  // List blocks API: GET https://open.feishu.cn/open-apis/docx/v1/documents/{document_id}/blocks
  // Use pagination if necessary, fetching all for now (basic implementation)
  let blocks = [];
  let pageToken = '';
  let hasMore = true;

  while (hasMore) {
    const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks?page_size=500${pageToken ? `&page_token=${pageToken}` : ''}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`Failed to fetch docx blocks: ${data.msg}`);
    }

    if (data.data && data.data.items) {
      blocks = blocks.concat(data.data.items);
    }
    
    hasMore = data.data.has_more;
    pageToken = data.data.page_token;
  }

  const markdown = convertBlocksToMarkdown(blocks);
  return { title, content: markdown };
}

function convertBlocksToMarkdown(blocks) {
  if (!blocks || blocks.length === 0) return "";
  
  let md = [];
  
  for (const block of blocks) {
    const type = block.block_type;
    
    switch (type) {
      case 1: // page
        break;
      case 2: // text (paragraph)
        md.push(parseText(block.text));
        break;
      case 3: // heading1
        md.push(`# ${parseText(block.heading1)}`);
        break;
      case 4: // heading2
        md.push(`## ${parseText(block.heading2)}`);
        break;
      case 5: // heading3
        md.push(`### ${parseText(block.heading3)}`);
        break;
      case 6: // heading4
        md.push(`#### ${parseText(block.heading4)}`);
        break;
      case 7: // heading5
        md.push(`##### ${parseText(block.heading5)}`);
        break;
      case 8: // heading6
        md.push(`###### ${parseText(block.heading6)}`);
        break;
      case 9: // heading7
        md.push(`####### ${parseText(block.heading7)}`);
        break;
      case 10: // heading8
        md.push(`######## ${parseText(block.heading8)}`);
        break;
      case 11: // heading9
        md.push(`######### ${parseText(block.heading9)}`);
        break;
      case 12: // bullet
        md.push(`- ${parseText(block.bullet)}`);
        break;
      case 13: // ordered
        md.push(`1. ${parseText(block.ordered)}`);
        break;
      case 14: // code
        md.push('```' + (block.code?.style?.language === 1 ? '' : '') + '\n' + parseText(block.code) + '\n```');
        break;
      case 15: // quote
        md.push(`> ${parseText(block.quote)}`);
        break;
      case 27: // image
        md.push(`![Image](token:${block.image?.token})`);
        break;
      default:
        // Ignore unknown blocks for now
        break;
    }
  }
  
  return md.join('\n\n');
}

function parseText(blockData) {
  if (!blockData || !blockData.elements) return "";
  
  return blockData.elements.map(el => {
    if (el.text_run) {
      let text = el.text_run.content;
      const style = el.text_run.text_element_style;
      if (style) {
        if (style.bold) text = `**${text}**`;
        if (style.italic) text = `*${text}*`;
        if (style.strikethrough) text = `~~${text}~~`;
        if (style.inline_code) text = `\`${text}\``;
        if (style.link) text = `[${text}](${style.link.url})`;
      }
      return text;
    }
    if (el.mention_doc) {
      return `[Doc: ${el.mention_doc.token}]`;
    }
    return "";
  }).join("");
}

module.exports = {
  fetchDocxContent
};
