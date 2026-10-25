#!/usr/bin/env bash
# Build a universal (arm64 + x86_64), statically linked whisper-cli from a
# pinned whisper.cpp release and place it in resources/bin/ so electron-builder
# bundles it inside MyVoice.app. Users never need Homebrew.
set -euo pipefail

WHISPER_VERSION="v1.9.5"
WHISPER_COMMIT="d1be6fde11ac6e0407606b4e42fe72d34add8037"
WHISPER_REPO="https://github.com/ggml-org/whisper.cpp.git"
DEPLOYMENT_TARGET="13.0"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_dir="$repo_root/resources/bin"
out_bin="$out_dir/whisper-cli"
stamp_file="$out_dir/whisper-cli.version"
expected_stamp="$WHISPER_VERSION $WHISPER_COMMIT"

# Keep sources and object files out of the repo (and out of iCloud-synced folders).
build_root="${MYVOICE_WHISPER_BUILD_DIR:-${TMPDIR:-/tmp}/myvoice-whisper-build}"
src_dir="$build_root/whisper.cpp-$WHISPER_VERSION"
jobs="${MYVOICE_BUILD_JOBS:-4}"

# Progress goes to stderr so build_arch can return its output path on stdout.
log() { echo "[MyVoice] $*" >&2; }
fail() { echo "[MyVoice] $*" >&2; exit 1; }

if [[ "${OSTYPE:-}" != darwin* ]]; then
  fail "whisper-cli must be built on macOS."
fi

if [[ "${1:-}" != "--force" && -x "$out_bin" && -f "$stamp_file" && "$(cat "$stamp_file")" == "$expected_stamp" ]]; then
  log "whisper-cli $WHISPER_VERSION already built at $out_bin (pass --force to rebuild)"
  exit 0
fi

command -v cmake >/dev/null 2>&1 || fail "cmake not found. Install it (brew install cmake, or pipx install cmake) and retry."
command -v git >/dev/null 2>&1 || fail "git not found. Install the Xcode Command Line Tools (xcode-select --install) and retry."

mkdir -p "$build_root"
if [[ ! -d "$src_dir/.git" ]]; then
  log "Cloning whisper.cpp $WHISPER_VERSION"
  git clone --depth 1 --branch "$WHISPER_VERSION" "$WHISPER_REPO" "$src_dir"
fi

actual_commit="$(git -C "$src_dir" rev-parse HEAD)"
if [[ "$actual_commit" != "$WHISPER_COMMIT" ]]; then
  fail "whisper.cpp $WHISPER_VERSION resolved to $actual_commit, expected $WHISPER_COMMIT. Refusing to build."
fi

# One build per architecture, then lipo. GGML_NATIVE=OFF keeps the binary
# portable: a native build would use CPU features of this Mac that older Macs lack.
build_arch() {
  local arch="$1"; shift
  local build_dir="$build_root/build-$WHISPER_VERSION-$arch"
  log "Configuring whisper-cli for $arch"
  cmake -S "$src_dir" -B "$build_dir" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_OSX_ARCHITECTURES="$arch" \
    -DCMAKE_OSX_DEPLOYMENT_TARGET="$DEPLOYMENT_TARGET" \
    -DBUILD_SHARED_LIBS=OFF \
    -DGGML_NATIVE=OFF \
    -DGGML_METAL=ON \
    -DGGML_METAL_EMBED_LIBRARY=ON \
    -DGGML_OPENMP=OFF \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_SERVER=OFF \
    -DWHISPER_SDL2=OFF \
    "$@" >/dev/null
  log "Building whisper-cli for $arch"
  cmake --build "$build_dir" --config Release --target whisper-cli -j "$jobs" >/dev/null
  echo "$build_dir/bin/whisper-cli"
}

arm64_bin="$(build_arch arm64)"
# Every Mac that runs macOS 13 has AVX2, FMA and F16C.
x64_bin="$(build_arch x86_64 -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON)"

mkdir -p "$out_dir"
lipo -create "$arm64_bin" "$x64_bin" -output "$out_bin"
chmod 755 "$out_bin"

archs="$(lipo -archs "$out_bin")"
[[ "$archs" == *arm64* && "$archs" == *x86_64* ]] || fail "whisper-cli is not universal (archs: $archs)."

# A static build must not depend on Homebrew or on dylibs outside the system.
# Dependency lines are indented; the per-architecture header lines are not.
if otool -L "$out_bin" | grep -E '^[[:space:]]' | grep -v -E '^[[:space:]]+(/usr/lib/|/System/Library/)' | grep -q .; then
  otool -L "$out_bin" >&2
  fail "whisper-cli links libraries outside /usr/lib and /System. Expected a static build."
fi

echo "$expected_stamp" > "$stamp_file"
log "whisper-cli $WHISPER_VERSION ($archs) written to $out_bin"
