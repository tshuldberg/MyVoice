---
name: resume-session
description: Resume a development session — loads recent timeline, git state, open TODOs, and pending work to get up to speed fast
argument-hint: [focus-area]
allowed-tools: Read, Glob, Grep, Bash(git:*), Bash(date:*), Bash(npm:*), AskUserQuestion
---

# Resume Session

Quickly catch up on project state and pick up where the last session left off.

## Dynamic Context

Current date: !`date +%Y-%m-%d`
Current branch: !`git branch --show-current`
Branch list: !`git branch --list --no-color | head -15`
Uncommitted changes: !`git status --short | head -30`
Recent commits (last 15): !`git log --oneline -15`
Last timeline entry: !`tail -80 timeline.md`
Open TODOs from timeline: !`grep -n "TODO\|todo\|FIXME\|fixme\|🚧\|IN PROGRESS" timeline.md | tail -20`

## Instructions

### Step 1: Determine focus

- If `$0` is provided, use it to narrow the briefing (e.g., `native`, `main-process`, `renderer`, a branch name, or a feature name)
- Otherwise, give a full-project briefing

### Step 2: Git State Summary

Present the current working state:

1. **Current branch** and how it relates to `main` (ahead/behind)
   - Run: `git rev-list --left-right --count main...HEAD 2>/dev/null` to get ahead/behind counts
2. **Uncommitted changes** — list modified/untracked files (from dynamic context above)
3. **Recent commit history** — summarize the last 5-10 commits on this branch, grouped by theme if possible
4. **Stash** — check `git stash list` for any stashed work
5. **Open branches** — note any feature branches besides the current one

Format as a compact table or bullet list — not verbose paragraphs.

### Step 3: Last Session Recap

Read the last 2 entries from `timeline.md` (the dynamic context has the tail). Summarize:

1. **What was completed** — the key deliverables from the last 1-2 sessions
2. **Open TODOs** — anything explicitly marked as remaining work
3. **Known issues** — any bugs, tech debt, or warnings noted

### Step 4: Pending Items

Collect all outstanding work from multiple sources:

1. **Timeline TODOs** — grep results from dynamic context
2. **PR review feedback** — check for open PRs:
   ```bash
   gh pr list --head "$(git branch --show-current)" --state open --json number,title 2>/dev/null
   ```
3. **Plan docs** — check `docs/plans/` for any active plans (if directory exists)

Present as a prioritized list with source attribution:
```
| # | Item | Source | Priority |
|---|------|--------|----------|
| 1 | ... | timeline.md TODO | High |
| 2 | ... | PR feedback | Medium |
```

Priority rules:
- **High** — blocking other work, bugs, or explicitly marked urgent
- **Medium** — next logical step, referenced in recent timeline entries
- **Low** — nice-to-have, future work, or speculative

### Step 5: Environment Health Check

Run quick checks (skip any that fail — don't block on them):

1. **TypeScript build**: `npm run build:ts 2>&1 | tail -5`
2. **Native addon**: Check if `src/native/build/Release/myvoice_native.node` exists
3. **Whisper deps**: Check if `whisper-cli` exists and model is present at `~/.cache/whisper/ggml-base.en.bin`

Report status as a one-line summary:
```
TS build: OK | Native addon: built | Whisper: cli ✓, model ✓
```

If anything fails, flag it as the **first priority item**.

### Step 6: Recommended Next Steps

Based on everything gathered, suggest 2-3 concrete next actions:

1. The highest-priority pending item
2. Any uncommitted work that needs to be committed or cleaned up
3. The next logical step from the last session's TODOs

Format as a numbered action list with brief rationale.

### Step 7: Present the Briefing

Output everything in this structure:

```
## Session Briefing — YYYY-MM-DD

### Git State
[Step 2 output]

### Last Session
[Step 3 output]

### Pending Work
[Step 4 table]

### Environment
[Step 5 one-liner]

### Recommended Next Steps
[Step 6 action list]
```

Keep it scannable — use tables, bullets, and bold headers. The entire briefing should fit in one screen (~40-60 lines).

### Step 8: Ask for direction

After presenting the briefing, use AskUserQuestion to ask:

> "What would you like to focus on this session?"

Offer the top 2-3 recommended actions as options, plus an "Other" escape hatch.
