const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadGenes, upsertGene, appendEventJsonl, appendCapsule, upsertCapsule, getLastEventId } = require('./assetStore');
const { computeSignalKey, memoryGraphPath } = require('./memoryGraph');
const { computeCapsuleSuccessStreak, isBlastRadiusSafe } = require('./a2a');
const { getRepoRoot, getMemoryDir } = require('./paths');
const { extractSignals } = require('./signals');
const { selectGene } = require('./selector');
const { isValidMutation, normalizeMutation, isHighRiskMutationAllowed, isHighRiskPersonality } = require('./mutation');
const {
  isValidPersonalityState,
  normalizePersonalityState,
  personalityKey,
  updatePersonalityStats,
} = require('./personality');

function nowIso() {
  return new Date().toISOString();
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function stableHash(input) {
  const s = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function runCmd(cmd, opts = {}) {
  const cwd = opts.cwd || getRepoRoot();
  const timeoutMs = Number.isFinite(Number(opts.timeoutMs)) ? Number(opts.timeoutMs) : 120000;
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs });
}

function tryRunCmd(cmd, opts = {}) {
  try {
    return { ok: true, out: runCmd(cmd, opts), err: '' };
  } catch (e) {
    const stderr = e && e.stderr ? String(e.stderr) : '';
    const stdout = e && e.stdout ? String(e.stdout) : '';
    const msg = e && e.message ? String(e.message) : 'command_failed';
    return { ok: false, out: stdout, err: stderr || msg };
  }
}

function gitListChangedFiles({ repoRoot }) {
  // Includes staged + unstaged changes; includes untracked.
  const files = new Set();

  const s1 = tryRunCmd('git diff --name-only', { cwd: repoRoot, timeoutMs: 60000 });
  if (s1.ok) for (const line of String(s1.out).split('\n').map(l => l.trim()).filter(Boolean)) files.add(line);

  const s2 = tryRunCmd('git diff --cached --name-only', { cwd: repoRoot, timeoutMs: 60000 });
  if (s2.ok) for (const line of String(s2.out).split('\n').map(l => l.trim()).filter(Boolean)) files.add(line);

  const s3 = tryRunCmd('git ls-files --others --exclude-standard', { cwd: repoRoot, timeoutMs: 60000 });
  if (s3.ok) for (const line of String(s3.out).split('\n').map(l => l.trim()).filter(Boolean)) files.add(line);

  return Array.from(files);
}

function parseNumstat(text) {
  // Each line: added<TAB>deleted<TAB>path
  const lines = String(text || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  let added = 0;
  let deleted = 0;
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const a = Number(parts[0]);
    const d = Number(parts[1]);
    if (Number.isFinite(a)) added += a;
    if (Number.isFinite(d)) deleted += d;
  }
  return { added, deleted };
}

function countFileLines(absPath) {
  try {
    if (!fs.existsSync(absPath)) return 0;
    const buf = fs.readFileSync(absPath);
    if (!buf || buf.length === 0) return 0;
    // Count '\n' + last line.
    let n = 1;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 10) n++;
    return n;
  } catch {
    return 0;
  }
}

