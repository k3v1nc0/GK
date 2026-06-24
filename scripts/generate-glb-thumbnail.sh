#!/bin/sh
set -eu

usage() {
  echo "Usage: $0 <input.glb> <output.png>" >&2
  exit 2
}

[ "$#" -eq 2 ] || usage

INPUT_PATH="$1"
OUTPUT_PATH="$2"
STRICT="${GLB_THUMBNAIL_STRICT:-0}"
THUMBNAIL_SIZE="${GLB_THUMBNAIL_SIZE:-768}"
TIMEOUT_MS="${GLB_THUMBNAIL_TIMEOUT:-30000}"
MODEL_VIEWER_ATTRIBUTES="${GLB_THUMBNAIL_MODEL_VIEWER_ATTRIBUTES:-environment-image=neutral&exposure=0.92&shadow-intensity=1}"
MODEL_VIEWER_VERSION="${GLB_THUMBNAIL_MODEL_VIEWER_VERSION:-1.9}"

if [ ! -f "$INPUT_PATH" ]; then
  echo "Input GLB mist: $INPUT_PATH" >&2
  [ "$STRICT" = "1" ] && exit 1 || exit 0
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
HELPER="$SCRIPT_DIR/generate-glb-thumbnail.cjs"

if [ ! -f "$ROOT_DIR/node_modules/@shopify/screenshot-glb/dist/file-server.js" ] || [ ! -f "$ROOT_DIR/node_modules/puppeteer/lib/cjs/puppeteer/puppeteer.js" ]; then
  echo "screenshot-glb is niet geïnstalleerd; thumbnail overgeslagen." >&2
  [ "$STRICT" = "1" ] && exit 127 || exit 0
fi

if [ ! -x "$HELPER" ]; then
  chmod +x "$HELPER" 2>/dev/null || true
fi

if [ ! -f "$HELPER" ]; then
  echo "Thumbnail helper ontbreekt." >&2
  [ "$STRICT" = "1" ] && exit 127 || exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is niet beschikbaar; thumbnail overgeslagen." >&2
  [ "$STRICT" = "1" ] && exit 127 || exit 0
fi

if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "xvfb-run is niet geïnstalleerd; thumbnail overgeslagen." >&2
  [ "$STRICT" = "1" ] && exit 127 || exit 0
fi

if [ ! -f "$ROOT_DIR/node_modules/@shopify/screenshot-glb/dist/file-server.js" ]; then
  echo "screenshot-glb is niet geïnstalleerd; thumbnail overgeslagen." >&2
  [ "$STRICT" = "1" ] && exit 127 || exit 0
fi

exec env \
  GLB_THUMBNAIL_STRICT="$STRICT" \
  GLB_THUMBNAIL_SIZE="$THUMBNAIL_SIZE" \
  GLB_THUMBNAIL_TIMEOUT="$TIMEOUT_MS" \
  GLB_THUMBNAIL_MODEL_VIEWER_ATTRIBUTES="$MODEL_VIEWER_ATTRIBUTES" \
  GLB_THUMBNAIL_MODEL_VIEWER_VERSION="$MODEL_VIEWER_VERSION" \
  xvfb-run -a -s "-screen 0 ${THUMBNAIL_SIZE}x${THUMBNAIL_SIZE}x24" \
  node "$HELPER" "$INPUT_PATH" "$OUTPUT_PATH"
