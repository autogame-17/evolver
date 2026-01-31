# Feishu Sticker Skill

Sends a sticker (image) to a Feishu user.
Automatically uploads the image to Feishu (caching the image_key) and sends it as an `image` message.

## Tools

### feishu_sticker
Send a sticker.

- **target** (required): The Open ID of the user.
- **file** (optional): Path to a specific image file. If omitted, picks a random image from `media/stickers/`.

## Setup
1.  Put your stickers in `~/.openclaw/media/stickers/`.
2.  Install dependencies: `npm install axios form-data commander`.

## Examples

```bash
# Random sticker
feishu_sticker --target "ou_..."

# Specific sticker
feishu_sticker --target "ou_..." --file "/path/to/image.jpg"
```
