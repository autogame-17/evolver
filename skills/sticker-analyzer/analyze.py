import os
import google.generativeai as genai
import time
from PIL import Image
import shutil

# Config
API_KEY = os.environ.get("GEMINI_API_KEY")
STICKER_DIR = "/home/crishaocredits/.openclaw/media/stickers"
TRASH_DIR = "/home/crishaocredits/.openclaw/media/stickers/trash"

if not API_KEY:
    print("Error: GEMINI_API_KEY not found in environment.")
    sys.exit(1)

genai.configure(api_key=API_KEY)

# Use Gemini 1.5 Flash for speed and cost efficiency
model = genai.GenerativeModel('gemini-1.5-flash')

if not os.path.exists(TRASH_DIR):
    os.makedirs(TRASH_DIR)

def analyze_image(file_path):
    try:
        # Load image
        img = Image.open(file_path)
        
        # Prompt
        prompt = """
        Analyze this image. Is it a "sticker" or "meme" suitable for use in a chat conversation as a reaction?
        
        It is NOT a sticker if it is:
        - A screenshot of a UI, document, or conversation.
        - A photo of a real-world document.
        - A complex diagram or chart.
        - Too blurry or cropped.
        
        It IS a sticker if it is:
        - A cartoon character, anime face, or funny animal.
        - Has text overlay (meme style) or no text.
        - Simple, expressive, and meant for emotion.
        
        Reply with JSON ONLY: {"is_sticker": boolean, "reason": "short explanation"}
        """
        
        response = model.generate_content([prompt, img])
        return response.text
    except Exception as e:
        return f'{{"error": "{str(e)}"}}'

print(f"Scanning {STICKER_DIR}...")

files = [f for f in os.listdir(STICKER_DIR) if os.path.isfile(os.path.join(STICKER_DIR, f))]
files = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))] # Skip GIF for analysis to avoid crash risk, handle later

for file in files:
    full_path = os.path.join(STICKER_DIR, file)
    print(f"Analyzing {file}...")
    
    result_raw = analyze_image(full_path)
    
    # Simple parsing because sometimes JSON markdown wrappers exist
    is_sticker = False
    if '"is_sticker": true' in result_raw.lower():
        is_sticker = True
    
    print(f"Result: {is_sticker} | {result_raw.strip()}")
    
    if not is_sticker:
        print(f"Moving {file} to trash...")
        shutil.move(full_path, os.path.join(TRASH_DIR, file))
    
    time.sleep(1) # Rate limit safety

print("Analysis complete.")
