---
name: add-to-timeline
description: Append a dated session entry to timeline.md documenting completed work, files changed, and technical decisions
argument-hint: [title]
allowed-tools: Read, Edit, Glob, Grep, Bash(git:*), Bash(date:*), AskUserQuestion
---

# Add Timeline Entry

Append a properly-formatted entry to `timeline.md` documenting the current session's work.

## Dynamic Context

Current date: !`date +%Y-%m-%d`
Current branch: !`git branch --show-current`
Recent commits: !`git log --oneline -10`
Files changed (staged + unstaged): !`git diff --stat HEAD~1 2>/dev/null || git diff --stat --cached`
Untracked files: !`git ls-files --others --exclude-standard | head -20`

## Instructions

Follow these steps exactly:

### Step 1: Determine the entry title

- If `$0` was provided, use it as the title
- Otherwise, infer a concise title from the recent git commits and conversation context
- If neither is clear, use AskUserQuestion to ask the user for a title
- Title format: short, descriptive, action-oriented (e.g., "Open-Source Distribution Setup", "Native Addon Refactor", "Silence Detection Improvements")

### Step 2: Gather session work

Review the full conversation context to collect:
1. **What was completed** — group related work into numbered sections with bold headers
2. **Technical decisions** — any architectural choices, library selections, or pattern decisions
3. **Files created** — new files added to the project
4. **Files modified** — existing files that were changed
5. **Files deleted** — files removed from the project
6. **Verification results** — build status, test results
7. **Remaining TODOs** — anything discovered but not completed

Also run `git diff --name-status HEAD~1 2>/dev/null` to cross-check file changes.

### Step 2b: Identify the commit

Include a commit reference in the entry header when possible:

- **If changes have been committed:** Run `git log --oneline -5` and find the commit(s) that correspond to this session's work. Use the short hash (7 chars).
- **If changes are uncommitted:** Note this and omit the commit reference.
- **Multiple commits:** Reference the final one.

The commit reference goes in the entry header line:
```
### YYYY-MM-DD: Entry Title (abc1234) ✅ COMPLETED
```

### Step 3: Format the entry

Use the template from [entry-template.md](entry-template.md). Key rules:

- Date format: `YYYY-MM-DD`
- Header format: `### YYYY-MM-DD: Title (commit_hash) ✅ COMPLETED`
- Status marker: `✅ COMPLETED` (or `🚧 IN PROGRESS` if work is ongoing)
- Number the "What was completed" sections
- Bold the section headers within numbered items
- Use bullet points for details within sections
- Include **only sections that apply** — skip empty sections
- Keep descriptions concise but specific — mention actual module names, file paths

### Step 4: Read the current end of timeline.md

Read the last 30 lines of `timeline.md` to find the correct insertion point. The new entry goes after the last entry in the file.

### Step 5: Append the entry

Use the Edit tool to append the new entry at the end of `timeline.md`. Add a blank line before the new entry header.

### Step 6: Confirm

Display the complete entry that was appended so the user can review it.
