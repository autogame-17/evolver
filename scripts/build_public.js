const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function normalizePosix(p) {
  return p.split(path.sep).join('/');
}

function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function listFilesRec(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFilesRec(p));
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

function globToRegex(glob) {
  // Supports "*" within a single segment and "**" for any depth.
  const norm = normalizePosix(glob);
  const parts = norm.split('/').filter(p => p.length > 0);
  const out = [];

  for (const part of parts) {
    if (part === '**') {
      // any number of path segments
      out.push('(?:.*)');
      continue;
    }
    // Escape regex special chars, then expand "*" wildcards within segment.
    const esc = part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    out.push(esc);
  }

  const re = out.join('\\/');
  return new RegExp(`^${re}$`);
}

function matchesAnyGlobs(relPath, globs) {
  const p = normalizePosix(relPath);
  for (const g of globs || []) {
    const re = globToRegex(g);
    if (re.test(p)) return true;
  }
  return false;
}

function copyFile(srcAbs, destAbs) {
  ensureDir(path.dirname(destAbs));
  fs.copyFileSync(srcAbs, destAbs);
}

function copyEntry(spec, outDirAbs) {
  const copied = [];

  // Directory glob
  if (spec.includes('*')) {
    const all = listFilesRec(REPO_ROOT);
    const includeRe = globToRegex(spec);
    for (const abs of all) {
      const rel = normalizePosix(path.relative(REPO_ROOT, abs));
      if (!includeRe.test(rel)) continue;
      const destAbs = path.join(outDirAbs, rel);
      copyFile(abs, destAbs);
      copied.push(rel);
    }
    return copied;
  }

  const srcAbs = path.join(REPO_ROOT, spec);
  if (!fs.existsSync(srcAbs)) return [];

  const st = fs.statSync(srcAbs);
  if (st.isFile()) {
    const rel = normalizePosix(spec);
    copyFile(srcAbs, path.join(outDirAbs, rel));
    copied.push(rel);
    return copied;
  }
  if (st.isDirectory()) {
    const files = listFilesRec(srcAbs);
    for (const abs of files) {
      const rel = normalizePosix(path.relative(REPO_ROOT, abs));
      copyFile(abs, path.join(outDirAbs, rel));
      copied.push(rel);
    }
  }
  return copied;
}

function applyRewrite(outDirAbs, rewrite) {
  const rules = rewrite || {};
  for (const [relFile, cfg] of Object.entries(rules)) {
    const target = path.join(outDirAbs, relFile);
    if (!fs.existsSync(target)) continue;
    let content = fs.readFileSync(target, 'utf8');
    const reps = (cfg && cfg.replace) || [];
    for (const r of reps) {
      const from = String(r.from || '');
      const to = String(r.to || '');
      if (!from) continue;
      content = content.split(from).join(to);
    }
    fs.writeFileSync(target, content, 'utf8');
  }
}

function rewritePackageJson(outDirAbs) {
  const p = path.join(outDirAbs, 'package.json');
  if (!fs.existsSync(p)) return;
  try {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    pkg.scripts = {
      start: 'node index.js',
      run: 'node index.js run',
    };
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  } catch (e) {
    // ignore
  }
}

