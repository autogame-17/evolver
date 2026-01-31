const fs = require('fs');
const path = require('path');

async function run() {
  const skillPath = path.join(__dirname, 'SKILL.md');
  let skillContent = '';
  
  try {
    skillContent = fs.readFileSync(skillPath, 'utf8');
  } catch (e) {
    console.error('Could not read SKILL.md');
  }

  const prompt = `
*** CAPABILITY EVOLVER PROTOCOL ***

You are running the Capability Evolution sequence.
Your goal is to analyze recent workflows and promote them into formal skills.

CONTEXT:
${skillContent}

INSTRUCTIONS:
1. REVIEW: Scan your recent memory (memory/YYYY-MM-DD.md) and command history.
2. IDENTIFY: Look for repetitive tasks, scripts, or patterns you have created ad-hoc.
3. ANALYZE:
   - Is it used > 2 times?
   - Can it be generalized (remove hardcoded paths/names)?
   - Does it provide significant value?
4. EXECUTE:
   - If a candidate is found, create a new folder in 'skills/'.
   - Create a valid 'package.json' and 'SKILL.md'.
   - Move the logic into the new skill.
   - Update 'skills/capability-evolver/SKILL.md' to mark it as promoted.
   
5. REPORT: Output a summary of your evolution analysis.

Constraints:
- Ensure all new skills use English code and configuration.
- Do not hardcode user names (use configuration or variables).
- Maintain modularity.

*** END PROTOCOL ***
`;

  console.log(prompt);
}

module.exports = { run };
