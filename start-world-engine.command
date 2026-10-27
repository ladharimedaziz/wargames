#!/bin/bash
# Double-click (Mac) or run (Linux) to host The World Engine on this computer. Keep the window open.
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --omit=dev
node scripts/host.mjs
