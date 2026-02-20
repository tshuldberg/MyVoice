#!/bin/bash
# Patch the dev Electron.app Info.plist so macOS dock shows "MyVoice"
PLIST="node_modules/electron/dist/Electron.app/Contents/Info.plist"

if [ ! -f "$PLIST" ]; then
  echo "[patch-electron-name] Electron.app plist not found, skipping"
  exit 0
fi

/usr/libexec/PlistBuddy -c "Set :CFBundleName MyVoice" "$PLIST" 2>/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName MyVoice" "$PLIST" 2>/dev/null

echo "[patch-electron-name] Dock name patched to MyVoice"
