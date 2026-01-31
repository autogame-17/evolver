# Capability Evolver

A system for tracking, analyzing, and promoting ad-hoc workflows into formalized, reusable skills.

## Philosophy
- **Capture**: Don't lose good ideas or effective scripts.
- **Abstract**: Turn specific solutions into general tools.
- **Internalize**: Make skills part of the default toolset.

## Evolution Pipeline
1.  **Candidate Identified**: A script/workflow is used > 2 times.
2.  **Abstraction**: Define inputs/outputs/invariants.
3.  **Promotion**: Package as a formal skill (folder + SKILL.md + dependencies).
4.  **Integration**: Add to `openclaw.json` or `MEMORY.md` as preferred method.

## Current Candidates (Auto-Captured)
- [x] **Feishu Rich Text Cards**: Promoted to `skills/feishu-card`.
- [x] **Feishu Stickers**: Promoted to `skills/feishu-sticker`.
- [x] **Sticker Analysis**: Promoted to `skills/sticker-analyzer`.
- [x] **Memory Management**: Promoted to `skills/memory-manager`.
- [ ] **Log Archiver**: The `logger.js` pattern used for `zhy` and `fmw` could be a generic `interaction-logger` skill.

## Next Steps
- Monitor usage of `logger.js`. If used again for a 3rd persona, promote to `skills/interaction-logger`.
