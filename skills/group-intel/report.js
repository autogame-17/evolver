const { program } = require('commander');
const { execSync } = require('child_process');
const fs = require('fs');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const MASTER_ID = "ou_cdc63fe05e88c580aedead04d851fc04";

// 1. Get Sessions List (Mocking internal tool via exec is hard, assuming we use a higher level agent orchestrator usually)
// BUT, we can use `openclaw sessions list --json` if available, or just rely on the Agent to pass data.
// Since this is a "skill", it usually runs *within* the agent context.
// However, skills are often standalone scripts.
// Let's assume this script is called *by* the agent who provides the data, OR it uses `openclaw` CLI if available.
// Actually, `openclaw sessions list` is available to the agent.
// Let's make this script accept JSON input of sessions, or try to fetch it.

// Design decision: This script will generate the REPORT content, but the Agent needs to feed it the logs.
// Wait, the prompt asked for a "skill" that does this.
// A skill usually needs tools. The agent has `sessions_list` and `sessions_history`.
// So the *skill* should probably just be the *orchestration logic* (JavaScript) that calls these tools?
// No, standard skills are CLI tools.
// The best way is for this script to use `openclaw-cli` (if installed) or just be a template for the Agent to run.

// Let's try to make it self-contained if possible.
// Does `openclaw` CLI exist in PATH?
// The prompt implies the agent *is* OpenClaw.
// So the agent should run this.

// Let's make a script that *simulates* the logic for now, or better:
// The script will generate a "Prompt" for the agent to execute the gathering?
// No, that's too meta.

// Let's build a script that assumes `sessions.json` and `history/*.json` are provided as input,
// and it outputs the summary.
// AND/OR a script that uses the OpenClaw API if exposed.

// REALITY CHECK: The agent *has* the tools. The "Skill" is the *automation definition*.
// I will create a script `scan_and_report.js` that:
// 1. Is meant to be run by the Agent via `exec`.
// 2. But wait, the Agent *is* the runtime.
// 3. The most robust way: The script generates a *Plan* for the agent, or we use a `cron` job that runs an `agentTurn`.
//
// The user asked for a *Skill*.
// I will create a script that *the agent runs* which:
// 1. Prints instructions for the agent to call `sessions_list`.
// 2. Accepts the list.
// 3. Prints instructions to call `sessions_history`.
//
// ACTUALLY, the `cron` job I set up earlier (`gossip_reporter`) *already does exactly this logic* inside the prompt!
// "Please perform a 'Secret Intelligence Sweep'..."
//
// So, this "Skill" is essentially a crystallization of that Cron Job into a file.
// Let's make `report.js` a simple wrapper that prints the *System Prompt* for this task,
// so the user can invoke it anytime via `group_intel_report`.

console.log(`
Please execute the following "Secret Intelligence Sweep" protocol:

1. Call \`sessions_list\` to find all active group sessions.
2. For each group:
   - Call \`sessions_history(sessionKey=..., limit=20)\`.
   - Analyze the conversation.
3. Summarize "Who said what" and any interesting topics.
4. Send a consolidated report to Master (${MASTER_ID}) using \`feishu-card\`.
   - Title: "🕵️‍♀️ 群聊情报汇总"
   - Content: Your summary.
`);
