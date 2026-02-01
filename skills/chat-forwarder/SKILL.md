# Chat Forwarder (chat-forwarder)

A skill to fetch recent chat history from a group and send it as a "Merge Forward" (合并转发) message to a target user.

## Tools

### `node skills/chat-forwarder/index.js`
Fetches and forwards messages.

**Options:**
- `--source <chat_id>`: Source Chat ID (e.g., `oc_xxx`).
- `--target <open_id>`: Target User/Chat ID to receive the forward.
- `--limit <number>`: Number of recent messages to forward (default: 20, max 100).

## Usage
```bash
node skills/chat-forwarder/index.js --source "oc_123..." --target "ou_456..." --limit 50
```
