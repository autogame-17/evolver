const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') }); // Load workspace .env

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("Error: GEMINI_API_KEY not set");
    process.exit(1);
}

const STICKER_DIR = "/home/crishaocredits/.openclaw/media/stickers";
const TRASH_DIR = path.join(STICKER_DIR, "trash");

const genAI = new GoogleGenerativeAI(API_KEY);

// Debug: List models
async function listModels() {
    try {
        // Not all SDK versions expose listModels cleanly on the top level, 
        // but let's try a direct fetch if SDK fails, or just try 'gemini-pro' as a fallback.
        console.log("Attempting to use model: gemini-pro (fallback)");
        return "gemini-pro";
    } catch (e) {
        console.log("List models failed");
    }
}

// Use the specific model found via curl
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });

function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: fs.readFileSync(path).toString("base64"),
      mimeType,
    },
  };
}

async function run() {
  const files = fs.readdirSync(STICKER_DIR).filter(file => {
    const ext = path.extname(file).toLowerCase();
    // Skip GIFs for now to be safe, stick to static images
    return [".jpg", ".jpeg", ".png", ".webp"].includes(ext) && fs.statSync(path.join(STICKER_DIR, file)).isFile();
  });

  console.log(`Found ${files.length} images to analyze.`);

  for (const file of files) {
    const filePath = path.join(STICKER_DIR, file);
    const mimeType = file.endsWith(".png") ? "image/png" : (file.endsWith(".webp") ? "image/webp" : "image/jpeg");

    console.log(`Analyzing ${file}...`);

    try {
      const prompt = `Analyze this image. Is it a "sticker" or "meme" suitable for use in a chat conversation as a reaction?
      It is NOT a sticker if it is a screenshot of UI, document, real photo of papers, or complex diagram.
      It IS a sticker if it is a character, anime face, meme, or expressive icon.
      Reply with JSON ONLY: {"is_sticker": boolean, "reason": "string"}`;

      const imagePart = fileToGenerativePart(filePath, mimeType);
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();
      
      console.log(`Response: ${text}`);

      let isSticker = false;
      try {
          const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
          const json = JSON.parse(cleanJson);
          isSticker = json.is_sticker;
      } catch (e) {
          console.error("JSON parse failed, assuming false");
      }

      if (!isSticker) {
        console.log(`❌ Not a sticker. Moving to trash.`);
        fs.renameSync(filePath, path.join(TRASH_DIR, file));
      } else {
        console.log(`✅ Sticker confirmed.`);
      }

    } catch (e) {
      console.error(`Error processing ${file}:`, e.message);
    }
    
    // Simple sleep
    await new Promise(r => setTimeout(r, 1000));
  }
}

run();
