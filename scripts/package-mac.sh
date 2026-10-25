#!/usr/bin/env bash
# Build an unsigned, universal MyVoice.dmg for local testing. Gatekeeper will
# block it on other Macs; use scripts/release-mac.sh for anything you share.
set -euo pipefail

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "[MyVoice] macOS packaging must run on macOS." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

tmp_root="${TMPDIR:-/tmp}"
output_dir="${MYVOICE_RELEASE_OUTPUT:-${tmp_root%/}/myvoice-package}"
mkdir -p "$output_dir"

echo "[MyVoice] Building whisper-cli, native addon and TypeScript"
bash scripts/build-whisper.sh
bash scripts/build-native.sh
npx tsc

echo "[MyVoice] Packaging unsigned universal app into $output_dir"
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --universal \
  -c.mac.identity=null \
  -c.mac.notarize=false \
  -c.directories.output="$output_dir"

echo "[MyVoice] Build complete"
find "$output_dir" -maxdepth 1 -name '*.dmg' -print
