const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');

program
  .option('--prompt <prompt>', 'Music description')
  .option('--tags <tags>', 'Style tags')
  .option('--title <title>', 'Song title')
  .option('--model <model>', 'Model version', 'chirp-v3-0')
  .option('--instrumental', 'Instrumental only')
  .parse(process.argv);

const options = program.opts();
const API_KEY = process.env.VECTOR_ENGINE_KEY; // "sk-6ZzBbEBeQ8Rge0pNxCObVF8RhOQ1ns5zk9F5x65rKCWNSwHG"
const BASE_URL = 'https://api.vectorengine.ai/suno';

async function main() {
  if (!API_KEY) {
    console.error("Error: VECTOR_ENGINE_KEY not found in environment.");
    process.exit(1);
  }

  try {
    // 1. Submit Task
    // Updated to support CUSTOM generation (Lyrics + Tags)
    console.log(`[Suno] Submitting task: "${options.title}"...`);
    
    // Check if we have explicit lyrics. If so, use custom generation endpoint if available, 
    // or pack it into the prompt if the API only supports 'submit/music' with prompt.
    // Vector Engine API documentation shows 'submit/music' takes 'prompt', 'tags', 'title'. 
    // To use custom lyrics, we typically need to send 'prompt' as the lyrics? 
    // Wait, standard Suno API uses 'prompt' for description OR lyrics depending on mode.
    // Let's assume 'prompt' field can take lyrics if we provide 'tags' separately.
    // Or we use 'make_instrumental': false.
    
    // Actually, Vector Engine doc says: 
    // action: MUSIC
    // It doesn't explicitly show a separate 'lyrics' field in the submit body in my previous fetch.
    // Let's assume the 'prompt' field IS the lyrics when tags are provided, or we adhere to standard Suno behavior.
    // For V3/V3.5, usually: prompt=Lyrics, tags=Style.
    
    const payload = {
      prompt: options.prompt, // This will now hold the FULL LYRICS
      tags: options.tags,     // Music style
      title: options.title,
      model: options.model,
      make_instrumental: options.instrumental || false,
      wait_audio: false
    };
    
    const submitRes = await axios.post(`${BASE_URL}/submit/music`, payload, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });

    const taskId = submitRes.data.data; // Assuming response structure based on doc
    if (!taskId) {
      console.error("Error: No task_id returned.", submitRes.data);
      process.exit(1);
    }
    console.log(`[Suno] Task ID: ${taskId}. Polling for completion...`);

    // 2. Poll for Status
    let audioUrl = null;
    for (let i = 0; i < 60; i++) { // Poll for up to 5 minutes (5s interval)
      await new Promise(r => setTimeout(r, 5000));
      
      const fetchRes = await axios.get(`${BASE_URL}/fetch/${taskId}`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      const status = fetchRes.data.data.status; // Based on doc: data.status
      
      console.log(`[Suno] Status: ${status}`);

      if (status === 'SUCCESS') {
        // Success data structure: data.data is array of clips? Doc says "music(array)".
        // Usually Suno generates 2 clips per prompt. We'll take the first one.
        const clips = fetchRes.data.data.data; 
        if (clips && clips.length > 0) {
            audioUrl = clips[0].audio_url; // Doc: dataobject-concrete data: music(array)
            const videoUrl = clips[0].video_url;
            const title = clips[0].title;
            const metadata = clips[0].metadata; // Usually contains prompt, tags, lyrics
            
            console.log(`[Suno] Generation Success!`);
            console.log(`METADATA_START`);
            console.log(JSON.stringify({
                title: title,
                tags: metadata?.tags || options.tags,
                prompt: metadata?.prompt || options.prompt,
                lyrics: metadata?.lyrics || "(Instrumental or lyrics not provided)",
                audio_url: audioUrl,
                video_url: videoUrl
            }, null, 2));
            console.log(`METADATA_END`);
            break;
        }
      } else if (status === 'FAILURE') {
        console.error(`[Suno] Task Failed: ${fetchRes.data.data.failReason}`);
        process.exit(1);
      }
    }

    if (!audioUrl) {
      console.error("[Suno] Timeout waiting for generation.");
      process.exit(1);
    }

    // 3. Output result for Agent to grab (or download/send logic here)
    // For simplicity, we just output the URL. The Agent (me) will see it and handle the "Send to Feishu" part 
    // by downloading and using the 'message' tool, or just sending the link.
    // Let's print a special marker for the agent.
    console.log(`MEDIA_URL:${audioUrl}`);

  } catch (error) {
    console.error("[Suno] Error:", error.response ? error.response.data : error.message);
    process.exit(1);
  }
}

main();
