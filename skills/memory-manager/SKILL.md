# Memory Manager

A robust, atomic updater for `MEMORY.md` (and other text files) to prevent edit conflicts and normalization issues.

## Tools

### memory_update
Safely update a text file by reading, normalizing, modifying in-memory, and overwriting.

- **file** (optional): Target file. Defaults to `MEMORY.md`.
- **operation** (required): `replace` or `append`.
- **old** (for replace): Text to find and replace.
- **new** (for replace): New text.
- **content** (for append): Text to append to the end.
- **content_file** (optional): Read content/replacement from a file (avoids shell escaping).

## Examples

```bash
# Append to memory
memory_update --operation append --content "- New memory item"

# Replace text
memory_update --operation replace --old "foo" --new "bar"
```
