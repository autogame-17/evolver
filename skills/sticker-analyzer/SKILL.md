# Sticker Analyzer Skill

Analyzes images in `media/stickers` using Google Gemini Vision API to filter out non-stickers (screenshots, documents).

## Tools

### analyze_stickers
Runs the analysis script.

- No arguments required. Scans `~/.openclaw/media/stickers`.

## Setup
1.  Requires `npm install @google/generative-ai`.
2.  Requires a valid Google AI Studio API Key in `analyze.js`.

## Status
Current API Key seems to have access issues (404 on models).
