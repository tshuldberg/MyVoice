# MyVoice Team Rollout (macOS)

Use this guide to get coworkers running MyVoice with the least friction.

## Recommended path: ship a DMG bundle

This avoids showing the generic Electron icon and gives teammates a normal macOS app install flow.

### 1) Build the DMG

```bash
cd /Users/trey/Desktop/Apps/MyVoice
npm install
npm run build
npm run package
```

Output DMG location (default):

- `${TMPDIR}/myvoice-release/MyVoice-*.dmg`

Optional custom output folder:

```bash
MYVOICE_RELEASE_OUTPUT="$HOME/Desktop/myvoice-release" npm run package
```

### 2) Share the DMG

Share `MyVoice-*.dmg` with coworkers using your normal internal channel (Drive, Slack, company file share, etc.).

### 3) Coworker install steps

1. Open `MyVoice-*.dmg`.
2. Drag **MyVoice.app** to **Applications**.
3. Launch **MyVoice** from Applications.
4. On first launch, approve prompts for:
   - Microphone
   - Accessibility

## Alternative path: run from source with Codex CLI

Use this only for technical teammates.

### 1) Clone and start

```bash
git clone https://github.com/tshuldberg/MyVoice.git
cd MyVoice
npm install
npm run start
```

### 2) Required macOS permissions when launched from Terminal/Codex

When MyVoice is started by a terminal process, macOS may require permissions for the terminal host app in addition to MyVoice.

Open **System Settings -> Privacy & Security** and verify:

- `Microphone`: enable **MyVoice** (and **Terminal** if prompted there)
- `Accessibility`: enable **MyVoice** and **Terminal**
- `Input Monitoring`: enable **Terminal** if macOS prompts for it

If hotkeys or text injection do not work, quit MyVoice, re-check the settings above, and relaunch.

## Best practice for coworker rollout

For non-technical coworkers, distribute only the DMG build path above.  
Use the Codex/Terminal path only for developers or internal testing.
