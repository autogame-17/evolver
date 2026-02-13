const fs = require('fs');
const path = require('path');
const { getGepAssetsDir } = require('./paths');
const { computeAssetId, SCHEMA_VERSION } = require('./contentHash');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

function writeJsonAtomic(filePath, obj) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

// Build a robust validation command that works regardless of CWD.
// Resolves module paths relative to the skill root (skills/evolver/).
function buildValidationCmd(relModules) {
  const skillRoot = path.resolve(__dirname, '..', '..');
  const checks = relModules.map(m => {
    const abs = path.join(skillRoot, m).replace(/\\/g, '/');
    return `require('${abs}')`;
  });
  return `node -e "${checks.join('; ')}; console.log('ok')"`;
}

function getDefaultGenes() {
  return {
    version: 1,
    genes: [
      {
        type: 'Gene', id: 'gene_gep_repair_from_errors', category: 'repair',
        signals_match: ['error', 'exception', 'failed', 'unstable'],
        preconditions: ['signals contains error-related indicators'],
        strategy: [
          'Extract structured signals from logs and user instructions',
          'Select an existing Gene by signals match (no improvisation)',
          'Estimate blast radius (files, lines) before editing',
          'Apply smallest reversible patch',
          'Validate using declared validation steps; rollback on failure',
          'Solidify knowledge: append EvolutionEvent, update Gene/Capsule store',
        ],
        constraints: { max_files: 12, forbidden_paths: ['.git', 'node_modules'] },
        validation: [
          buildValidationCmd(['src/evolve', 'src/gep/solidify']),
          buildValidationCmd(['src/gep/selector', 'src/gep/memoryGraph']),
        ],
      },
      {
        type: 'Gene', id: 'gene_gep_optimize_prompt_and_assets', category: 'optimize',
        signals_match: ['protocol', 'gep', 'prompt', 'audit', 'reusable'],
        preconditions: ['need stricter, auditable evolution protocol outputs'],
        strategy: [
          'Extract signals and determine selection rationale via Selector JSON',
          'Prefer reusing existing Gene/Capsule; only create if no match exists',
          'Refactor prompt assembly to embed assets (genes, capsules, parent event)',
          'Reduce noise and ambiguity; enforce strict output schema',
          'Validate by running node index.js run and ensuring no runtime errors',
          'Solidify: record EvolutionEvent, update Gene definitions, create Capsule on success',
        ],
        constraints: { max_files: 20, forbidden_paths: ['.git', 'node_modules'] },
        validation: [buildValidationCmd(['src/evolve', 'src/gep/prompt'])],
      },
    ],
  };
}

function getDefaultCapsules() { return { version: 1, capsules: [] }; }
function genesPath() { return path.join(getGepAssetsDir(), 'genes.json'); }
function capsulesPath() { return path.join(getGepAssetsDir(), 'capsules.json'); }
function capsulesJsonlPath() { return path.join(getGepAssetsDir(), 'capsules.jsonl'); }
function eventsPath() { return path.join(getGepAssetsDir(), 'events.jsonl'); }
function candidatesPath() { return path.join(getGepAssetsDir(), 'candidates.jsonl'); }
function externalCandidatesPath() { return path.join(getGepAssetsDir(), 'external_candidates.jsonl'); }

function loadGenes() {
  const jsonGenes = readJsonIfExists(genesPath(), getDefaultGenes()).genes || [];
  const jsonlGenes = [];
  try {
    const p = path.join(getGepAssetsDir(), 'genes.jsonl');
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      raw.split('\n').forEach(line => {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed && parsed.type === 'Gene') jsonlGenes.push(parsed);
          } catch(e) {}
        }
      });
    }
  } catch(e) {}

  // Combine and deduplicate by ID (JSONL takes precedence if newer, but here we just merge)
  const combined = [...jsonGenes, ...jsonlGenes];
  const unique = new Map();
  combined.forEach(g => {
    if (g && g.id) unique.set(String(g.id), g);
  });
  return Array.from(unique.values());
}

function loadCapsules() {
  const legacy = readJsonIfExists(capsulesPath(), getDefaultCapsules()).capsules || [];
  const jsonlCapsules = [];
  try {
    const p = capsulesJsonlPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      raw.split('\n').forEach(line => {
        if (line.trim()) {
            try { jsonlCapsules.push(JSON.parse(line)); } catch(e) {}
        }
      });
    }
  } catch(e) {}
  
  // Combine and deduplicate by ID
  const combined = [...legacy, ...jsonlCapsules];
  const unique = new Map();
  combined.forEach(c => {
      if (c && c.id) unique.set(String(c.id), c);
  });
  return Array.from(unique.values());
}

