const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMutation,
  isValidMutation,
  normalizeMutation,
  isHighRiskMutationAllowed,
  isHighRiskPersonality,
  clamp01,
} = require('../src/gep/mutation');

describe('clamp01', () => {
  it('clamps values to [0, 1]', () => {
    assert.equal(clamp01(0.5), 0.5);
    assert.equal(clamp01(0), 0);
    assert.equal(clamp01(1), 1);
    assert.equal(clamp01(-0.5), 0);
    assert.equal(clamp01(1.5), 1);
  });

  it('returns 0 for non-finite input', () => {
    assert.equal(clamp01(NaN), 0);
    assert.equal(clamp01(undefined), 0);
    // Note: clamp01(Infinity) returns 0 because the implementation checks
    // Number.isFinite() before clamping. Mathematically clamp(Inf, 0, 1) = 1,
    // but the current behavior treats all non-finite values uniformly as 0.
    assert.equal(clamp01(Infinity), 0);
  });
});

describe('buildMutation', () => {
  it('returns a valid Mutation object', () => {
    const m = buildMutation({ signals: ['log_error'], selectedGene: { id: 'gene_repair' } });
    assert.ok(isValidMutation(m));
    assert.equal(m.type, 'Mutation');
    assert.ok(m.id.startsWith('mut_'));
  });

  it('selects repair category when error signals present', () => {
    const m = buildMutation({ signals: ['log_error', 'errsig:something'] });
    assert.equal(m.category, 'repair');
  });

  it('selects innovate category when drift enabled', () => {
    const m = buildMutation({ signals: ['stable_success_plateau'], driftEnabled: true });
    assert.equal(m.category, 'innovate');
  });

  it('selects innovate for opportunity signals without errors', () => {
    const m = buildMutation({ signals: ['user_feature_request'] });
    assert.equal(m.category, 'innovate');
  });

  it('downgrades innovate to optimize for high-risk personality', () => {
    const highRiskPersonality = { rigor: 0.3, risk_tolerance: 0.8, creativity: 0.5 };
    const m = buildMutation({
      signals: ['user_feature_request'],
      personalityState: highRiskPersonality,
    });
    assert.equal(m.category, 'optimize');
    assert.ok(m.trigger_signals.some(s => s.includes('safety')));
  });

  it('caps risk_level to medium when personality disallows high risk', () => {
    const conservativePersonality = { rigor: 0.5, risk_tolerance: 0.6, creativity: 0.5 };
    const m = buildMutation({
      signals: ['stable_success_plateau'],
      driftEnabled: true,
      allowHighRisk: true,
      personalityState: conservativePersonality,
    });
    assert.notEqual(m.risk_level, 'high');
  });
});

describe('isValidMutation', () => {
  it('returns true for valid mutation', () => {
    const m = buildMutation({ signals: ['log_error'] });
    assert.ok(isValidMutation(m));
  });

  it('returns false for missing fields', () => {
    assert.ok(!isValidMutation(null));
    assert.ok(!isValidMutation({}));
    assert.ok(!isValidMutation({ type: 'Mutation' }));
  });

  it('returns false for invalid category', () => {
    assert.ok(!isValidMutation({
      type: 'Mutation', id: 'x', category: 'destroy',
      trigger_signals: [], target: 't', expected_effect: 'e', risk_level: 'low',
    }));
  });
});

describe('normalizeMutation', () => {
  it('fills defaults for empty object', () => {
    const m = normalizeMutation({});
    assert.ok(isValidMutation(m));
    assert.equal(m.category, 'optimize');
    assert.equal(m.risk_level, 'low');
  });

  it('preserves valid fields', () => {
    const m = normalizeMutation({
      id: 'mut_custom', category: 'repair',
      trigger_signals: ['log_error'], target: 'file.js',
      expected_effect: 'fix bug', risk_level: 'medium',
    });
    assert.equal(m.id, 'mut_custom');
    assert.equal(m.category, 'repair');
    assert.equal(m.risk_level, 'medium');
  });
});

describe('isHighRiskPersonality', () => {
  it('detects low rigor as high risk', () => {
    assert.ok(isHighRiskPersonality({ rigor: 0.3 }));
  });

  it('detects high risk_tolerance as high risk', () => {
    assert.ok(isHighRiskPersonality({ risk_tolerance: 0.7 }));
  });

  it('returns false for conservative personality', () => {
    assert.ok(!isHighRiskPersonality({ rigor: 0.8, risk_tolerance: 0.2 }));
  });
});

describe('isHighRiskMutationAllowed', () => {
  it('allows when rigor >= 0.6 and risk_tolerance <= 0.5', () => {
    assert.ok(isHighRiskMutationAllowed({ rigor: 0.8, risk_tolerance: 0.3 }));
  });

  it('disallows when rigor too low', () => {
    assert.ok(!isHighRiskMutationAllowed({ rigor: 0.4, risk_tolerance: 0.3 }));
  });

  it('disallows when risk_tolerance too high', () => {
    assert.ok(!isHighRiskMutationAllowed({ rigor: 0.8, risk_tolerance: 0.6 }));
  });
});