function computeBlastRadius({ repoRoot, baselineUntracked }) {
  let changedFiles = gitListChangedFiles({ repoRoot });

  // Exclude files that were already untracked in the baseline.
  // This prevents counting existing untracked files as "changed".
  if (Array.isArray(baselineUntracked) && baselineUntracked.length > 0) {
    const baselineSet = new Set(baselineUntracked);
    changedFiles = changedFiles.filter(f => !baselineSet.has(f));
  }
  const filesCount = changedFiles.length;

  const u = tryRunCmd('git diff --numstat', { cwd: repoRoot, timeoutMs: 60000 });
  const c = tryRunCmd('git diff --cached --numstat', { cwd: repoRoot, timeoutMs: 60000 });
  const unstaged = u.ok ? parseNumstat(u.out) : { added: 0, deleted: 0 };
  const staged = c.ok ? parseNumstat(c.out) : { added: 0, deleted: 0 };

  // Untracked files are not included in numstat; approximate by counting file lines.
  const untracked = tryRunCmd('git ls-files --others --exclude-standard', { cwd: repoRoot, timeoutMs: 60000 });
  let untrackedLines = 0;
  if (untracked.ok) {
    const rels = String(untracked.out).split('\n').map(l => l.trim()).filter(Boolean);
    const baselineSet = new Set(Array.isArray(baselineUntracked) ? baselineUntracked : []);
    for (const rel of rels) {
      if (baselineSet.has(rel)) continue;
      const abs = path.join(repoRoot, rel);
      untrackedLines += countFileLines(abs);
    }
  }

  // Protocol "lines" is a scalar; use total churn + untracked additions approximation.
  const churn = unstaged.added + unstaged.deleted + staged.added + staged.deleted + untrackedLines;

  return {
    files: filesCount,
    lines: churn,
    changed_files: changedFiles,
  };
}

