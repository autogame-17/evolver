#!/bin/bash
export BASE_DIR="$HOME/.openclaw/tools/sherpa-onnx-tts"
export LD_LIBRARY_PATH="$BASE_DIR/runtime/lib:$LD_LIBRARY_PATH"
export MODEL_DIR="$BASE_DIR/models/vits-piper-en_US-lessac-high"

"$BASE_DIR/runtime/bin/sherpa-onnx-offline-tts" \
  --vits-model="$MODEL_DIR/en_US-lessac-high.onnx" \
  --vits-tokens="$MODEL_DIR/tokens.txt" \
  --vits-data-dir="$MODEL_DIR/espeak-ng-data" \
  --output-filename="$HOME/tts/meow_test.wav" \
  "Meow. Hello master."
