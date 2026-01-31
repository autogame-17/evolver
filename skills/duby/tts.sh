#!/bin/bash
# Usage: duby_tts.sh "Text to speak" [VoiceID]

API_KEY="${DUBY_API_KEY}"
TEXT="$1"

if [ -z "$API_KEY" ]; then
  echo "Error: DUBY_API_KEY not set"
  exit 1
fi
# Default to Xinduo (芯朵) if not provided. User asked for BB but I don't have ID.
VOICE_ID="${2:-2719350d-9f0c-40af-83aa-b3879a115ca1}" 

# 1. Create Job
RESPONSE=$(curl -s -X POST "https://api.duby.so/openapi/tts/jobs" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "{
    \"clone_job_id\": \"$VOICE_ID\",
    \"text\": \"$TEXT\",
    \"speed_factor\": 1.1
  }")

JOB_ID=$(echo "$RESPONSE" | jq -r '.data.id')

if [ "$JOB_ID" == "null" ]; then
  echo "Error creating job: $RESPONSE"
  exit 1
fi

# 2. Poll for completion
STATUS="queued"
while [ "$STATUS" != "succeeded" ] && [ "$STATUS" != "failed" ]; do
  sleep 1
  JOB_INFO=$(curl -s -X GET "https://api.duby.so/openapi/tts/jobs/$JOB_ID" \
    -H "Authorization: Bearer $API_KEY")
  STATUS=$(echo "$JOB_INFO" | jq -r '.data.status')
done

if [ "$STATUS" == "failed" ]; then
  echo "Job failed: $(echo "$JOB_INFO" | jq -r '.data.error')"
  exit 1
fi

# 3. Download Audio
AUDIO_PATH=$(echo "$JOB_INFO" | jq -r '.data.output_audio_url')
FULL_URL="https://api.duby.so$AUDIO_PATH"
OUT_FILE="/tmp/duby_$(date +%s).mp3"

curl -s -o "$OUT_FILE" "$FULL_URL"
echo "MEDIA:$OUT_FILE"
