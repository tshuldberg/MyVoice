#!/usr/bin/env bash
# Build a universal (arm64 + x86_64), statically linked llama-server from a
# pinned llama.cpp release into resources/bin/, for the optional built-in local
# AI cleanup. It only ever listens on 127.0.0.1 and runs a model file the user
# chooses. Like build-whisper.sh, sources stay outside the repository.
set -euo pipefail

LLAMA_VERSION="b11871"
LLAMA_COMMIT="b3fa69955ea81c3b60e77e3c1e2224c4a826ffb9"
LLAMA_REPO="https://github.com/ggml-org/llama.cpp.git"
DEPLOYMENT_TARGET="13.0"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_dir="$repo_root/resources/bin"
out_bin="$out_dir/llama-server"
stamp_file="$out_dir/llama-server.version"
expected_stamp="$LLAMA_VERSION $LLAMA_COMMIT"

build_root="${MYVOICE_LLAMA_BUILD_DIR:-${TMPDIR:-/tmp}/myvoice-llama-build}"
src_dir="$build_root/llama.cpp-$LLAMA_VERSION"
jobs="${MYVOICE_BUILD_JOBS:-4}"

# Progress goes to stderr so build_arch can return its output path on stdout.
log() { echo "[MyVoice] $*" >&2; }
fail() { echo "[MyVoice] $*" >&2; exit 1; }

if [[ "${OSTYPE:-}" != darwin* ]]; then
  fail "llama-server must be built on macOS."
fi

if [[ "${1:-}" != "--force" && -x "$out_bin" && -f "$stamp_file" && "$(cat "$stamp_file")" == "$expected_stamp" ]]; then
  log "llama-server $LLAMA_VERSION already built at $out_bin (pass --force to rebuild)"
  exit 0
fi

command -v cmake >/dev/null 2>&1 || fail "cmake not found. Install it (brew install cmake, or pipx install cmake) and retry."
command -v git >/dev/null 2>&1 || fail "git not found. Install the Xcode Command Line Tools (xcode-select --install) and retry."

mkdir -p "$build_root"
if [[ ! -d "$src_dir/.git" ]]; then
  log "Cloning llama.cpp $LLAMA_VERSION"
  git clone --depth 1 --branch "$LLAMA_VERSION" "$LLAMA_REPO" "$src_dir"
fi

actual_commit="$(git -C "$src_dir" rev-parse HEAD)"
if [[ "$actual_commit" != "$LLAMA_COMMIT" ]]; then
  fail "llama.cpp $LLAMA_VERSION resolved to $actual_commit, expected $LLAMA_COMMIT. Refusing to build."
fi

build_arch() {
  local arch="$1"; shift
  local build_dir="$build_root/build-$LLAMA_VERSION-$arch"
  log "Configuring llama-server for $arch"
  cmake -S "$src_dir" -B "$build_dir" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_OSX_ARCHITECTURES="$arch" \
    -DCMAKE_OSX_DEPLOYMENT_TARGET="$DEPLOYMENT_TARGET" \
    -DBUILD_SHARED_LIBS=OFF \
    -DGGML_NATIVE=OFF \
    -DGGML_METAL=ON \
    -DGGML_METAL_EMBED_LIBRARY=ON \
    -DGGML_OPENMP=OFF \
    -DLLAMA_CURL=OFF \
    -DLLAMA_OPENSSL=OFF \
    -DLLAMA_BUILD_TESTS=OFF \
    -DLLAMA_BUILD_EXAMPLES=OFF \
    -DLLAMA_BUILD_SERVER=ON \
    "$@" >/dev/null
  log "Building llama-server for $arch"
  cmake --build "$build_dir" --config Release --target llama-server -j "$jobs" >/dev/null
  echo "$build_dir/bin/llama-server"
}

arm64_bin="$(build_arch arm64)"
# Every Mac that runs macOS 13 has AVX2, FMA and F16C.
x64_bin="$(build_arch x86_64 -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON)"

mkdir -p "$out_dir"
lipo -create "$arm64_bin" "$x64_bin" -output "$out_bin"
chmod 755 "$out_bin"

archs="$(lipo -archs "$out_bin")"
[[ "$archs" == *arm64* && "$archs" == *x86_64* ]] || fail "llama-server is not universal (archs: $archs)."

# Dependency lines are indented; the per-architecture header lines are not.
if otool -L "$out_bin" | grep -E '^[[:space:]]' | grep -v -E '^[[:space:]]+(/usr/lib/|/System/Library/)' | grep -q .; then
  otool -L "$out_bin" >&2
  fail "llama-server links libraries outside /usr/lib and /System. Expected a static build."
fi

echo "$expected_stamp" > "$stamp_file"
log "llama-server $LLAMA_VERSION ($archs) written to $out_bin"
