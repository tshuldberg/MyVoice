# Timeline Entry Template

## Canonical Format

```markdown
### YYYY-MM-DD: Entry Title (abc1234) ✅ COMPLETED

**What was completed:**

1. **Section Title**
   - Detail about what was done
   - Another detail with specifics (module names, file paths, etc.)

2. **Another Section**
   - Detail
   - More detail

**Technical Decisions:**
- Decision or implementation detail
- Another technical note

**Files Created:**
- `path/to/new/file.ts` — Description of what it contains

**Files Modified:**
- `path/to/existing/file.ts` — What was changed

**Files Deleted:**
- `path/to/removed/file.ts` — Reason for removal

**Verification:**
- `npm run build` — passes
- `npm run dev` — launches correctly

**Next Steps:**
- Future work item discovered during this session
```

## Section Rules

| Section | Required? | When to include |
|---------|-----------|-----------------|
| What was completed | Always | Every entry |
| Technical Decisions | If applicable | When architectural choices were made |
| Files Created | If applicable | When new files were added |
| Files Modified | If applicable | When existing files were changed |
| Files Deleted | If applicable | When files were removed |
| Verification | Recommended | When builds/tests were run |
| Next Steps | Optional | When TODOs were discovered |

## Status Markers

- `✅ COMPLETED` — work is fully done
- `🚧 IN PROGRESS` — work started but not finished
