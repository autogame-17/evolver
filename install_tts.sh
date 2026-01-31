#!/bin/bash
set -e

BASE_DIR="$HOME/.openclaw/tools/sherpa-onnx-tts"
mkdir -p "$BASE_DIR/runtime"
mkdir -p "$BASE_DIR/models"

# Download Runtime
echo "Downloading runtime..."
curl -L -o "$BASE_DIR/runtime.tar.bz2" "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.23/sherpa-onnx-v1.12.23-linux-x64-shared.tar.bz2"
tar -xjf "$BASE_DIR/runtime.tar.bz2" -C "$BASE_DIR/runtime" --strip-components=1
rm "$BASE_DIR/runtime.tar.bz2"

# Download Model
echo "Downloading model..."
curl -L -o "$BASE_DIR/model.tar.bz2" "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-lessac-high.tar.bz2"
tar -xjf "$BASE_DIR/model.tar.bz2" -C "$BASE_DIR/models"
rm "$BASE_DIR/model.tar.bz2"

echo "Installation complete."
