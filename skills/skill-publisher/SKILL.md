# Skill Publisher

A specialized tool to publish OpenClaw skills to independent remote Git repositories using `git subtree` logic.
Also supports creating GitHub Releases via `gh` CLI.

## Usage

```bash
node skills/skill-publisher/index.js publish skills/my-skill \
  --remote https://github.com/my-org/my-skill.git \
  --branch main \
  --release \
  --tag v1.0.0 \
  --notes "Initial release"
```
