# Common Mistakes

Things that have gone wrong before. Check this list before submitting code.

## Electron / Main Process

| Mistake | Correct Approach |
|---------|-----------------|
| Hardcoding whisper paths (`/opt/homebrew/bin/whisper-cli`) | Use paths from `initDictation()` — resolved at startup by `dependency-setup.ts` |
| Creating BrowserWindows with `contextIsolation: true` | Use `contextIsolation: false` — the renderer needs direct `require('electron')` for IPC |
| Forgetting `backgroundThrottling: false` on overlay | Overlay must update waveform in real-time even when not focused |
| Using `overlayWindow.show()` instead of `showInactive()` | `show()` steals focus from the user's active app; `showInactive()` keeps focus where it belongs |
| Adding dock icon or taskbar presence | App is menu-bar-only — `app.dock.hide()` in `index.ts`, `skipTaskbar: true` on windows |
| Calling `toggleDictation()` before `initDictation()` | Guard exists in `startDictation()` but always ensure startup pipeline completes first |

## Native Addon

| Mistake | Correct Approach |
|---------|-----------------|
| Building native addon with system Node headers | Use `npm run build:native` which targets Electron headers via `--runtime=electron --target=<version>` |
| Forgetting to rebuild after Electron version change | Run `npm run rebuild` after any `electron` version bump in `package.json` |
| Using SFSpeechRecognizer for transcription | We use whisper-cli now — native addon only handles audio recording (AVAudioEngine), hotkey (NSEvent), and keyboard simulation (CGEvent) |
| Modifying `binding.gyp` without testing both architectures | Test on both ARM (`/opt/homebrew`) and Intel (`/usr/local`) if possible |

## TypeScript

| Mistake | Correct Approach |
|---------|-----------------|
| Using ES module syntax (`import x from 'x'`) for native addon | Use `require()` — the native `.node` file is CommonJS |
| Adding new IPC channels without updating `types.ts` | All IPC channel names must be in `IPC_CHANNELS` const in `src/shared/types.ts` |
| Using `setTimeout` return type as `number` | Use `ReturnType<typeof setTimeout>` — Electron's timer types differ from browser |

## Dependency Setup

| Mistake | Correct Approach |
|---------|-----------------|
| Downloading model directly to final path | Write to `.download` temp file first, then `rename` on completion — prevents partial downloads from being used |
| Not checking model file size after download | Verify `> 100MB` — partial downloads pass existence checks but fail at runtime |
| Assuming Homebrew is always at `/opt/homebrew/bin/brew` | Check both `/opt/homebrew/bin/brew` (ARM) and `/usr/local/bin/brew` (Intel) |
| Using `child_process.exec()` for brew install | Use `execFile()` — avoids shell injection and handles arguments properly |

## Git / Packaging

| Mistake | Correct Approach |
|---------|-----------------|
| Committing `.node` binary files | `.gitignore` has `*.node` — these are build artifacts |
| Committing `dist/` directory | `.gitignore` has `dist/` — always build from source |
| Committing `.env` or credentials | `.gitignore` has `.env` and `.env.*` |
| Including `node_modules` in `.dmg` | `electron-builder` handles this — don't manually copy |
