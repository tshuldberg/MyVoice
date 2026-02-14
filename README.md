# MyVoice

**Free, private dictation for macOS. Your voice never leaves your Mac.**

Double-tap `fn`. Start talking. Text appears where your cursor is. That's it.

---

## How It Works

1. **Double-tap `fn`** -- A floating pill overlay appears, showing a live waveform.
2. **Speak naturally** -- Your words are transcribed in real time, entirely on-device.
3. **Text is typed automatically** -- Transcribed text appears in whatever app you're using. No paste, no copy, no extra steps.

Works in every text field: Safari, Chrome, VS Code, Slack, iMessage, Notes, Terminal, and more.

---

## Install

1. Download `MyVoice.dmg` from [Releases](https://github.com/your-repo/MyVoice/releases).
2. Open the `.dmg` and drag **MyVoice** to your Applications folder.
3. Launch MyVoice. A microphone icon appears in your menu bar.
4. Double-tap `fn` to dictate for the first time. macOS will ask for three permissions:
   - **Microphone** -- so MyVoice can hear you
   - **Speech Recognition** -- so macOS can transcribe on-device
   - **Accessibility** -- so MyVoice can type into text fields

Grant all three. You're ready.

---

## Privacy

MyVoice processes everything on your Mac using Apple's built-in Speech framework. Here is what that means in practice:

- **No cloud.** Your audio is never uploaded anywhere. Transcription runs on-device via Apple's `SFSpeechRecognizer` with the `.onDeviceRecognition` flag.
- **No accounts.** There is no sign-up, no login, no user tracking of any kind.
- **No telemetry.** MyVoice makes zero network requests. None. You can verify this with any network monitor.
- **No data storage.** Audio is discarded immediately after transcription. MyVoice does not keep recordings, logs, or transcripts.
- **Works offline.** Since everything is on-device, MyVoice works without an internet connection.

Your voice is yours. We built MyVoice so it stays that way.

---

## Why MyVoice

The dictation landscape on macOS is broken. Cloud-dependent tools charge monthly fees and send your voice to remote servers. Apple's built-in dictation is unreliable and limited. MyVoice exists because you should not have to choose between privacy and usability.

### Comparison

| | **MyVoice** | **Wispr Flow** | **Superwhisper** | **macOS Dictation** |
|---|---|---|---|---|
| **Price** | Free forever | $15/mo (Pro) | $8.49/mo or $249 lifetime | Free (with macOS) |
| **Privacy** | 100% on-device. Zero network calls. | Cloud-only. Audio sent to OpenAI/Meta servers. Screenshots of your screen captured for "context." | Local or cloud (user choice). Local mode keeps data on-device. | On-device option available, but cloud is default. Apple receives data unless you disable it. |
| **Offline** | Yes | No (requires internet) | Yes (local models) | Partially (on-device model must be downloaded) |
| **Accuracy** | Good (Apple Speech framework) | Very high (~97%, cloud AI models) | Very high (Whisper models, varies by size) | Moderate (~85-90% quiet room, drops in noise) |
| **AI formatting** | No (raw transcription) | Yes (removes filler words, fixes grammar) | Yes (custom prompts, reformatting) | No |
| **Timeout** | Auto-stop on 1.5s silence (configurable) | None | None | 30-60 second hard limit |
| **Activation** | Double-tap `fn` | Keyboard shortcut | Keyboard shortcut | Press mic icon or `fn` (single) |
| **Open source** | Yes (MIT) | No | No | No |
| **Data collection** | None | Voice + screenshots sent to cloud. 30-day retention (or zero with Privacy Mode). | Depends on model choice. Local = none. Cloud = third-party processing. | Apple may collect voice data to "improve Siri." |
| **Account required** | No | Yes | Yes (App Store) | No (Apple ID for macOS) |

### Where MyVoice wins

- **Cost:** $0 today. $0 tomorrow. $0 forever. No trials, no tiers, no upsells.
- **Privacy:** Competitors either require cloud processing (Wispr) or make local processing a paid upgrade (Superwhisper). MyVoice is local-only by design -- there is no cloud option, which means there is no surface area for data exposure.
- **Simplicity:** No model downloads, no configuration, no prompt engineering. Double-tap `fn` and talk.
- **Transparency:** MIT-licensed and open source. Read every line of code. Build it yourself if you want.

### Where competitors win

- **Accuracy:** Wispr and Superwhisper use cloud AI models that produce higher accuracy than Apple's on-device speech framework, especially in noisy environments or with accents.
- **AI post-processing:** Wispr and Superwhisper can clean up filler words, fix grammar, and reformat text. MyVoice gives you raw transcription.
- **Language breadth:** Wispr supports 100+ languages. MyVoice supports whatever Apple's on-device model supports for your locale.

If you need AI-powered reformatting or the highest possible accuracy and don't mind paying for cloud processing, Wispr or Superwhisper may be better fits. If you want free, private, simple dictation that works offline and never phones home, MyVoice is the answer.

---

## Requirements

- macOS 13 (Ventura) or later
- Apple Silicon (M1/M2/M3/M4) or Intel Mac
- Microphone (built-in or external)
- ~150MB disk space

---

## Usage

### Dictate

1. Double-tap `fn` -- the overlay pill appears and MyVoice starts listening.
2. Speak naturally. You'll see a live waveform and partial transcription in the overlay.
3. Stop speaking. After 1.5 seconds of silence, MyVoice auto-stops and types the transcribed text into your focused app.
4. Alternatively, double-tap `fn` again to stop manually, or press `Escape` to cancel without typing.

### Menu Bar

Click the microphone icon in your menu bar to access:

- **Status** -- shows whether MyVoice is idle or recording
- **Settings** -- configure silence timeout, launch at login, and hotkey
- **Quit** -- exit MyVoice

---

## Building from Source

```bash
git clone https://github.com/your-repo/MyVoice.git
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

---

## Tech Stack

- **Electron** -- desktop runtime
- **TypeScript** -- application logic
- **Objective-C (native addon)** -- bridges to Apple's SFSpeechRecognizer, CGEvent (keystroke simulation), and NSEvent (hotkey detection)
- **Apple Speech Framework** -- on-device transcription engine

---

## License

MIT License. See [LICENSE](LICENSE) for details.

Free to use, modify, and distribute.

---

## App Store Description

> **MyVoice -- Free Private Dictation**
>
> Dictate text into any app on your Mac. Double-tap fn, start talking, and your words appear where your cursor is.
>
> MyVoice is completely free and completely private. All speech recognition happens on your Mac using Apple's built-in Speech framework. Your voice is never sent to any server, ever.
>
> FEATURES
> - Works in any text field in any app
> - Real-time waveform visualization
> - Live partial transcription as you speak
> - Auto-stops after a brief silence
> - Configurable silence timeout and hotkey
> - Menu bar icon for quick access
> - No account required
>
> PRIVACY
> - Zero cloud processing -- everything stays on your Mac
> - Zero network requests -- works fully offline
> - Zero data collection -- no analytics, no telemetry
> - Zero accounts -- no sign-up, no login
> - Open source (MIT License)
>
> REQUIREMENTS
> - macOS 13 (Ventura) or later
> - Microphone, Speech Recognition, and Accessibility permissions
>
> MyVoice is and always will be free. No subscriptions. No in-app purchases. No ads.
