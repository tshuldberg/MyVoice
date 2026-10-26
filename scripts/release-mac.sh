#!/usr/bin/env bash
# Build a signed, notarized and stapled MyVoice.dmg for direct download.
#
#   scripts/release-mac.sh --check   check that everything is ready; builds nothing
#   scripts/release-mac.sh           full release
#
# Needs, once per Mac:
#   - a "Developer ID Application" certificate in the login keychain
#   - a notarytool keychain profile (default name "myvoice"):
#       xcrun notarytool store-credentials myvoice --apple-id <Apple ID> --team-id <Team ID>
#
# Environment overrides:
#   MYVOICE_NOTARY_PROFILE     keychain profile name (default: myvoice)
#   MYVOICE_CODESIGN_IDENTITY  signing identity name or SHA-1 (default: first Developer ID Application)
#   MYVOICE_RELEASE_OUTPUT     output folder (default: $TMPDIR/myvoice-release, outside iCloud-synced folders)
#   MYVOICE_SKIP_PROFILE_CHECK=1  skip the local profile lookup; notarytool then reports a missing profile itself
#
# This script never uploads anything. Publishing the DMG is a separate, manual step.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

check_only=false
[[ "${1:-}" == "--check" ]] && check_only=true

notary_profile="${MYVOICE_NOTARY_PROFILE:-myvoice}"
identity="${MYVOICE_CODESIGN_IDENTITY:-}"
tmp_root="${TMPDIR:-/tmp}"
output_root="${MYVOICE_RELEASE_OUTPUT:-${tmp_root%/}/myvoice-release}"

problems=0
ok() { echo "  ok       $*"; }
missing() { echo "  MISSING  $*"; problems=$((problems + 1)); }
step() { echo; echo "[MyVoice] $*"; }
die() { echo "[MyVoice] $*" >&2; exit 1; }

# --- Preflight -------------------------------------------------------------

[[ "${OSTYPE:-}" == darwin* ]] || die "Releases must be built on macOS."

version="$(node -p "require('./package.json').version")"
step "Release preflight for MyVoice $version"

for tool in codesign hdiutil ditto lipo spctl; do
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool"; else missing "$tool (install the Xcode Command Line Tools: xcode-select --install)"; fi
done
for tool in notarytool stapler; do
  if xcrun --find "$tool" >/dev/null 2>&1; then ok "$tool"; else missing "$tool (install the Xcode Command Line Tools: xcode-select --install)"; fi
done

llama_stamp="resources/bin/llama-server.version"
if [[ -x resources/bin/llama-server && -f "$llama_stamp" ]]; then
  ok "llama-server built ($(cat "$llama_stamp"))"
elif command -v cmake >/dev/null 2>&1; then
  ok "cmake found; llama-server will be built"
else
  missing "cmake, needed to build llama-server (brew install cmake, or pipx install cmake)"
fi

if [[ -d node_modules/electron && -x node_modules/.bin/electron-builder ]]; then
  ok "npm dependencies"
else
  missing "npm dependencies (run: npm ci)"
fi

whisper_stamp="resources/bin/whisper-cli.version"
if [[ -x resources/bin/whisper-cli && -f "$whisper_stamp" ]]; then
  ok "whisper-cli built ($(cat "$whisper_stamp"))"
elif command -v cmake >/dev/null 2>&1; then
  ok "cmake found; whisper-cli will be built"
else
  missing "cmake, needed to build whisper-cli (brew install cmake, or pipx install cmake)"
fi

identities="$(security find-identity -v -p codesigning 2>/dev/null || true)"
if [[ -n "$identity" ]]; then
  if grep -qF "$identity" <<<"$identities"; then ok "signing identity: $identity"; else missing "signing identity \"$identity\" is not in the keychain"; fi
