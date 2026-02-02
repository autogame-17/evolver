---
name: suno-music
description: Generate music using Suno AI via Vector Engine API. Supports custom lyrics and style tags.
---

# Suno Music Generation Skill

This skill allows the agent to generate music using the Suno AI models (via Vector Engine API).

## Tools

### generate_music
Generate a song based on lyrics and style.

- **lyrics** (required): The full lyrics of the song (Verse/Chorus structure).
- **tags** (required): Music style tags (e.g., "metal, fast, electronic").
- **title** (optional): Title of the song.
- **instrumental** (optional): Boolean, true for instrumental only.
- **model** (optional): Model version, default "chirp-v5".

## Implementation Details

The skill uses a 2-step process:
1. **Submit Task**: POST to `https://api.vectorengine.ai/suno/submit/music`.
   - **Important**: The `prompt` field in the API payload is used for **Lyrics** when we want custom mode. The `tags` field controls the style.
2. **Poll Status**: GET `https://api.vectorengine.ai/suno/fetch/{task_id}` until status is SUCCESS.
3. **Download & Send**: Download the MP3 and send it via Feishu.

## Configuration
- `VECTOR_ENGINE_KEY`: API Key for Vector Engine.
