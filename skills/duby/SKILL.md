# Duby TTS Skill

Convert text to speech using Duby.so API.

## Tools

### duby_tts
Convert text to speech and return a media file path.

- **text** (required): The text to convert.
- **voice_id** (optional): The Voice ID to use. Defaults to `2719350d-9f0c-40af-83aa-b3879a115ca1` (Xinduo).

## Examples

```bash
# Default voice
duby_tts "Hello world"

# Specific voice
duby_tts "Hello world" "some-voice-id"
```

## Implementation
Uses `tts.sh` script with curl and jq.
Requires `API_KEY` to be set in the script.
