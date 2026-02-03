const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function run(cmd, opts = {}) {
  const { dryRun = false } = opts;
  if (dryRun) {
    process.stdout.write(`[dry-run] ${cmd}\n`);
    return '';
  }
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function hasCommand(cmd) {
  try {
    const res = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
    return res.status === 0;
  } catch (e) {
    return false;
  }
}

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
}

function ensureClean(dryRun) {
  const status = run('git status --porcelain', { dryRun });
  if (!dryRun && status) {
    throw new Error('Working tree is not clean. Commit or stash before publishing.');
  }
}

function ensureBranch(expected, dryRun) {
  const current = run('git rev-parse --abbrev-ref HEAD', { dryRun }) || expected;
  if (!dryRun && current !== expected) {
    throw new Error(`Current branch is ${current}. Expected ${expected}.`);
  }
}

function ensureRemote(remote, dryRun) {
  try {
    run(`git remote get-url ${remote}`, { dryRun });
  } catch (e) {
    throw new Error(`Remote "${remote}" not found. Add it manually before running this script.`);
  }
}

function ensureTagAvailable(tag, dryRun) {
  if (!tag) return;
  const exists = run(`git tag --list ${tag}`, { dryRun });
  if (!dryRun && exists) {
    throw new Error(`Tag ${tag} already exists.`);
  }
}

function ensureDir(dir, dryRun) {
  if (dryRun) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function rmDir(dir, dryRun) {
  if (dryRun) return;
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest, dryRun) {
  if (dryRun) return;
  if (!fs.existsSync(src)) throw new Error(`Missing build output dir: ${src}`);
  ensureDir(dest, dryRun);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const ent of entries) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d, dryRun);
    else if (ent.isFile()) {
      ensureDir(path.dirname(d), dryRun);
      fs.copyFileSync(s, d);
    }
  }
}

function createReleaseWithGh({ repo, tag, title, notes, notesFile, dryRun }) {
  if (!repo || !tag) return;
  if (!hasCommand('gh')) {
    throw new Error('gh CLI not found. Install GitHub CLI or disable release creation.');
  }
  const args = ['release', 'create', tag, '--repo', repo];
  if (title) args.push('-t', title);
  if (notesFile) args.push('-F', notesFile);
  else if (notes) args.push('-n', notes);
  else args.push('-n', 'Release created by publish script.');
  const cmd = `gh ${args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`;
  run(cmd, { dryRun });
}

function main() {
  const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

  const sourceBranch = process.env.SOURCE_BRANCH || 'main';
  const publicRemote = process.env.PUBLIC_REMOTE || 'public';
  const publicBranch = process.env.PUBLIC_BRANCH || 'main';
  const publicRepo = process.env.PUBLIC_REPO || '';
  const outDir = process.env.PUBLIC_OUT_DIR || 'dist-public';
  const useBuildOutput = String(process.env.PUBLIC_USE_BUILD_OUTPUT || 'true').toLowerCase() === 'true';

  // If publishing build output, require a repo URL or GH repo slug for cloning.
  if (useBuildOutput) {
    requireEnv('PUBLIC_REPO', publicRepo);
  }

  let releaseTag = process.env.RELEASE_TAG || '';
  let releaseTitle = process.env.RELEASE_TITLE || '';
  const releaseNotes = process.env.RELEASE_NOTES || '';
  const releaseNotesFile = process.env.RELEASE_NOTES_FILE || '';
  const releaseCreate = String(process.env.RELEASE_CREATE || '').toLowerCase() === 'true';

  // If not provided, infer from build output package.json version.
  if (!releaseTag && useBuildOutput) {
    try {
      const builtPkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), outDir, 'package.json'), 'utf8'));
      if (builtPkg && builtPkg.version) releaseTag = `v${builtPkg.version}`;
      if (!releaseTitle && releaseTag) releaseTitle = releaseTag;
    } catch (e) {}
  }

  ensureClean(dryRun);
  ensureBranch(sourceBranch, dryRun);
  ensureTagAvailable(releaseTag, dryRun);

  if (!useBuildOutput) {
    ensureRemote(publicRemote, dryRun);
    run(`git push ${publicRemote} ${sourceBranch}:${publicBranch}`, { dryRun });
  } else {
    const tmpBase = path.join(os.tmpdir(), 'evolver-public-publish');
    const tmpRepoDir = path.join(tmpBase, `repo_${Date.now()}`);
    const buildAbs = path.resolve(process.cwd(), outDir);

    rmDir(tmpRepoDir, dryRun);
    ensureDir(tmpRepoDir, dryRun);

    run(`git clone --depth 1 https://github.com/${publicRepo}.git "${tmpRepoDir}"`, { dryRun });
    run(`git -C "${tmpRepoDir}" checkout -B ${publicBranch}`, { dryRun });

    // Replace repo contents with build output (except .git)
    if (!dryRun) {
      const entries = fs.readdirSync(tmpRepoDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name === '.git') continue;
        fs.rmSync(path.join(tmpRepoDir, ent.name), { recursive: true, force: true });
      }
    }
    copyDir(buildAbs, tmpRepoDir, dryRun);

    run(`git -C "${tmpRepoDir}" add -A`, { dryRun });
    const msg = releaseTag ? `Release ${releaseTag}` : `Publish build output`;
    run(`git -C "${tmpRepoDir}" commit -m "${msg.replace(/"/g, '\\"')}"`, { dryRun });
    run(`git -C "${tmpRepoDir}" push origin ${publicBranch}`, { dryRun });

    if (releaseTag) {
      const tagMsg = releaseTitle || `Release ${releaseTag}`;
      run(`git -C "${tmpRepoDir}" tag -a ${releaseTag} -m "${tagMsg.replace(/"/g, '\\"')}"`, { dryRun });
      run(`git -C "${tmpRepoDir}" push origin ${releaseTag}`, { dryRun });
    }
  }

  if (releaseTag) {
    if (!useBuildOutput) {
      const msg = releaseTitle || `Release ${releaseTag}`;
      run(`git tag -a ${releaseTag} -m "${msg.replace(/"/g, '\\"')}"`, { dryRun });
      run(`git push ${publicRemote} ${releaseTag}`, { dryRun });
    }
  }

  if (releaseCreate) {
    createReleaseWithGh({
      repo: publicRepo,
      tag: releaseTag,
      title: releaseTitle,
      notes: releaseNotes,
      notesFile: releaseNotesFile,
      dryRun,
    });
  }
}

try {
  main();
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
}

