const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const KEYS = [
    "img_v3_02uh_0757dd57-1608-42a2-b079-ed99a9d27d9g",
    "img_v3_02uh_97113fd0-6d08-4b15-83e2-a222114f391g",
    "img_v3_02uh_bb4fc733-ff1a-455b-8cf9-490b346a030g"
];
const OUT_DIR = path.resolve(__dirname, '../../media/temp_stitch');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function getToken() {
    const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        app_id: APP_ID,
        app_secret: APP_SECRET
    });
    return res.data.tenant_access_token;
}

async function getRecentImages(token, chatId) {
    const url = `https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${chatId}&page_size=20&sort_type=ByCreateTimeDesc`;
    const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
    });
    
    // items are newest first.
    const images = res.data.data.items.filter(m => m.msg_type === 'image');
    // We need the 3 images sent just before the command.
    // Filter by sender? Yes, sender.id == 'ou_cdc63fe05e88c580aedead04d851fc04' (Master)
    // The keys I have are: 
    // img_v3_02uh_0757dd57...
    // img_v3_02uh_97113fd0...
    // img_v3_02uh_bb4fc733...
    
    // Let's find messages that contain these keys.
    const targets = [];
    // The user sent them in order. 
    // In the log: 
    // 1. 0757... (First)
    // 2. 9711...
    // 3. bb4f... (Last)
    // The list API returns newest first (ByCreateTimeDesc).
    // So order in list should be: bb4f, 9711, 0757.
    
    const targetKeys = [
        "img_v3_02uh_25f8a071-22a7-4969-bdb6-70fa5b1acbag",
        "img_v3_02uh_ce51a066-fb33-4359-9424-32552c5fad9g",
        "img_v3_02uh_113fc3e2-840f-438c-92ee-15ea700bb6ag"
    ];

    for (const key of targetKeys) {
        const found = images.find(m => {
            const body = JSON.parse(m.body.content);
            return body.image_key === key;
        });
        if (found) {
            targets.push({ id: found.message_id, key });
        } else {
            console.log(`Warning: Message for key ${key} not found in last 20 messages.`);
        }
    }
    return targets;
}

async function downloadImage(token, msgId, key, index) {
    const url = `https://open.feishu.cn/open-apis/im/v1/messages/${msgId}/resources/${key}?type=image`;
    const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer'
    });
    const filePath = path.join(OUT_DIR, `${index}.png`);
    fs.writeFileSync(filePath, res.data);
    console.log(`Downloaded ${index}.png`);
    return filePath;
}

async function run() {
    try {
        console.log("Getting token...");
        const token = await getToken();
        const chatId = "oc_80aa1ab1545aa245ec9cfec9cde07b2f";

        console.log("Locating messages...");
        const targets = await getRecentImages(token, chatId);
        
        if (targets.length !== 3) {
            console.log(`Found ${targets.length} images, expected 3.`);
            // Continue anyway if we have some
        }

        console.log("Downloading images...");
        const files = [];
        for (let i = 0; i < targets.length; i++) {
            // targets is ordered by my targetKeys list (Top to Bottom)
            files.push(await downloadImage(token, targets[i].id, targets[i].key, i));
        }

        // Find ffmpeg
        let ffmpegPath = 'ffmpeg';
        try {
            ffmpegPath = require('ffmpeg-static');
        } catch (e) {
            console.log("Using system ffmpeg");
        }

        const outPath = path.join(OUT_DIR, 'stitched_3.png');
        console.log("Stitching...");
        
        const args = [];
        let filterComplex = "";
        
        files.forEach((f, idx) => {
            args.push('-i');
            args.push(f);
            // Scale to 1080 width, maintain aspect ratio
            filterComplex += `[${idx}:v]scale=1080:-1[v${idx}];`;
        });
        
        files.forEach((_, idx) => {
            filterComplex += `[v${idx}]`;
        });
        
        filterComplex += `vstack=inputs=${files.length}`;
        
        args.push('-filter_complex');
        args.push(filterComplex);
        args.push('-y');
        args.push(outPath);

        const res = spawnSync(ffmpegPath, args);
        if (res.error) throw res.error;
        if (res.status !== 0) {
             console.error(res.stderr.toString());
             throw new Error("FFmpeg failed");
        }

        console.log(`Stitched to ${outPath}`);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();