function parseSemver(v) {
  const m = String(v || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function formatSemver(x) {
  return `${x.major}.${x.minor}.${x.patch}`;
}

function bumpSemver(base, bump) {
  const v = parseSemver(base);
  if (!v) return null;
  if (bump === 'major') return `${v.major + 1}.0.0`;
  if (bump === 'minor') return `${v.major}.${v.minor + 1}.0`;
  if (bump === 'patch') return `${v.major}.${v.minor}.${v.patch + 1}`;
  return formatSemver(v);
}

function git(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function getBaseReleaseCommit() {
  // Prefer last "prepare vX.Y.Z" commit; fallback to HEAD~50 range later.
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

function suggestVersion() {
  const pkgPath = path.join(REPO_ROOT, 'package.json');
  let baseVersion = null;
  try {
    baseVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
  } catch (e) {}

  const baseCommit = getBaseReleaseCommit();
  const subjects = getCommitSubjectsSince(baseCommit);
  const decision = inferBumpFromSubjects(subjects);

  let suggested = null;
  if (decision.bump === 'none') suggested = baseVersion;
  else suggested = bumpSemver(baseVersion, decision.bump);

  return { baseVersion, baseCommit, subjects, decision, suggestedVersion: suggested };
}

function writePrivateSemverNote(note) {
  const privateDir = path.join(REPO_ROOT, 'memory');
  ensureDir(privateDir);
  fs.writeFileSync(path.join(privateDir, 'semver_suggestion.json'), JSON.stringify(note, null, 2) + '\n', 'utf8');
}

function writePrivateSemverPrompt(note) {
  const privateDir = path.join(REPO_ROOT, 'memory');
  ensureDir(privateDir);
  const subjects = Array.isArray(note.subjects) ? note.subjects : [];
  const semverRule = [
    'MAJOR.MINOR.PATCH',
    '- MAJOR: incompatible changes',
    '- MINOR: backward-compatible features',
    '- PATCH: backward-compatible bug fixes',
  ].join('\n');

  const prompt = [
    'You are a release versioning assistant.',
    'Decide the next version bump using SemVer rules below.',
    '',
    semverRule,
    '',
    `Base version: ${note.baseVersion || '(unknown)'}`,
    `Base commit: ${note.baseCommit || '(unknown)'}`,
    '',
    'Recent commit subjects (newest first):',
    ...subjects.map(s => `- ${s}`),
    '',
    'Output JSON only:',
    '{ "bump": "major|minor|patch|none", "suggestedVersion": "x.y.z", "reason": ["..."] }',
  ].join('\n');

  fs.writeFileSync(path.join(privateDir, 'semver_prompt.md'), prompt + '\n', 'utf8');
}

function writeDistVersion(outDirAbs, version) {
  if (!version) return;
  const p = path.join(outDirAbs, 'package.json');
  if (!fs.existsSync(p)) return;
  try {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    pkg.version = version;
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  } catch (e) {}
}

function pruneExcluded(outDirAbs, excludeGlobs) {
  const all = listFilesRec(outDirAbs);
  for (const abs of all) {
    const rel = normalizePosix(path.relative(outDirAbs, abs));
    if (matchesAnyGlobs(rel, excludeGlobs)) {
      fs.rmSync(abs, { force: true });
    }
  }
}

function validateNoPrivatePaths(outDirAbs) {
  // Basic safeguard: forbid docs/ and memory/ in output.
  const forbiddenPrefixes = ['docs/', 'memory/'];
  const all = listFilesRec(outDirAbs);
  for (const abs of all) {
    const rel = normalizePosix(path.relative(outDirAbs, abs));
    for (const pref of forbiddenPrefixes) {
      if (rel.startsWith(pref)) {
        throw new Error(`Build validation failed: forbidden path in output: ${rel}`);
      }
    }
  }
}

function main() {
  const manifestPath = path.join(REPO_ROOT, 'public.manifest.json');
  const manifest = readJson(manifestPath);
  const outDir = String(manifest.outDir || 'dist-public');
  const outDirAbs = path.join(REPO_ROOT, outDir);

  // SemVer suggestion (private). This does not modify the source repo version.
  const semver = suggestVersion();
  writePrivateSemverNote(semver);
  writePrivateSemverPrompt(semver);

  rmDir(outDirAbs);
  ensureDir(outDirAbs);

  const include = manifest.include || [];
  const exclude = manifest.exclude || [];

  const copied = [];
  for (const spec of include) {
    copied.push(...copyEntry(spec, outDirAbs));
  }

  pruneExcluded(outDirAbs, exclude);
  applyRewrite(outDirAbs, manifest.rewrite);
  rewritePackageJson(outDirAbs);

  // Prefer explicit version; otherwise use suggested version.
  const releaseVersion = process.env.RELEASE_VERSION || semver.suggestedVersion;
  if (releaseVersion) writeDistVersion(outDirAbs, releaseVersion);

  validateNoPrivatePaths(outDirAbs);

  // Write build manifest for private verification (do not include in dist-public/).
  const buildInfo = {
    built_at: new Date().toISOString(),
    outDir,
    files: copied.sort(),
  };
  const privateDir = path.join(REPO_ROOT, 'memory');
  ensureDir(privateDir);
  fs.writeFileSync(path.join(privateDir, 'public_build_info.json'), JSON.stringify(buildInfo, null, 2) + '\n', 'utf8');

  process.stdout.write(`Built public output at ${outDir}\n`);
  if (semver && semver.suggestedVersion) {
    process.stdout.write(`Suggested version: ${semver.suggestedVersion}\n`);
    process.stdout.write(`SemVer decision: ${semver.decision ? semver.decision.bump : 'unknown'}\n`);
  }
}

try {
  main();
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
}

