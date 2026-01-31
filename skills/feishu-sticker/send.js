const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const FormData = require('form-data');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') }); // Load workspace .env

// Credentials from environment
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;

if (!APP_ID || !APP_SECRET) {
    console.error('Error: FEISHU_APP_ID or FEISHU_APP_SECRET not set.');
    process.exit(1);
}

async function getToken() {
    try {
        const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                app_id: APP_ID,
                app_secret: APP_SECRET
            })
        });
        const data = await res.json();
        return data.tenant_access_token;
    } catch (e) {
        console.error('Failed to get token:', e.message);
        process.exit(1);
    }
}

async function uploadImage(token, filePath) {
    const formData = new FormData();
    formData.append('image_type', 'message');
    formData.append('image', fs.createReadStream(filePath));

    // Calculate length for Content-Length header (required by some fetch implementations with streams)
    // Actually, form-data submit might be easier with axios, but let's try fetch first or switch to native https if needed.
    // To allow `fetch` with FormData in Node, we might need a specific way.
    // Let's use `axios` if available, or just use the `form-data` package's submit method logic?
    // Wait, modern Node `fetch` can handle FormData? Not natively with fs streams perfectly in all versions.
    // Let's use a simpler approach: `curl` via child_process for upload might be more robust if deps are missing.
    // BUT, I can install `axios` and `form-data` easily.
    
    // Let's try constructing the request manually or using a helper.
    // Actually, for simplicity in this environment, let's use `axios` + `form-data`.
    
    try {
        const axios = require('axios');
        const res = await axios.post('https://open.feishu.cn/open-apis/im/v1/images', formData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                ...formData.getHeaders()
            }
        });
        return res.data.data.image_key;
    } catch (e) {
        console.error('Upload failed:', e.response ? e.response.data : e.message);
        process.exit(1);
    }
}

async function sendSticker(options) {
    const token = await getToken();
    
    // 1. Pick a file
    const stickerDir = path.resolve('/home/crishaocredits/.openclaw/media/stickers'); // Absolute path to match environment
    let selectedFile;

    if (options.file) {
        selectedFile = path.resolve(options.file);
    } else {
        // Random pick
        try {
            const files = fs.readdirSync(stickerDir).filter(f => /\.(jpg|png|gif|webp)$/i.test(f));
            if (files.length === 0) {
                console.error('No stickers found in', stickerDir);
                process.exit(1);
            }
            const randomFile = files[Math.floor(Math.random() * files.length)];
            selectedFile = path.join(stickerDir, randomFile);
        } catch (e) {
            console.error('Error reading sticker directory:', e.message);
            process.exit(1);
        }
    }

    console.log(`Sending sticker: ${selectedFile}`);

    // 2. Upload (or check cache? For now, simple upload)
    // Note: To optimize, we should cache image_keys mapped to file hashes/names.
    // Let's implement a simple JSON cache.
    const cachePath = path.join(__dirname, 'image_key_cache.json');
    let cache = {};
    if (fs.existsSync(cachePath)) {
        cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    }

    const fileName = path.basename(selectedFile);
    let imageKey = cache[fileName];

    if (!imageKey) {
        console.log('Uploading image...');
        imageKey = await uploadImage(token, selectedFile);
        cache[fileName] = imageKey;
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    } else {
        console.log('Using cached image_key:', imageKey);
    }

    // 3. Send
    try {
        const axios = require('axios');
        const res = await axios.post(
            'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
            {
                receive_id: options.target,
                msg_type: 'image',
                content: JSON.stringify({ image_key: imageKey })
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Success:', JSON.stringify(res.data.data, null, 2));
    } catch (e) {
        console.error('Send failed:', e.response ? e.response.data : e.message);
        process.exit(1);
    }
}

program
  .requiredOption('-t, --target <open_id>', 'Target User Open ID')
  .option('-f, --file <path>', 'Specific image file path (optional, default random)')
  .parse(process.argv);

sendSticker(program.opts());
