# AGENTS.md

Project-specific agent instructions for `/Users/trey/Desktop/Apps/MyLife/MyVoice`.

## Instruction Pair (Critical)

- Keep this file and `CLAUDE.md` synchronized for persistent project rules.
- When a long-lived workflow or constraint changes, update both files in the same session.

## Startup Checklist

- Read `AGENTS.md` and `CLAUDE.md` before making substantial edits.
- Review `.claude/settings.json` for local execution constraints and enabled agent teams.
- Review `.claude/docs/architecture.md` for startup flow, IPC boundaries, and module ownership.
- Review `.claude/docs/common-mistakes.md` for known Electron, native addon, and packaging pitfalls.
- Review `.claude/skills/SKILLS_REGISTRY.md` for local workflow shortcuts.

## TypeScript Requirement (Critical)

- Default to TypeScript for runtime code whenever feasible.
- Keep shared types and constants in `src/shared/`.
- Use JavaScript or Objective-C only where the Electron or native addon toolchain requires it.

## Core Engineering Rules (Critical)

- Define all IPC channel names in `IPC_CHANNELS` in `src/shared/types.ts`. Never use ad hoc string literals.
- Keep shared timeout and dimension constants in `src/shared/constants.ts`. Do not hardcode numeric values in feature code.
- Resolve whisper paths through `initDictation()`. Do not hardcode Homebrew paths in dictation logic.
- Use `showInactive()` for overlay windows so the app does not steal focus.
- Use `execFile()` for subprocesses.
- Load the native `.node` addon with `require()`, not ESM `import`.
- Keep the app menu-bar-only: `app.dock.hide()` and `skipTaskbar: true`.

## Validation Requirements (Critical)

- For runtime changes, run `npm run build:ts`, `npm run build`, and `npm test` before finalizing work.
- Run `npm run dev` when the task requires launch validation or interactive behavior checks.
- Rebuild the native addon with `npm run rebuild` after Electron version changes.

## Security Rules

- Never commit secrets or credentials.
- Keep secrets in `.env` files, not committed configs.
- Do not store tokens in `.claude/settings.json`.
- Load remote content only with the Electron security constraints documented in `CLAUDE.md`.

## Agent Teams

- Agent team support is enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `.claude/settings.json`.
- Local agent definitions live in `.claude/agents/`.
- Workspace-level agent definitions are also available from `/Users/trey/Desktop/Apps/.claude/agents/`.
- Use the ownership boundaries in `CLAUDE.md` to avoid edit conflicts across `src/main/`, `src/renderer/`, `src/native/`, `src/shared/`, tests, and docs.

## Development Tracking

- Update `timeline.md` after every development session.
- Use the local timeline skill when the task matches that workflow.

## Writing Style

- Do not use em dashes in documents or writing.

### Code Intelligence

Prefer LSP over Grep/Read for code navigation:
- `workspaceSymbol` to find definitions
- `findReferences` to trace call sites
- `goToDefinition` / `goToImplementation` to jump to source
- `hover` for type info without reading full files

Use Grep for text and config searches when LSP is not enough.
