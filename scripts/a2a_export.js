const { loadGenes, loadCapsules, readAllEvents } = require('../src/gep/assetStore');
const { exportEligibleCapsules } = require('../src/gep/a2a');
const { buildPublish, buildHello, getTransport } = require('../src/gep/a2aProtocol');

function main() {
  var args = process.argv.slice(2);
  var asJson = args.includes('--json');
  var asProtocol = args.includes('--protocol');
  var withHello = args.includes('--hello');
  var persist = args.includes('--persist');

  var capsules = loadCapsules();
  var events = readAllEvents();
  var eligible = exportEligibleCapsules({ capsules: capsules, events: events });

  if (withHello || asProtocol) {
    var genes = loadGenes();
    var hello = buildHello({ geneCount: genes.length, capsuleCount: capsules.length });
    process.stdout.write(JSON.stringify(hello) + '\n');
    if (persist) { try { getTransport().send(hello); } catch (e) {} }
  }

  if (asProtocol) {
    for (var i = 0; i < eligible.length; i++) {
      var msg = buildPublish({ asset: eligible[i] });
      process.stdout.write(JSON.stringify(msg) + '\n');
      if (persist) { try { getTransport().send(msg); } catch (e) {} }
    }
    return;
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(eligible, null, 2) + '\n');
    return;
  }

  for (var j = 0; j < eligible.length; j++) {
    process.stdout.write(JSON.stringify(eligible[j]) + '\n');
  }
}

try { main(); } catch (e) {
  process.stderr.write((e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
}
