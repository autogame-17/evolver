# Group Intel Skill

Periodically scans all group chats where the bot is present, summarizes the conversation, and reports to the Master.

## Tools

### group_intel_report
Manually trigger a scan and report.

## Automation
- Designed to run via **PCEC** or dedicated **Cron**.
- Scans last 50 messages from each group.
- Filters out bot's own messages.
- Summarizes using LLM.
- Sends a consolidated `feishu-card` report to Master.

## Inputs
- `master_id`: `ou_cdc63fe05e88c580aedead04d851fc04`
- `target_groups`: Auto-discovered via `sessions_list`.

## Implementation
- `report.js`: The core logic.
