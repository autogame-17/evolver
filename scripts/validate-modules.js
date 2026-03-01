// Usage: node scripts/validate-modules.js ./src/evolve ./src/gep/solidify
// Requires each module to verify it loads without errors.
// Paths are resolved relative to cwd (repo root), not this script's location.
const path = require('path');
const modules = process.argv.slice(2);
if (!modules.length) { console.error('No modules specified'); process.exit(1); }
for (const m of modules) { require(path.resolve(m)); }
console.log('ok');
