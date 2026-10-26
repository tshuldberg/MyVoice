# MyVoice

> **Retired by Trey on October 25, 2026. Do not use, install, build, or deploy.** Source and Git history are retained only as an inactive archive. The final work snapshot is unfinished and is not a supported release.

**Private dictation for Mac that never sends your voice to the cloud.**

Double-tap `fn` (or hold it), speak naturally, and your words appear where your cursor is.

[Download MyVoice for macOS](https://github.com/tshuldberg/MyVoice/releases/latest) | [View Source on GitHub](https://github.com/tshuldberg/MyVoice)

<a href="https://buymeacoffee.com/TreyTre"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-%E2%98%95-orange?style=flat-square" alt="Buy Me a Coffee"></a>

---

## Why MyVoice

Most dictation tools force a tradeoff: convenience or privacy.

Cloud-based products can be accurate, but they require trust, accounts, and often monthly fees. Built-in dictation can be limiting for people who dictate throughout the day.

MyVoice runs [whisper.cpp](https://github.com/ggml-org/whisper.cpp) on your Mac, so speech never leaves it.

---

## What it does

- **Start the way you like.** Double-tap `fn` for hands-free dictation that stops when you pause, hold `fn` while you talk, or both. An extra shortcut of your own works too, and `Escape` cancels.
- **See words as you speak.** The overlay shows a live preview while you dictate.
- **Modes that switch by app.** A mode bundles the model, language, formatting, cleanup and how text is inserted. Assign apps to a mode and it switches on by itself: the built-in Verbatim mode keeps exact words in Terminal, iTerm, Ghostty and Warp.
- **Spoken commands.** "new line", "new paragraph" and "scratch that" in every mode that has them on; optional spoken punctuation ("comma", "question mark", "open quote").
- **Clean text.** Filler words and stutters are removed, sentences and lists are formatted, and text fits the cursor: a space after a word, lowercase mid-sentence.
- **Your dictionary.** Vocabulary teaches MyVoice names and jargon and keeps their spelling, and can optionally fix near-misses such as "kubernetties". Replacements turn "my work email" into your address, and "at sign" or "dot com" into symbols. Import and export as CSV.
- **American or British spelling** per mode.
- **History you can search.** Every dictation is saved on your Mac with its app, mode and length. Search all days, copy, reformat with another mode, or delete. Retention is up to you, from one day to forever, or no history at all.
- **Transcribe files.** Drop an audio or video file (WAV, MP3, M4A, FLAC, Ogg, AIFF, MP4, MOV) on History.
- **Record meetings.** Record your microphone and the Mac's own audio (a video call, for example) and get a transcript with "You" and "Others" turns. Use headphones for the cleanest result; macOS asks once for Screen & System Audio Recording.
- **Models and languages.** Eight whisper models from Tiny to Large v3 Turbo, English-only or multilingual, with translation to English. Download, switch and delete them in Models.
- **Delivery options.** Paste (your clipboard, including images, is restored afterward), type character by character for fields that block paste, or copy only. Optionally press Return after inserting, for chat apps.
- **Paste the last dictation again** from the menu bar or a shortcut.
- **Optional local AI cleanup.** Point MyVoice at a model server you run yourself (Ollama, LM Studio or llama.cpp's server) to polish text, with your own instructions per mode ("turn this into a short email reply"). Only addresses on your own Mac are accepted.
- **Headphones keep their sound.** Optionally skip Bluetooth microphones, so AirPods do not drop to call-quality audio while you dictate.
- **Automation.** With "Allow other apps to control MyVoice" on, Shortcuts, Raycast or a script can open `myvoice://start`, `stop`, `toggle`, `cancel`, `paste-last` or `mode/<mode id>`.

### History from the terminal and AI assistants

MyVoice ships a small read-only tool that runs with your own Node.js (18 or later):

```bash
H="/Applications/MyVoice.app/Contents/Resources/cli/myvoice-history.js"
node "$H" search budget review      # all words must match, newest first
node "$H" recent --days 7 --json
node "$H" stats
```

It is also an MCP server, so an assistant can search what you dictated. For Claude Code:

```bash
claude mcp add myvoice-history -- node "/Applications/MyVoice.app/Contents/Resources/cli/myvoice-history.js" mcp
```

Tools: `search_dictation_history`, `recent_dictations`, `dictation_stats`. Both the tool and the server read local files only.

---

## Privacy

- **Speech stays on your Mac.** Transcription runs locally. Each recording is deleted as soon as it is transcribed.
- **No account, no telemetry.**
- **The network is used only for:**
  - downloading speech models from Hugging Face (the first one at first launch, after you confirm), each checked against its published SHA-256;
  - "Check for Updates…", which asks GitHub for the latest release when you click it (or once a day, if you turn that on);
  - local AI cleanup, if you turn it on, which talks only to a server on your own Mac.
- **History** is plain text in `~/Library/Application Support/MyVoice/recording-logs`. Turn it off or limit it in Settings > Privacy.

---

## Install

1. Download `MyVoice.dmg` from the [latest release](https://github.com/tshuldberg/MyVoice/releases/latest).
2. Open the DMG and drag **MyVoice** to **Applications**.
3. Open MyVoice. Confirm the one-time speech model download (148 MB).
4. The Setup window asks for two macOS permissions:
   - **Microphone**, to hear you while you dictate.
   - **Accessibility**, to notice the `fn` key and paste at your cursor.
5. Click in the practice box, double-tap `fn`, say a sentence, and pause.

**If `fn` opens the emoji picker or Apple Dictation:** open System Settings > Keyboard, set "Press 🌐 key to" to "Do Nothing", and give Dictation a shortcut other than pressing `fn` twice. Or set your own MyVoice shortcut in Settings.

**If text stops appearing after an update:** open System Settings > Privacy & Security > Accessibility, select MyVoice, remove it with the minus button, and add it again.

## Updates

Choose **Check for Updates…** in the menu bar menu, or turn on "Check for updates automatically once a day" in Settings > Privacy (off by default). When a new version is out, download it, quit MyVoice and drag the new copy into Applications. Settings, modes, dictionary and history stay.

## Requirements

- macOS 13 (Ventura) or later, on Apple silicon or Intel (one universal download)
- A microphone
- About 400 MB of disk space with the default model; more for larger models

---

## Building From Source

You need Node.js 22, the Xcode Command Line Tools and [cmake](https://cmake.org) (`brew install cmake` or `pipx install cmake`).

```bash
git clone https://github.com/tshuldberg/MyVoice.git
cd MyVoice
npm ci
npm run build:whisper   # builds whisper-cli v1.9.5 (pinned commit) into resources/bin/
npm run dev             # builds the native addon and TypeScript, then starts MyVoice
npm test
```

`npm run build:native:host` builds the addon for this Mac only, which is faster while developing.

To package an unsigned universal DMG for testing on your own Mac:

```bash
npm run package
```

### Releasing (signed and notarized)

Once per Mac, with a Developer ID Application certificate in the login keychain, store notarization credentials under a keychain profile (the default name is `myvoice`):

```bash
xcrun notarytool store-credentials myvoice --apple-id <Apple ID> --team-id <Team ID>
```

Then:

```bash
npm run release:check   # reports anything missing; builds nothing
npm run release:mac     # build, sign, notarize, staple, verify, MyVoice.dmg + SHA-256
```

The release script never uploads anything. Attach `MyVoice.dmg` and `MyVoice.dmg.sha256` to a GitHub release yourself.

---

## Support

If MyVoice saves you time, you can support development:

<a href="https://buymeacoffee.com/TreyTre"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-%E2%98%95-orange?style=for-the-badge" alt="Buy Me a Coffee"></a>

---

## License

MIT License. See [LICENSE](LICENSE) for details.
