const { loadGenes, upsertGene, appendCapsule } = require('../src/gep/assetStore');
const { readRecentExternalCandidates } = require('../src/gep/assetStore');
const { isValidationCommandAllowed } = require('../src/gep/solidify');

function parseArgs(argv) {
  const out = { flags: new Set(), kv: new Map(), positionals: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) {
        out.kv.set(a.slice(2, eq), a.slice(eq + 1));
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next && !String(next).startsWith('--')) {
          out.kv.set(key, next);
          i++;
        } else {
          out.flags.add(key);
        }
      }
    } else {
      out.positionals.push(a);
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const id = String(args.kv.get('id') || '').trim();
  const typeRaw = String(args.kv.get('type') || '').trim().toLowerCase();
  const validated = args.flags.has('validated') || String(args.kv.get('validated') || '') === 'true';
  const limit = Number.isFinite(Number(args.kv.get('limit'))) ? Number(args.kv.get('limit')) : 500;

  if (!id || !typeRaw) {
    throw new Error('Usage: node scripts/a2a_promote.js --type capsule|gene --id <id> --validated');
  }
  if (!validated) {
    throw new Error('Refusing to promote without --validated (local verification must be done first).');
  }

  const type = typeRaw === 'capsule' ? 'Capsule' : typeRaw === 'gene' ? 'Gene' : '';
  if (!type) throw new Error('Invalid --type. Use capsule or gene.');

  const external = readRecentExternalCandidates(limit);
  const candidate = (Array.isArray(external) ? external : []).find(x => x && x.type === type && String(x.id) === id);
  if (!candidate) {
    throw new Error(`Candidate not found in external zone: type=${type} id=${id}`);
  }

  // Audit Gene validation commands before promotion.
  // Reject any Gene whose validation array contains unsafe commands.
  if (type === 'Gene') {
    const validation = Array.isArray(candidate.validation) ? candidate.validation : [];
    for (const cmd of validation) {
      const c = String(cmd || '').trim();
      if (!c) continue;
      if (!isValidationCommandAllowed(c)) {
        throw new Error(
          `Refusing to promote Gene ${id}: validation command rejected by safety check: "${c}". ` +
          'Only node/npm/npx commands without shell operators are allowed.'
        );
      }
    }
  }

  const promoted = JSON.parse(JSON.stringify(candidate));
  if (!promoted.a2a || typeof promoted.a2a !== 'object') promoted.a2a = {};
  promoted.a2a.status = 'promoted';
  promoted.a2a.promoted_at = new Date().toISOString();

  if (type === 'Capsule') {
    appendCapsule(promoted);
    process.stdout.write(`promoted_capsule=${id}\n`);
    return;
  }

  // Gene conflict handling: never overwrite local.
  const localGenes = loadGenes();
  const exists = Array.isArray(localGenes) && localGenes.some(g => g && g.type === 'Gene' && String(g.id) === id);
  if (exists) {
    process.stdout.write(`conflict_keep_local_gene=${id}\n`);
    return;
  }

  upsertGene(promoted);
  process.stdout.write(`promoted_gene=${id}\n`);
}

try {
  main();
} catch (e) {
  process.stderr.write(`${e && e.message ? e.message : String(e)}\n`);
  process.exit(1);
}

