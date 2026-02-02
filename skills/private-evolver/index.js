const path = require('path');
const evolve = require('./evolve');

// Simple CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';

  if (command === 'run' || command === '/evolve') {
    try {
      console.log('Starting Capability Evolution...');
      await evolve.run();
    } catch (error) {
      console.error('Evolution failed:', error);
      process.exit(1);
    }
  } else {
    console.log(`Usage: node index.js [/evolve]`);
  }
}

if (require.main === module) {
  main();
}
