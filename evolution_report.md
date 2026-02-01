**Status**: [SUCCESS]

**Changes Implemented**:
- **Hardening (Git Sync)**: Added `timeout` (120s) to all git network operations (fetch, pull, push).
  - Problem: `git-sync` was reporting "locked" frequently, suggesting processes were hanging (likely on network).
  - Fix: Wrapper ensures processes die if they stall, releasing the `flock` and allowing future syncs to proceed.