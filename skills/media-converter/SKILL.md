# Media Converter Skill

## Description
Detects media file types via magic bytes, fixes file extensions, and converts media formats (WebP, MP3, GIF) using `ffmpeg`.
Supports batch processing for directories.

## Usage

### Single File
```bash
# Detect MIME type
node skills/media-converter/index.js detect --file <path>

# Fix extension (Renames file if needed)
node skills/media-converter/index.js fix --file <path>

# Convert Format (webp, mp3, gif, png)
node skills/media-converter/index.js convert --file <path> --format webp
```

### Batch Processing
```bash
# Fix extensions for all files in a folder
node skills/media-converter/index.js fix --dir <directory>

# Convert all files in a folder to WebP
node skills/media-converter/index.js convert --dir <directory> --format webp
```

## Features
- **Magic Byte Detection**: Identifies true file type regardless of extension.
- **Auto-Fix**: Renames files to match their content (e.g., `.bin` -> `.jpg`).
- **Conversion**:
  - `webp`: Converts images/gifs to WebP (Optimized for Feishu/LLMs).
  - `mp3`: Extracts audio from video.
  - `gif`: Converts video to GIF.
  - `png`: Extracts first frame of GIF.
