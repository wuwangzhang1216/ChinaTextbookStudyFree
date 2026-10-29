#!/usr/bin/env bash
# Install or upgrade all verified resources, including every split audio archive.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-v1.8.1}"
if [ "$#" -gt 0 ]; then shift; fi
exec python3 "$ROOT_DIR/scripts/install-release.py" --tag "$TAG" --root "$ROOT_DIR" "$@"
