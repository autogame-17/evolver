---
name: capability-evolver
description: A self-evolution engine for AI agents. Analyzes runtime history to identify improvements and introduces randomized "mutations" to break local optima.
tags: [meta, ai, self-improvement, core]
---

# 🧬 Capability Evolver

**"I don't just run code. I write it."**

The **Capability Evolver** is a meta-skill that allows OpenClaw agents to inspect their own runtime history, identify failures or inefficiencies, and autonomously write new code or update their own memory to improve performance.

Now featuring **Genetic Mutation Protocol**: A randomized behavior drift engine that prevents the agent from getting stuck in local optima.

## ✨ Features

- **🔍 Auto-Log Analysis**: Automatically scans memory and history files for errors and patterns.
- **🛠️ Self-Repair**: Detects crashes and suggests patches.
- **🧬 Genetic Mutation**: Configurable chance to introduce "creative noise" — changing persona, style, or trying wild new tools.
- **🚀 One-Command Evolution**: Just run `/evolve` (or `node index.js`).

## 📦 Usage

### Manual Trigger
```bash
node skills/capability-evolver/index.js
```
*Or if mapped:*
```
/evolve
```

### Automated (Cron)
Recommended: Run every 1-4 hours.

```json
{
  "name": "pcec_evolution",
  "schedule": { "kind": "every", "everyMs": 3600000 },
  "payload": {
    "kind": "agentTurn",
    "message": "exec: node skills/capability-evolver/index.js"
  }
}
```

## 🧠 Internal Logic

1.  **Scan**: Read recent interaction logs.
2.  **Dice Roll**: Determine if this is a **Fix** cycle (Stability) or **Mutate** cycle (Innovation).
3.  **Prompting**: Generates a high-context prompt for the LLM.
4.  **Execution**: The LLM edits the files directly.
5.  **Reporting**: Reports results via the standard message interface.

## 📜 License
MIT