function getLastEventId() {
  try {
    const p = eventsPath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    const last = JSON.parse(lines[lines.length - 1]);
    return last && typeof last.id === 'string' ? last.id : null;
  } catch { return null; }
}

function readAllEvents() {
  try {
    const p = eventsPath();
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    return raw.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function appendEventJsonl(eventObj) {
  const dir = getGepAssetsDir(); ensureDir(dir);
  fs.appendFileSync(eventsPath(), JSON.stringify(eventObj) + '\n', 'utf8');
}

function appendCandidateJsonl(candidateObj) {
  const dir = getGepAssetsDir(); ensureDir(dir);
  fs.appendFileSync(candidatesPath(), JSON.stringify(candidateObj) + '\n', 'utf8');
}

function appendExternalCandidateJsonl(obj) {
  const dir = getGepAssetsDir(); ensureDir(dir);
  fs.appendFileSync(externalCandidatesPath(), JSON.stringify(obj) + '\n', 'utf8');
}

function readRecentCandidates(limit = 20) {
  try {
    const p = candidatesPath();
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.slice(Math.max(0, lines.length - limit)).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function readRecentExternalCandidates(limit = 50) {
  try {
    const p = externalCandidatesPath();
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.slice(Math.max(0, lines.length - limit)).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

// Safety net: ensure schema_version and asset_id are present before writing.
function ensureSchemaFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (!obj.schema_version) obj.schema_version = SCHEMA_VERSION;
  if (!obj.asset_id) { try { obj.asset_id = computeAssetId(obj); } catch (e) {} }
  return obj;
}

function upsertGene(geneObj) {
  ensureSchemaFields(geneObj);
  const current = readJsonIfExists(genesPath(), getDefaultGenes());
  const genes = Array.isArray(current.genes) ? current.genes : [];
  const idx = genes.findIndex(g => g && g.id === geneObj.id);
  if (idx >= 0) genes[idx] = geneObj; else genes.push(geneObj);
  writeJsonAtomic(genesPath(), { version: current.version || 1, genes });
}

function appendCapsule(capsuleObj) {
  ensureSchemaFields(capsuleObj);
  const current = readJsonIfExists(capsulesPath(), getDefaultCapsules());
  const capsules = Array.isArray(current.capsules) ? current.capsules : [];
  capsules.push(capsuleObj);
  writeJsonAtomic(capsulesPath(), { version: current.version || 1, capsules });
}

function upsertCapsule(capsuleObj) {
  if (!capsuleObj || capsuleObj.type !== 'Capsule' || !capsuleObj.id) return;
  ensureSchemaFields(capsuleObj);
  const current = readJsonIfExists(capsulesPath(), getDefaultCapsules());
  const capsules = Array.isArray(current.capsules) ? current.capsules : [];
  const idx = capsules.findIndex(c => c && c.type === 'Capsule' && String(c.id) === String(capsuleObj.id));
  if (idx >= 0) capsules[idx] = capsuleObj; else capsules.push(capsuleObj);
  writeJsonAtomic(capsulesPath(), { version: current.version || 1, capsules });
}

// Ensure all expected asset files exist on startup.
// Creates empty files for optional append-only stores so that
// external grep/read commands never fail with "No such file or directory".
function ensureAssetFiles() {
  const dir = getGepAssetsDir();
  ensureDir(dir);
  const files = [
    { path: genesPath(), defaultContent: JSON.stringify(getDefaultGenes(), null, 2) + '\n' },
    { path: capsulesPath(), defaultContent: JSON.stringify(getDefaultCapsules(), null, 2) + '\n' },
    { path: path.join(dir, 'genes.jsonl'), defaultContent: '' },
    { path: eventsPath(), defaultContent: '' },
    { path: candidatesPath(), defaultContent: '' },
  ];
  for (const f of files) {
    if (!fs.existsSync(f.path)) {
      try {
        fs.writeFileSync(f.path, f.defaultContent, 'utf8');
      } catch (e) {
        // Non-fatal: log but continue
        console.error(`[AssetStore] Failed to create ${f.path}: ${e.message}`);
      }
    }
  }
}

module.exports = {
  loadGenes, loadCapsules, readAllEvents, getLastEventId,
  appendEventJsonl, appendCandidateJsonl, appendExternalCandidateJsonl,
  readRecentCandidates, readRecentExternalCandidates,
  upsertGene, appendCapsule, upsertCapsule,
  genesPath, capsulesPath, eventsPath, candidatesPath, externalCandidatesPath,
  ensureAssetFiles, buildValidationCmd,
};