function isForbiddenPath(relPath, forbiddenPaths) {
  const rel = String(relPath || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  const list = Array.isArray(forbiddenPaths) ? forbiddenPaths : [];
  for (const fp of list) {
    const f = String(fp || '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
    if (!f) continue;
    if (rel === f) return true;
    if (rel.startsWith(f + '/')) return true;
  }
  return false;
}

function checkConstraints({ gene, blast }) {
  const violations = [];
  if (!gene || gene.type !== 'Gene') return { ok: true, violations };

  const constraints = gene.constraints || {};
  const maxFiles = Number(constraints.max_files);
  if (Number.isFinite(maxFiles) && maxFiles > 0) {
    if (Number(blast.files) > maxFiles) violations.push(`max_files exceeded: ${blast.files} > ${maxFiles}`);
  }

  const forbidden = Array.isArray(constraints.forbidden_paths) ? constraints.forbidden_paths : [];
  for (const f of blast.changed_files || []) {
    if (isForbiddenPath(f, forbidden)) violations.push(`forbidden_path touched: ${f}`);
  }

  return { ok: violations.length === 0, violations };
}

function readStateForSolidify() {
  const memoryDir = getMemoryDir();
  const statePath = path.join(memoryDir, 'evolution_solidify_state.json');
  return readJsonIfExists(statePath, { last_run: null });
}

function writeStateForSolidify(state) {
  const memoryDir = getMemoryDir();
  const statePath = path.join(memoryDir, 'evolution_solidify_state.json');
  try {
    if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
  } catch {}
  const tmp = `${statePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, statePath);
}

function buildEventId(tsIso) {
  // evt_<timestamp>
  const t = Date.parse(tsIso);
  return `evt_${Number.isFinite(t) ? t : Date.now()}`;
}

function buildCapsuleId(tsIso) {
  const t = Date.parse(tsIso);
  return `capsule_${Number.isFinite(t) ? t : Date.now()}`;
}

// --- Validation command safety ---
// Allowed command prefixes for Gene validation commands.
// Only node/npm/npx are permitted; arbitrary binaries are rejected.
const VALIDATION_ALLOWED_PREFIXES = ['node ', 'npm ', 'npx '];

// Check whether a validation command is safe to execute.
// Rules:
//   1. Must start with an allowed prefix (node/npm/npx).
//   2. Must not contain command substitution (backtick or $() ) anywhere,
//      because these are evaluated even inside double quotes.
//   3. After stripping quoted strings, must not contain shell operators
//      (; & | > <) which could chain or redirect commands.
function isValidationCommandAllowed(cmd) {
  const c = String(cmd || '').trim();
  if (!c) return false;
  if (!VALIDATION_ALLOWED_PREFIXES.some(p => c.startsWith(p))) return false;
  // Reject command substitution anywhere (dangerous even inside double quotes)
  if (/`|\$\(/.test(c)) return false;
  // Strip quoted content, then check for shell operators in remaining text
  const stripped = c.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
  if (/[;&|><]/.test(stripped)) return false;
  return true;
}

function runValidations(gene, opts = {}) {
  const repoRoot = opts.repoRoot || getRepoRoot();
  const timeoutMs = Number.isFinite(Number(opts.timeoutMs)) ? Number(opts.timeoutMs) : 180000;
  const validation = Array.isArray(gene && gene.validation) ? gene.validation : [];
  const results = [];
  for (const cmd of validation) {
    const c = String(cmd || '').trim();
    if (!c) continue;
    if (!isValidationCommandAllowed(c)) {
      results.push({ cmd: c, ok: false, out: '', err: 'BLOCKED: validation command rejected by safety check (allowed prefixes: node/npm/npx; shell operators prohibited)' });
      return { ok: false, results };
    }
    const r = tryRunCmd(c, { cwd: repoRoot, timeoutMs });
    results.push({ cmd: c, ok: r.ok, out: String(r.out || ''), err: String(r.err || '') });
    if (!r.ok) return { ok: false, results };
  }
  return { ok: true, results };
}

function rollbackTracked(repoRoot) {
  // Best-effort rollback for tracked files. We do NOT delete untracked files by default.
  // This keeps the operation reversible/safe while still satisfying "rollback" for tracked edits.
  tryRunCmd('git restore --staged --worktree .', { cwd: repoRoot, timeoutMs: 60000 });
  tryRunCmd('git reset --hard', { cwd: repoRoot, timeoutMs: 60000 });
}

function gitListUntrackedFiles(repoRoot) {
  const r = tryRunCmd('git ls-files --others --exclude-standard', { cwd: repoRoot, timeoutMs: 60000 });
  if (!r.ok) return [];
  return String(r.out)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

function rollbackNewUntrackedFiles({ repoRoot, baselineUntracked }) {
  const baseline = new Set((Array.isArray(baselineUntracked) ? baselineUntracked : []).map(String));
  const current = gitListUntrackedFiles(repoRoot);
  const toDelete = current.filter(f => !baseline.has(String(f)));
  for (const rel of toDelete) {
    const safeRel = String(rel || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
    if (!safeRel) continue;
    const abs = path.join(repoRoot, safeRel);
    // Safety: refuse to delete outside repoRoot.
    const normRepo = path.resolve(repoRoot);
    const normAbs = path.resolve(abs);
    if (!normAbs.startsWith(normRepo + path.sep) && normAbs !== normRepo) continue;
    try {
      if (fs.existsSync(normAbs) && fs.statSync(normAbs).isFile()) fs.unlinkSync(normAbs);
    } catch (e) {}
  }
  return { deleted: toDelete };
}

function inferCategoryFromSignals(signals) {
  const list = Array.isArray(signals) ? signals.map(String) : [];
  if (list.includes('log_error')) return 'repair';
  if (list.includes('protocol_drift')) return 'optimize';
  return 'optimize';
}

function buildAutoGene({ signals, intent }) {
  const sigs = Array.isArray(signals) ? Array.from(new Set(signals.map(String))).filter(Boolean) : [];
  const signalKey = computeSignalKey(sigs);
  const id = `gene_auto_${stableHash(signalKey)}`;
  const category = intent && ['repair', 'optimize', 'innovate'].includes(String(intent))
    ? String(intent)
    : inferCategoryFromSignals(sigs);

  const signalsMatch = sigs.length ? sigs.slice(0, 8) : ['(none)'];
  return {
    type: 'Gene',
    id,
    category,
    signals_match: signalsMatch,
    preconditions: [`signals_key == ${signalKey}`],
    strategy: [
      'Extract structured signals from logs and user instructions',
      'Select an existing Gene by signals match (no improvisation)',
      'Estimate blast radius (files, lines) before editing and record it',
      'Apply smallest reversible patch',
      'Validate using declared validation steps; rollback on failure',
      'Solidify knowledge: append EvolutionEvent, update Gene/Capsule store',
    ],
    constraints: {
      max_files: 12,
      forbidden_paths: ['.git', 'node_modules'],
    },
    validation: [
      'node -e "require(\'./src/gep/solidify\'); console.log(\'ok\')"',
    ],
  };
}

function ensureGene({ genes, selectedGene, signals, intent, dryRun }) {
  if (selectedGene && selectedGene.type === 'Gene') return { gene: selectedGene, created: false, reason: 'selected_gene_id_present' };

  // Re-select from existing genes (strict: only reuse existing unless none matches).
  const res = selectGene(Array.isArray(genes) ? genes : [], Array.isArray(signals) ? signals : [], {
    bannedGeneIds: new Set(),
    preferredGeneId: null,
    driftEnabled: false,
  });
  if (res && res.selected) return { gene: res.selected, created: false, reason: 'reselected_from_existing' };

  // No match exists -> create new gene (protocol-compliant).
  const auto = buildAutoGene({ signals, intent });
  if (!dryRun) upsertGene(auto);
  return { gene: auto, created: true, reason: 'no_match_create_new' };
}

function readRecentSessionInputs() {
  // Minimal: reuse evolve.js sources but without coupling to its internal functions.
  // We only need enough corpus for signal extraction.
  const repoRoot = getRepoRoot();
  const memoryDir = getMemoryDir();

  const rootMemory = path.join(repoRoot, 'MEMORY.md');
  const dirMemory = path.join(memoryDir, 'MEMORY.md');
  const memoryFile = fs.existsSync(rootMemory) ? rootMemory : dirMemory;
  const userFile = path.join(repoRoot, 'USER.md');

  const todayLog = path.join(memoryDir, new Date().toISOString().split('T')[0] + '.md');
  const todayLogContent = fs.existsSync(todayLog) ? fs.readFileSync(todayLog, 'utf8') : '';
  const memorySnippet = fs.existsSync(memoryFile) ? fs.readFileSync(memoryFile, 'utf8').slice(0, 50000) : '';
  const userSnippet = fs.existsSync(userFile) ? fs.readFileSync(userFile, 'utf8') : '';

  // Session transcript is environment-specific; fallback to empty.
  const recentSessionTranscript = '';

  return { recentSessionTranscript, todayLog: todayLogContent, memorySnippet, userSnippet };
}

function solidify({ intent, summary, dryRun = false, rollbackOnFailure = true } = {}) {
  const repoRoot = getRepoRoot();

  const state = readStateForSolidify();
  const lastRun = state && state.last_run ? state.last_run : null;

  const genes = loadGenes();
  const geneId = lastRun && lastRun.selected_gene_id ? String(lastRun.selected_gene_id) : null;
  const selectedGene = geneId ? genes.find(g => g && g.type === 'Gene' && g.id === geneId) : null;

  const parentEventId =
    lastRun && typeof lastRun.parent_event_id === 'string'
      ? lastRun.parent_event_id
      : getLastEventId(); // fallback

  const signals =
    lastRun && Array.isArray(lastRun.signals) && lastRun.signals.length
      ? Array.from(new Set(lastRun.signals.map(String)))
      : extractSignals(readRecentSessionInputs());
  const signalKey = computeSignalKey(signals);

  // Mandatory: Mutation + PersonalityState must exist for every evolution.
  const mutationRaw = lastRun && lastRun.mutation && typeof lastRun.mutation === 'object' ? lastRun.mutation : null;
  const personalityRaw =
    lastRun && lastRun.personality_state && typeof lastRun.personality_state === 'object' ? lastRun.personality_state : null;
  const mutation = mutationRaw && isValidMutation(mutationRaw) ? normalizeMutation(mutationRaw) : null;
  const personalityState =
    personalityRaw && isValidPersonalityState(personalityRaw) ? normalizePersonalityState(personalityRaw) : null;
  const personalityKeyUsed = personalityState ? personalityKey(personalityState) : null;
  const protocolViolations = [];
  if (!mutation) protocolViolations.push('missing_or_invalid_mutation');
  if (!personalityState) protocolViolations.push('missing_or_invalid_personality_state');
  if (mutation && mutation.risk_level === 'high' && !isHighRiskMutationAllowed(personalityState || null)) {
    protocolViolations.push('high_risk_mutation_not_allowed_by_personality');
  }
  if (mutation && mutation.risk_level === 'high' && !(lastRun && lastRun.personality_known)) {
    protocolViolations.push('high_risk_mutation_forbidden_under_unknown_personality');
  }
  if (mutation && mutation.category === 'innovate' && personalityState && isHighRiskPersonality(personalityState)) {
    protocolViolations.push('forbidden_innovate_with_high_risk_personality');
  }

  const ensured = ensureGene({ genes, selectedGene, signals, intent, dryRun: !!dryRun });
  const geneUsed = ensured.gene;

  const blast = computeBlastRadius({
    repoRoot,
    baselineUntracked: lastRun && Array.isArray(lastRun.baseline_untracked) ? lastRun.baseline_untracked : [],
  });
  const constraintCheck = checkConstraints({ gene: geneUsed, blast });

  let validation = { ok: true, results: [] };
  if (geneUsed) {
    validation = runValidations(geneUsed, { repoRoot, timeoutMs: 180000 });
  }

  const success = constraintCheck.ok && validation.ok && protocolViolations.length === 0;
  const ts = nowIso();

  const outcomeStatus = success ? 'success' : 'failed';
  const score = clamp01(success ? 0.85 : 0.2);

  const selectedCapsuleId =
    lastRun && typeof lastRun.selected_capsule_id === 'string' && lastRun.selected_capsule_id.trim()
      ? String(lastRun.selected_capsule_id).trim()
      : null;
  const capsuleId = success ? selectedCapsuleId || buildCapsuleId(ts) : null;
  const derivedIntent = intent || (mutation && mutation.category) || (geneUsed && geneUsed.category) || 'repair';
  const intentMismatch =
    intent && mutation && typeof mutation.category === 'string' && String(intent) !== String(mutation.category);
  if (intentMismatch) protocolViolations.push(`intent_mismatch_with_mutation:${String(intent)}!=${String(mutation.category)}`);
  const event = {
    type: 'EvolutionEvent',
    id: buildEventId(ts),
    parent: parentEventId || null,
    intent: derivedIntent,
    signals,
    genes_used: geneUsed && geneUsed.id ? [geneUsed.id] : [],
    mutation_id: mutation && mutation.id ? mutation.id : null,
    personality_state: personalityState || null,
    blast_radius: { files: blast.files, lines: blast.lines },
    outcome: { status: outcomeStatus, score },
    capsule_id: capsuleId,
    meta: {
      at: ts,
      signal_key: signalKey,
      selector: lastRun && lastRun.selector ? lastRun.selector : null,
      blast_radius_estimate: lastRun && lastRun.blast_radius_estimate ? lastRun.blast_radius_estimate : null,
      mutation: mutation || null,
      personality: {
        key: personalityKeyUsed,
        known: !!(lastRun && lastRun.personality_known),
        mutations:
          lastRun && Array.isArray(lastRun.personality_mutations) ? lastRun.personality_mutations : [],
      },
      gene: {
        id: geneUsed && geneUsed.id ? geneUsed.id : null,
        created: !!ensured.created,
        reason: ensured.reason,
      },
      constraints_ok: constraintCheck.ok,
      constraint_violations: constraintCheck.violations,
      validation_ok: validation.ok,
      validation: validation.results.map(r => ({ cmd: r.cmd, ok: r.ok })),
      protocol_ok: protocolViolations.length === 0,
      protocol_violations: protocolViolations,
      memory_graph: memoryGraphPath(),
    },
  };

  let capsule = null;
  if (success) {
    const s = String(summary || '').trim();
    const autoSummary = geneUsed
      ? `固化：${geneUsed.id} 命中信号 ${signals.join(', ') || '(none)'}，变更 ${blast.files} 文件 / ${blast.lines} 行。`
      : `固化：命中信号 ${signals.join(', ') || '(none)'}，变更 ${blast.files} 文件 / ${blast.lines} 行。`;

    // If we are reusing an existing capsule (selected by the selector), preserve its trigger/summary by default.
    // This makes "same Capsule consecutive successes" measurable via repeated EvolutionEvent.capsule_id.
    let prevCapsule = null;
    try {
      if (selectedCapsuleId) {
        const list = require('./assetStore').loadCapsules();
        prevCapsule = Array.isArray(list) ? list.find(c => c && c.type === 'Capsule' && String(c.id) === selectedCapsuleId) : null;
      }
    } catch (e) {}

    capsule = {
      type: 'Capsule',
      id: capsuleId,
      trigger: prevCapsule && Array.isArray(prevCapsule.trigger) && prevCapsule.trigger.length ? prevCapsule.trigger : signals,
      gene: geneUsed && geneUsed.id ? geneUsed.id : prevCapsule && prevCapsule.gene ? prevCapsule.gene : null,
      summary: s || (prevCapsule && prevCapsule.summary ? String(prevCapsule.summary) : autoSummary),
      confidence: clamp01(score),
      blast_radius: { files: blast.files, lines: blast.lines },
      outcome: { status: 'success', score },
      success_streak: 1,
      a2a: { eligible_to_broadcast: false },
    };
  }

  if (!success && rollbackOnFailure) {
    rollbackTracked(repoRoot);
    rollbackNewUntrackedFiles({ repoRoot, baselineUntracked: lastRun && lastRun.baseline_untracked ? lastRun.baseline_untracked : [] });
  }

  if (!dryRun) {
    // Write order for safety: ensure capsule exists before referencing it from the event.
    // Use upsert so a reused capsule keeps a stable id across runs.
    if (capsule) upsertCapsule(capsule);
    appendEventJsonl(event);
    if (capsule) {
      // Success streak and eligibility depend on recorded events; compute after appending event.
      const streak = computeCapsuleSuccessStreak({ capsuleId: capsule.id });
      capsule.success_streak = streak || 1;
      capsule.a2a = {
        eligible_to_broadcast:
          isBlastRadiusSafe(capsule.blast_radius) &&
          (capsule.outcome.score || 0) >= 0.7 &&
          (capsule.success_streak || 0) >= 2,
      };
      upsertCapsule(capsule);
    }

    // Update personality natural-selection stats (ground truth from EvolutionEvent).
    try {
      if (personalityState) {
        updatePersonalityStats({
          personalityState,
          outcome: outcomeStatus,
          score,
          notes: `event:${event.id}`,
        });
      }
    } catch (e) {}
  }

  // Update state to prevent accidental double-solidify.
  const runId = lastRun && lastRun.run_id ? String(lastRun.run_id) : stableHash(`${parentEventId || 'root'}|${geneId || 'none'}|${signalKey}`);
  state.last_solidify = {
    run_id: runId,
    at: ts,
    event_id: event.id,
    capsule_id: capsuleId,
    outcome: event.outcome,
  };
  if (!dryRun) writeStateForSolidify(state);

  return { ok: success, event, capsule, gene: geneUsed, constraintCheck, validation, blast };
}

module.exports = {
  solidify,
  readStateForSolidify,
  writeStateForSolidify,
  isValidationCommandAllowed,
};

