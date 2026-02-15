# MyVoice

**Private dictation for Mac that never sends your voice to the cloud.**

Double-tap `fn`, speak naturally, and your words appear where your cursor is.

[Download MyVoice for macOS](https://github.com/tshuldberg/MyVoice/releases) | [View Source on GitHub](https://github.com/tshuldberg/MyVoice)

<a href="https://buymeacoffee.com/TreyTre"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-%E2%98%95-orange?style=flat-square" alt="Buy Me a Coffee"></a>

---

## Why MyVoice

Most dictation tools force a tradeoff: convenience or privacy.

Cloud-based products can be accurate, but they require trust, accounts, and often monthly fees. Built-in dictation can be limiting for people who dictate throughout the day.

MyVoice gives you a simple dictation workflow without cloud transcription:

- Start dictation with a double-tap of `fn`
- Speak naturally while a lightweight overlay shows status
- Auto-stop on silence and type directly into your focused text field

No copy/paste workflow. No prompt writing. No extra editor.

---

## How It Works

1. **Double-tap `fn`** to start dictation.
2. **Speak naturally** while MyVoice transcribes on-device with whisper.cpp.
3. **Pause briefly** and MyVoice auto-stops and types into the focused app.
   - You can adjust the auto-stop pause delay from the tray menu (`Auto-Stop Pause`).
4. **Press `Escape`** anytime to cancel.

Works in common text fields across macOS apps.

---

## Privacy

MyVoice is built for privacy-first dictation:

- **No cloud transcription**. Speech recognition runs on-device with whisper.cpp.
- **No account required**. No signup or login.
- **No telemetry after setup**. No ongoing cloud dependency for normal dictation.
- **Works offline** after one-time setup.

---

## Key Benefits

- **Keep your data local**: speech is transcribed on your Mac.
- **Use it anywhere you type**: works in everyday macOS apps and editors.
- **Pay nothing**: free forever, no subscription tiers.
- **Inspect the code**: open source under MIT.

---

## Install

1. Download `MyVoice.dmg` from [Releases](https://github.com/tshuldberg/MyVoice/releases).
2. Open the `.dmg` and drag **MyVoice** to your Applications folder.
3. Launch MyVoice. On first launch, MyVoice will:
   - Install `whisper-cpp` via Homebrew (if missing)
   - Download the speech model (~148MB, one-time)
4. Grant both required macOS permissions when prompted:
   - **Microphone**
   - **Accessibility**

> [Homebrew](https://brew.sh) is required. If missing, MyVoice will offer to open the install page on first launch.

---

## Requirements

- macOS 13 (Ventura) or later
- Apple Silicon or Intel Mac
- [Homebrew](https://brew.sh) (for whisper-cpp installation)
- Microphone (built-in or external)
- ~300MB disk space (app + whisper model)
- Release artifacts are architecture-specific (`arm64` when built on Apple Silicon, `x64` when built on Intel)

---

## Building From Source

```bash
git clone https://github.com/tshuldberg/MyVoice.git
cd MyVoice
npm install
npm run build:native    # Compile native addon (requires Xcode CLI tools)
npm run dev             # Launch in development mode
```

To package a distributable `.dmg`:

```bash
npm run build
npm run package
```

By default, `npm run package` writes output to `${TMPDIR}/myvoice-release` (outside Desktop/iCloud-managed paths) to avoid macOS metadata issues during code signing.

For public release (Developer ID signed + notarized):

```bash
export APPLE_API_KEY=/absolute/path/AuthKey_XXXXXX.p8
export APPLE_API_KEY_ID=XXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
npm run release:mac
```

---

## Support

If MyVoice saves you time, you can support development:

<a href="https://buymeacoffee.com/TreyTre"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-%E2%98%95-orange?style=for-the-badge" alt="Buy Me a Coffee"></a>

---

## License

MIT License. See [LICENSE](LICENSE) for details.
