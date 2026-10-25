#!/usr/bin/env bash
set -euo pipefail

# Reuse the canonical Web panda vector. An opaque background lets iOS apply
# its own icon mask; no new mascot artwork or duplicated geometry is needed.
project_root="$(cd "$(dirname "$0")/../.." && pwd)"
command -v rsvg-convert >/dev/null || { echo "Install librsvg (rsvg-convert) first." >&2; exit 1; }
rsvg-convert --background-color '#58CC02' --width 1024 --height 1024 \
  "$project_root/apps/web/public/icons/icon.svg" \
  --output "$project_root/apps/mobile/ChinaTextbookStudy/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png"