else
  identity="$(grep -o '"Developer ID Application: [^"]*"' <<<"$identities" | head -n 1 | tr -d '"' || true)"
  if [[ -n "$identity" ]]; then
    ok "signing identity: $identity"
  else
    missing "Developer ID Application certificate (developer.apple.com > Certificates, IDs & Profiles)"
  fi
fi

# notarytool keeps profiles in the keychain under this service. The lookup is
# local; Apple is not contacted.
if [[ "${MYVOICE_SKIP_PROFILE_CHECK:-}" == "1" ]]; then
  ok "notary profile check skipped (MYVOICE_SKIP_PROFILE_CHECK=1)"
elif security find-generic-password -s "com.apple.gke.notary.tool" \
    -a "com.apple.gke.notary.tool.saved-creds.$notary_profile" >/dev/null 2>&1; then
  ok "notarytool keychain profile: $notary_profile"
else
  missing "notarytool keychain profile \"$notary_profile\". Create it with:
             xcrun notarytool store-credentials $notary_profile --apple-id <Apple ID> --team-id <Team ID>"
fi

if [[ -z "$(git status --porcelain 2>/dev/null)" ]]; then
  ok "git working tree is clean"
else
  missing "uncommitted changes (release from a clean commit)"
fi

if (( problems > 0 )); then
  echo
  die "$problems item(s) missing. Nothing was built."
fi

if [[ "$check_only" == true ]]; then
  echo
  echo "[MyVoice] Ready to release $version."
  exit 0
fi

# --- Build -------------------------------------------------------------------

out_dir="$output_root/$version"
work_dir="$out_dir/work"
rm -rf "$out_dir"
mkdir -p "$work_dir"

step "Building whisper-cli, llama-server, native addon and TypeScript"
bash scripts/build-whisper.sh
bash scripts/build-llama.sh
bash scripts/build-native.sh
npm run build:ts

step "Packaging and signing MyVoice.app (universal)"
# electron-builder wants the certificate name without the type prefix.
identity_name="${identity#Developer ID Application: }"
npx electron-builder --mac dir --universal \
  -c.mac.identity="$identity_name" \
  -c.mac.notarize=false \
  -c.directories.output="$work_dir/build"

app_path="$work_dir/build/mac-universal/MyVoice.app"
[[ -d "$app_path" ]] || die "Could not find the built app at $app_path"

step "Verifying the signature"
codesign --verify --deep --strict --verbose=2 "$app_path"
codesign --display --verbose=2 "$app_path" 2>&1 | grep -q 'flags=0x10000(runtime)' \
  || die "Hardened runtime is not enabled on $app_path"
codesign --verify --strict "$app_path/Contents/Resources/bin/whisper-cli"
entitlements="$(codesign --display --entitlements - --xml "$app_path" 2>/dev/null)"
grep -q 'com.apple.security.cs.allow-jit' <<<"$entitlements" || die "allow-jit entitlement missing"
grep -q 'com.apple.security.device.audio-input' <<<"$entitlements" || die "audio-input entitlement missing"
archs="$(lipo -archs "$app_path/Contents/MacOS/MyVoice")"
[[ "$archs" == *arm64* && "$archs" == *x86_64* ]] || die "MyVoice.app is not universal (archs: $archs)"
echo "[MyVoice] Signed, hardened, universal ($archs)"

notarize() {
  local file="$1" label="$2" result status submission_id
  step "Notarizing $label (this usually takes a few minutes)"
  result="$work_dir/notary-$label.json"
  xcrun notarytool submit "$file" --keychain-profile "$notary_profile" --wait --output-format json > "$result" || true
  status="$(node -p "(() => { try { return require('$result').status || 'unknown'; } catch { return 'unknown'; } })()")"
  if [[ "$status" != "Accepted" ]]; then
    submission_id="$(node -p "(() => { try { return require('$result').id || ''; } catch { return ''; } })()")"
    cat "$result" >&2 || true
    if [[ -n "$submission_id" ]]; then
      xcrun notarytool log "$submission_id" --keychain-profile "$notary_profile" >&2 || true
    fi
    die "Notarization of $label returned status: $status"
  fi
  echo "[MyVoice] $label accepted by the notary service"
}

app_zip="$work_dir/MyVoice.zip"
ditto -c -k --keepParent "$app_path" "$app_zip"
notarize "$app_zip" app
xcrun stapler staple "$app_path"
xcrun stapler validate "$app_path"

step "Creating MyVoice.dmg"
stage="$work_dir/dmg"
mkdir -p "$stage"
ditto "$app_path" "$stage/MyVoice.app"
ln -s /Applications "$stage/Applications"
dmg_path="$out_dir/MyVoice.dmg"
hdiutil create -volname "MyVoice $version" -srcfolder "$stage" -fs HFS+ -format UDZO -ov "$dmg_path" >/dev/null
codesign --sign "$identity" --timestamp "$dmg_path"

notarize "$dmg_path" dmg
xcrun stapler staple "$dmg_path"
xcrun stapler validate "$dmg_path"

step "Checking Gatekeeper"
spctl --assess --type execute --verbose=2 "$app_path"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg_path"

(cd "$out_dir" && shasum -a 256 MyVoice.dmg > MyVoice.dmg.sha256)

step "Release $version is ready"
echo "  $dmg_path"
echo "  $dmg_path.sha256: $(cut -d' ' -f1 "$dmg_path.sha256")"
echo
echo "Nothing was uploaded. To publish, attach both files to a GitHub release tagged v$version."
