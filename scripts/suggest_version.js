const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function parseSemver(v) {
  const m = String(v || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function bumpSemver(base, bump) {
  const v = parseSemver(base);
  if (!v) return null;
  if (bump === 'major') return `${v.major + 1}.0.0`;
  if (bump === 'minor') return `${v.major}.${v.minor + 1}.0`;
  if (bump === 'patch') return `${v.major}.${v.minor}.${v.patch + 1}`;
  return `${v.major}.${v.minor}.${v.patch}`;
}

function git(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function getBaseReleaseCommit() {
  try {
    const hash = git('git log -n 1 --pretty=%H --grep="chore(release): prepare v"');
    return hash || null;
  } catch (e) {
    return null;
  }
}

function getCommitSubjectsSince(baseCommit) {
  try {
    if (!baseCommit) {
      const out = git('git log -n 30 --pretty=%s');
      return out ? out.split('\n').filter(Boolean) : [];
    }
    const out = git(`git log ${baseCommit}..HEAD --pretty=%s`);
    return out ? out.split('\n').filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

function inferBumpFromSubjects(subjects) {
  const subs = (subjects || []).map(s => String(s));
  const hasBreaking = subs.some(s => /\bBREAKING CHANGE\b/i.test(s) || /^[a-z]+(\(.+\))?!:/.test(s));
  if (hasBreaking) return { bump: 'major', reason: 'breaking change marker in commit subject' };

  const hasFeat = subs.some(s => /^feat(\(.+\))?:/i.test(s));
  if (hasFeat) return { bump: 'minor', reason: 'feature commit detected (feat:)' };

  const hasFix = subs.some(s => /^(fix|perf)(\(.+\))?:/i.test(s));
  if (hasFix) return { bump: 'patch', reason: 'fix/perf commit detected' };

  if (subs.length === 0) return { bump: 'none', reason: 'no commits since base release commit' };
  return { bump: 'patch', reason: 'default to patch for non-breaking changes' };
}

function main() {
  const pkgPath = path.join(REPO_ROOT, 'package.json');
  const baseVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;

  const baseCommit = getBaseReleaseCommit();
  const subjects = getCommitSubjectsSince(baseCommit);
  const decision = inferBumpFromSubjects(subjects);
  const suggestedVersion = decision.bump === 'none' ? baseVersion : bumpSemver(baseVersion, decision.bump);

  const out = { baseVersion, baseCommit, subjects, decision, suggestedVersion };
  const memDir = path.join(REPO_ROOT, 'memory');
  ensureDir(memDir);
  fs.writeFileSync(path.join(memDir, 'semver_suggestion.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

try {
  main();
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
}

