---
name: audit-code
description: Run a comprehensive code quality audit against project standards — checks TypeScript compilation, common mistakes, security, and best practices
argument-hint: [scope]
allowed-tools: Read, Glob, Grep, Bash(npm:*), Bash(tsc:*), Bash(git:*), AskUserQuestion
---

# Code Quality Audit

You are running a comprehensive code quality audit for the MyVoice project. Apply the checks below and report findings.

## Dynamic Context

Current branch: !`git branch --show-current`
Recent commits: !`git log --oneline -10`

## Step 1: Determine Scope

From `$0` or by asking the user, determine what to audit:

| Scope | What It Covers |
|-------|---------------|
| `all` | Full codebase audit |
| `main` | Main process TypeScript files only (`src/main/`) |
| `renderer` | Renderer HTML/CSS/JS files only (`src/renderer/`) |
| `native` | Native addon files only (`src/native/`) |
| `recent` | Only files changed in recent commits (last 10 commits) |
| `<path>` | Specific file or directory |

If no scope is provided, use **AskUserQuestion**:
```
"What should I audit?"
Options: "Full codebase", "Main process only", "Recent changes"
```

## Step 2: Run Automated Checks

Execute these checks based on scope. Collect all results before reporting.

### Build Checks

1. **TypeScript compilation:**
   ```bash
   npm run build:ts 2>&1
   ```

2. **Native addon build:**
   ```bash
   ls -la src/native/build/Release/myvoice_native.node 2>&1
   ```

### Pattern Violation Checks

3. **Hardcoded whisper paths:**
   Search for `/opt/homebrew/bin/whisper` or `~/.cache/whisper` literal strings in `src/main/*.ts` (except `dependency-setup.ts`).
   Should use paths from `initDictation()`.

4. **Direct `require('electron')` in renderer without IPC:**
   Verify renderer files use `ipcRenderer` for communication, not direct Electron API calls.

5. **Missing IPC channel registration:**
   Cross-check all `webContents.send()` and `ipcRenderer.on()` calls against `IPC_CHANNELS` in `src/shared/types.ts`.

6. **`show()` instead of `showInactive()` on overlay:**
   Search for `.show()` calls on overlay window — should use `showInactive()` to avoid stealing focus.

7. **Missing `backgroundThrottling: false`:**
   Any BrowserWindow showing real-time data (waveform, progress) needs this flag.

8. **Hardcoded timeout values:**
   Search for numeric literals that should be constants in `src/shared/constants.ts`.

### Security Checks

9. **No hardcoded credentials or tokens:**
   Search for patterns like `token =`, `secret =`, `password =`, `AKIA` with literal string values.

10. **No `.env` files committed:**
    Check that `.env` and `.env.*` are in `.gitignore`.

11. **No `nodeIntegration: true` with external URLs:**
    Verify `nodeIntegration: true` is only used with local file:// URLs, never with remote URLs.

### Dependency Checks

12. **Whisper-cli availability:**
    Check that `dependency-setup.ts` probes both ARM and Intel paths.

13. **Model download uses temp file pattern:**
    Verify downloads write to `.download` first, then rename.

14. **No unused dependencies in `package.json`:**
    Cross-reference dependencies against actual imports.

## Step 3: Categorize Findings

Group all findings by severity:

| Severity | Criteria | Examples |
|----------|----------|---------|
| **CRITICAL** | Security vulnerabilities, data loss risk | Hardcoded credentials, nodeIntegration with remote URLs |
| **HIGH** | Broken functionality, build failures | TypeScript errors, missing native addon, hardcoded paths |
| **MEDIUM** | Best practice violations, inconsistencies | Missing constants, IPC channel mismatch |
| **LOW** | Cosmetic, unused code, minor issues | Unused imports, missing type annotations |

## Step 4: Generate Report

Present findings in this format:

```markdown
# Audit Report — [date]

**Scope:** [what was audited]
**Branch:** [current branch]

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | N |
| HIGH | N |
| MEDIUM | N |
| LOW | N |

## Findings

### [Issue Title]
**Severity:** [level]
**File:** [path:line]
**Problem:** [description]
**Fix:** [specific remediation]

## Overall Assessment

| Area | Grade | Notes |
|------|-------|-------|
| Security | A-F | ... |
| Build Health | A-F | ... |
| Code Patterns | A-F | ... |
| Dependencies | A-F | ... |
```

## Step 5: Offer to Fix

After presenting the report, use **AskUserQuestion**:

```
"I found [N] issues. Would you like me to fix them?"
Options: "Fix all automatically", "Fix critical/high only", "Just save the report", "Let me review first"
```

## Rules

- Never auto-fix without user confirmation
- Report all findings before any fixes
- Always re-verify after applying fixes
- Reference `.claude/docs/common-mistakes.md` for known pitfalls
