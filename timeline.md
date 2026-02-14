# MyVoice -- Timeline

## 2026-02-13 -- Project Created

**What:** Designed and built MyVoice from scratch as a privacy-first macOS dictation app.

**Changes:**
- Created project scaffold: Electron + TypeScript + Objective-C native addon
- Implemented three native bridges: SpeechBridge (SFSpeechRecognizer + AVAudioEngine), HotkeyBridge (NSEvent fn double-tap detection), KeyboardBridge (CGEvent keystroke simulation)
- Built N-API addon wrapper (addon.mm) bridging Objective-C to Node.js
- Created TypeScript wrappers for the native addon
- Built floating pill overlay with waveform visualization (10 bars, 20 FPS, smoothed)
- Implemented dictation controller state machine (idle -> recording -> stopping)
- Created system tray with status display, launch-at-login toggle, quit
- Wired end-to-end flow: fn double-tap -> speech capture -> overlay display -> text injection
- Added project documentation: CLAUDE.md, README.md, timeline.md

**Design decisions:**
- Used Objective-C instead of Swift for native bridges (eliminates Swift-ObjC bridging complexity, same macOS APIs)
- On-device recognition only (`requiresOnDeviceRecognition = YES`) for absolute privacy
- 400ms double-tap threshold for fn key to avoid conflict with emoji picker
- 1.5s silence timeout for auto-stop, configurable in future
- Electron chosen for fast iteration; native Swift rewrite planned for v2 App Store distribution
