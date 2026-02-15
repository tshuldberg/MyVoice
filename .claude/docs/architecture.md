# Project Architecture

## Directory Map

| Directory | Owns | Purpose |
|-----------|------|---------|
| `src/main/` | Electron main process | App lifecycle, tray, dictation controller, dependency setup, native bridge |
| `src/renderer/` | Overlay UI | Floating pill HTML/CSS/JS, setup progress window |
| `src/native/` | Objective-C/C++ addon | AVAudioEngine recording, CGEvent keystrokes, NSEvent hotkey |
| `src/shared/` | Shared types/constants | IPC channel names, state types, timeouts, dimensions |
| `assets/` | Static resources | Tray icons, installer background images |
| `tests/` | Test files | Unit and integration tests |
| `dist/` | Build output | Compiled TypeScript (gitignored) |

## Main Process Modules

| Module | Responsibility |
|--------|---------------|
| `index.ts` | App entry point — single instance lock, dock hide, startup pipeline |
| `dependency-setup.ts` | First-launch setup — probe/install whisper-cli, download model, progress UI |
| `dictation-controller.ts` | State machine (idle → recording → stopping), silence detection, Whisper transcription |
| `overlay-window.ts` | Frameless BrowserWindow management — show/hide/position the floating pill |
| `tray.ts` | Menu bar icon, context menu, recording state indicator |
| `native-bridge.ts` | TypeScript wrappers around the native N-API addon |

## Startup Pipeline

```
app.whenReady()
  → ensureWhisperReady()     # Blocks until whisper-cli + model are available
    → probeWhisperCli()      # Check /opt/homebrew, /usr/local, PATH
    → probeHomebrew()        # If whisper missing, need brew to install
    → installWhisperCli()    # brew install whisper-cpp (with progress UI)
    → probeModel()           # Check ~/.cache/whisper/ggml-base.en.bin
    → downloadModel()        # HTTPS download from Hugging Face (with progress UI)
  → createTray()
  → createOverlayWindow()
  → initDictation(paths)    # Pass resolved whisper-cli + model paths
  → hotkeyStart()           # Begin listening for fn double-tap
  → globalShortcut('Escape') # Cancel active dictation
```

## State Machine

```
IDLE --(fn double-tap)--> RECORDING --(silence timeout / fn double-tap)--> STOPPING --(text typed)--> IDLE
                                      \--(escape / cancel)--------------> IDLE (no text typed)
```

## IPC Channels

| Channel | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `dictation:start` | Main → Renderer | `{}` | Show overlay, start waveform |
| `dictation:stop` | Main → Renderer | `{ transcript: string }` | Dismiss overlay with final text |
| `dictation:audio-level` | Main → Renderer | `{ level: number }` (0.0-1.0) | Update waveform bars |
| `dictation:partial-text` | Main → Renderer | `{ text: string }` | Show live partial transcript |
| `dictation:cancel` | Main → Renderer | `{}` | Cancel dictation, dismiss overlay |
| `dictation:error` | Main → Renderer | `{ message: string }` | Show error in overlay |
| `setup:progress` | Main → Renderer | `{ message, percent }` | Update setup progress window |

## Native Addon Bridges

| Bridge | macOS API | Purpose |
|--------|-----------|---------|
| SpeechBridge | AVAudioEngine | Audio recording to WAV with level metering |
| HotkeyBridge | NSEvent global monitor (flagsChanged) | Detect fn key double-tap (400ms window) |
| KeyboardBridge | CGEvent | Simulate keystrokes to type/paste text into focused field |

## Dependency Chain

```
whisper-cpp (Homebrew)     → whisper-cli binary
ggml-base.en.bin (HF)     → speech model (~148MB)
node-addon-api (npm)       → N-API bindings for native code
Xcode CLI Tools            → compile native Objective-C addon
Electron                   → desktop runtime + BrowserWindow
```
