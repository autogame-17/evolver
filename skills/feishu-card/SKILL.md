# Feishu Card Skill

Allows sending interactive cards (Rich Text) to Feishu users via the App Bot API.
Bypasses the default `message` tool limitations for complex layouts.

## Tools

### feishu_card
Send an interactive card with optional title, markdown text, and action button.

- **target** (required): The Open ID of the user to send to (e.g., `ou_...`).
- **text** (optional): The body content of the card in Lark Markdown.
- **text_file** (optional): Path to a file containing Markdown text. Use this to avoid shell escaping issues with complex characters (like backticks).
- **title** (optional): The title text for the card header.
- **color** (optional): Header color. Default `blue`.
- **button_text** (optional): Text for a primary action button at the bottom.
- **button_url** (optional): URL to open when the button is clicked.

Note: Either `text` or `text_file` must be provided.

## Examples

```bash
# Simple card
feishu_card --target "ou_123..." --text "**Hello** world"

# From file (safe for code blocks)
echo 'Use `feishu-card` safely' > /tmp/msg.md
feishu_card --target "ou_123..." --text-file /tmp/msg.md
```
