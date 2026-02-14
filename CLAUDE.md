# MyVoice

## Overview

Privacy-first macOS dictation app. Double-tap the fn key to activate, speak naturally, and transcribed text is typed into the focused text field. All speech recognition runs on-device via Apple's Speech framework -- your voice never leaves your Mac.

## Stack

- **Runtime:** Electron 33+
- **Language:** TypeScript 5.9
- **Native Addon:** Objective-C/Objective-C++ via node-addon-api (N-API)
- **macOS APIs:** SFSpeechRecognizer, AVAudioEngine, CGEvent, NSEvent
- **Build:** electron-builder, node-gyp, electron-rebuild
- **Package Manager:** npm

## Key Commands

```bash
# Development
npm install                 # Install dependencies
npm run dev                 # Build all + launch Electron in dev mode
npm start                   # Launch pre-built app

# Build
npm run build:native        # Compile Objective-C native addon via node-gyp
npm run build:ts            # Compile TypeScript to dist/
npm run build               # Build everything (native + TypeScript)
npm run rebuild             # Rebuild native addon for current Electron version

# Testing
npm test                    # Run tests

# Packaging
npm run package             # Create .dmg via electron-builder
```

## Architecture

### Directory Layout

```
MyVoice/
  src/
    main/                       # Electron main process (TypeScript)
      index.ts                  # App entry point, tray setup, lifecycle
      dictation-controller.ts   # State machine: idle -> recording -> stopping
      overlay-window.ts         # Floating pill BrowserWindow management
      tray.ts                   # Menu bar icon and context menu
      native-bridge.ts          # TypeScript wrappers for native addon
    renderer/                   # Overlay UI (floating pill)
      index.html                # Pill HTML structure
      overlay.css               # Styling, waveform bars, animations
      overlay.ts                # Waveform rendering, IPC event handlers
    native/                     # Objective-C/C++ native addon
      Sources/
        addon.mm                # N-API bindings (ObjC++ -> JS)
        SpeechBridgeImpl.m      # SFSpeechRecognizer + AVAudioEngine
        HotkeyBridgeImpl.m      # fn double-tap detection via NSEvent
        KeyboardBridgeImpl.m    # CGEvent keystroke simulation
      include/
        SwiftBridge.h           # Objective-C interface declarations
      binding.gyp               # node-gyp build configuration
    shared/                     # Shared between main and renderer
      types.ts                  # IPC channel names, payload interfaces
      constants.ts              # Timeouts, dimensions, thresholds
  assets/                       # Tray icons, installer background
  tests/                        # Test files
  dist/                         # Compiled output (gitignored)
```

### State Machine

```
IDLE --(fn double-tap)--> RECORDING --(silence timeout / fn double-tap)--> STOPPING --(text typed)--> IDLE
                                      \--(escape / cancel)--------------> IDLE (no text typed)
```

### IPC Channels

| Channel | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `dictation:start` | Main -> Renderer | `{}` | Show overlay, start waveform |
| `dictation:stop` | Main -> Renderer | `{ transcript: string }` | Dismiss overlay with final text |
| `dictation:audio-level` | Main -> Renderer | `{ level: number }` (0.0-1.0) | Update waveform bars |
| `dictation:partial-text` | Main -> Renderer | `{ text: string }` | Show live partial transcript |
| `dictation:cancel` | Main -> Renderer | `{}` | Cancel dictation, dismiss overlay |
| `dictation:error` | Main -> Renderer | `{ message: string }` | Show error in overlay |
| `overlay:dismissed` | Renderer -> Main | `{}` | Overlay fade-out animation complete |

### Native Addon Bridges

| Bridge | macOS API | Purpose |
|--------|-----------|---------|
| SpeechBridge | SFSpeechRecognizer + AVAudioEngine | On-device speech-to-text with audio level metering |
| HotkeyBridge | NSEvent global monitor (flagsChanged) | Detect fn key double-tap (400ms window) |
| KeyboardBridge | CGEvent | Simulate keystrokes to type text into focused field |

## Testing

Tests live in `tests/`. Run with `npm test`.

## Code Style

- TypeScript strict mode enabled
- Conventional Commits for commit messages
- No lint tool configured yet (future: ESLint)

## Environment Setup

### Prerequisites

- macOS 13 (Ventura) or later
- Node.js 18+
- Xcode Command Line Tools (`xcode-select --install`)
- npm

### Installation

```bash
cd MyVoice
npm install
npm run build
npm run dev
```

On first run, grant these permissions when prompted:
1. **Microphone** -- required for audio capture
2. **Speech Recognition** -- required for on-device transcription
3. **Accessibility** -- required for typing text into other apps via CGEvent

## Git Workflow

### Branch Naming

- `feature/` -- new features
- `fix/` -- bug fixes
- `docs/` -- documentation changes

### Commit Messages

Conventional Commits format:
- `feat(myvoice): add silence timeout configuration`
- `fix(myvoice): handle permission denied gracefully`
- `docs(myvoice): update README with install instructions`

### Merge Strategy

Squash merge to `main`.

## Important Notes

- **Permissions are critical:** The app will not function without Microphone, Speech Recognition, and Accessibility permissions. Accessibility requires manual approval in System Settings > Privacy & Security > Accessibility.
- **On-device only:** `requiresOnDeviceRecognition = YES` ensures zero network calls for speech processing. The on-device speech model must be downloaded (System Settings > Keyboard > Dictation).
- **Menu bar app:** No dock icon. The app runs as a tray-only application (`app.dock.hide()`).
- **Native rebuild required:** After `npm install` or any Electron version change, run `npm run rebuild` to recompile the native addon against the correct Electron headers.
- **fn key behavior:** Double-tap fn avoids conflict with single-tap fn (emoji picker). The 400ms threshold prevents false positives from normal typing.
- **CGEvent limitations:** Some heavily sandboxed apps may not accept CGEvent keystrokes. This is a macOS limitation, not a bug.

## Development Timeline

**File:** timeline.md
Update after every development session.
