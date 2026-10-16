#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
# The narration now determines the scene lengths; do not restore fixed offsets.
exec python3 scripts/mix-conversation.py