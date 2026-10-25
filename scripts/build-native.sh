#!/usr/bin/env bash
# Build the Objective-C addon against Electron's headers as a universal
# (arm64 + x86_64) binary so one MyVoice.app runs on every Mac.
#   scripts/build-native.sh          universal build (release)
#   scripts/build-native.sh --host   this Mac's architecture only (faster for development)
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
native_dir="$repo_root/src/native"
node_gyp="$repo_root/node_modules/.bin/node-gyp"
out="$native_dir/build/Release/myvoice_native.node"

[[ -x "$node_gyp" ]] || { echo "[MyVoice] node-gyp not found. Run npm ci first." >&2; exit 1; }
electron_version="$(node -p "require('$repo_root/node_modules/electron/package.json').version")"

archs=(arm64 x64)
if [[ "${1:-}" == "--host" ]]; then
  archs=("$(node -p 'process.arch')")
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/myvoice-native.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

# node-gyp rebuild clears build/, so each slice is copied out before the next one.
for arch in "${archs[@]}"; do
  echo "[MyVoice] Building native addon for $arch (Electron $electron_version)"
  (cd "$native_dir" && "$node_gyp" rebuild --arch="$arch" --runtime=electron \
    --target="$electron_version" --dist-url=https://electronjs.org/headers >/dev/null)
  cp "$out" "$tmp_dir/myvoice_native-$arch.node"
done

lipo -create "$tmp_dir"/myvoice_native-*.node -output "$out"
echo "[MyVoice] Native addon ($(lipo -archs "$out")) written to $out"
