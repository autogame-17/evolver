---
name: byterover
description: Manage project knowledge using ByteRover context tree.
metadata:
  openclaw:
    requires:
      bins: ["brv"]
    env: ["BYTEROVER_API_KEY"]
---

# ByteRover

You have access to the `brv` CLI for managing project knowledge and context.
Always use `--headless` for interactive commands like query/curate to avoid TTY blocking.

## Setup
1. **Initialize**: Run `brv init` in the project root if not initialized.
2. **Login**: `brv login -k <key>` (User must provide key).

## Commands

### Query Knowledge
Retrieve context/answers from the knowledge base.
```bash
brv query "How does auth work?" --headless
```
Use `--format json` if you need structured output.

### Curate Knowledge
Save insights, decisions, or patterns to the knowledge base.
```bash
brv curate "Auth uses JWT tokens" --headless
# With files:
brv curate "Auth logic" -f src/auth.ts --headless
```

### Sync
- `brv pull`: Fetch latest context from remote.
- `brv push`: Upload local context to remote.

### Status
- `brv status`: Check project status.

## Notes
- If `brv query` fails saying "daemon not running", try running `brv init` first, or check `brv status`.
- The CLI manages a local "Context Tree". Keep it synced with push/pull.
