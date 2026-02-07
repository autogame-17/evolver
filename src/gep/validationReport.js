// Standardized ValidationReport type for GEP.
// Machine-readable, self-contained, and interoperable.
// Can be consumed by external Hubs or Judges for automated assessment.

const { computeAssetId, SCHEMA_VERSION } = require('./contentHash');
const { captureEnvFingerprint, envFingerprintKey } = require('./envFingerprint');

// Build a standardized ValidationReport from raw validation results.
function buildValidationReport({ geneId, commands, results, envFp, startedAt, finishedAt }) {
  const env = envFp || captureEnvFingerprint();
  const resultsList = Array.isArray(results) ? results : [];
  const cmdsList = Array.isArray(commands) ? commands : resultsList.map(function (r) { return r && r.cmd ? String(r.cmd) : ''; });
  const overallOk = resultsList.length > 0 && resultsList.every(function (r) { return r && r.ok; });
  const durationMs =
    Number.isFinite(startedAt) && Number.isFinite(finishedAt) ? finishedAt - startedAt : null;

  const report = {
    type: 'ValidationReport',
    schema_version: SCHEMA_VERSION,
    id: 'vr_' + Date.now(),
    gene_id: geneId || null,
    env_fingerprint: env,
    env_fingerprint_key: envFingerprintKey(env),
    commands: cmdsList.map(function (cmd, i) {
      const r = resultsList[i] || {};
      return {
        command: String(cmd || ''),
        ok: !!r.ok,
        stdout: String(r.out || '').slice(0, 4000),
        stderr: String(r.err || '').slice(0, 4000),
      };
    }),
    overall_ok: overallOk,
    duration_ms: durationMs,
    created_at: new Date().toISOString(),
  };

  report.asset_id = computeAssetId(report);
  return report;
}

// Validate that an object is a well-formed ValidationReport.
function isValidValidationReport(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.type !== 'ValidationReport') return false;
  if (!obj.id || typeof obj.id !== 'string') return false;
  if (!Array.isArray(obj.commands)) return false;
  if (typeof obj.overall_ok !== 'boolean') return false;
  return true;
}

module.exports = {
  buildValidationReport,
  isValidValidationReport,
};
