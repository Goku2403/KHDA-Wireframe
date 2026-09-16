#!/usr/bin/env bash
# Render a mockup HTML to PNG with headless Chrome.
#   render.sh <mockup-name-without-ext> [height] [scale]
# Reads  D:/KHDA wireframe/plan/mockups/<name>.html
# Writes D:/KHDA wireframe/plan/images/<name>.png
# Width is fixed at 1600 (the KHDA DS canvas); height defaults to 1200.
set -euo pipefail
NAME="${1:?mockup name}"
H="${2:-1200}"
SCALE="${3:-1.25}"
ROOT="D:/KHDA wireframe/plan"
CH="C:/Program Files/Google/Chrome/Application/chrome.exe"
SRC="$ROOT/mockups/$NAME.html"
OUT="$ROOT/images/$NAME.png"
[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }
mkdir -p "$ROOT/images"
URL="file:///D:/KHDA%20wireframe/plan/mockups/$NAME.html"
"$CH" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
  --force-device-scale-factor="$SCALE" --window-size="1600,$H" --virtual-time-budget=5000 \
  --screenshot="$OUT" "$URL" >/dev/null 2>&1
python - "$OUT" <<'PY'
import sys
from PIL import Image
p = sys.argv[1]
im = Image.open(p)
print(f"rendered {p} {im.size[0]}x{im.size[1]}")
PY
