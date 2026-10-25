# MyVoice Team Rollout (macOS)

Use this guide to get coworkers running MyVoice with the least friction.

## Recommended path: ship a DMG bundle

This avoids showing the generic Electron icon and gives teammates a normal macOS app install flow.

### 1) Build the DMG

From the repository root (needs the Xcode Command Line Tools and cmake):

```bash
npm ci
npm run package
```

`npm run package` builds the bundled whisper-cli, the universal native addon and the app,
then writes an unsigned universal DMG. Gatekeeper blocks unsigned apps on other Macs, so for
anyone outside your own machine use the signed release (`npm run release:check`, then
`npm run release:mac`; see the README).

Output DMG location (default):

- `${TMPDIR}/myvoice-package/MyVoice-*.dmg`

Optional custom output folder:

```bash
MYVOICE_RELEASE_OUTPUT="$HOME/Desktop/myvoice-package" npm run package
```

### 2) Share the DMG

Share `MyVoice-*.dmg` with coworkers using your normal internal channel (Drive, Slack, company file share, etc.).

### 3) Coworker install steps

1. Open `MyVoice-*.dmg`.
2. Drag **MyVoice.app** to **Applications**.
3. Launch **MyVoice** from Applications.
4. Confirm the one-time 148 MB speech model download.
5. In the Setup window, allow **Microphone** and **Accessibility**, then try the practice field.

## Alternative path: run from source with Codex CLI

Use this only for technical teammates.

### 1) Clone and start

```bash
git clone https://github.com/tshuldberg/MyVoice.git
cd MyVoice
npm ci
npm run build:whisper   # needs cmake; or skip and use a Homebrew whisper-cli while developing
npm run dev
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
