const assert = require('assert');
const { sanitizePayload, redactString } = require('../src/gep/sanitize');

const REDACTED = '[REDACTED]';

// --- redactString ---

// Existing patterns (regression)
assert.strictEqual(redactString('Bearer abc123def456ghi789jkl0'), REDACTED);
assert.strictEqual(redactString('sk-abcdefghijklmnopqrstuvwxyz'), REDACTED);
assert.strictEqual(redactString('token=abcdefghijklmnop1234'), REDACTED);
assert.strictEqual(redactString('api_key=abcdefghijklmnop1234'), REDACTED);
assert.strictEqual(redactString('secret: abcdefghijklmnop1234'), REDACTED);
assert.strictEqual(redactString('/home/user/secret/file.txt'), REDACTED);
assert.strictEqual(redactString('/Users/admin/docs'), REDACTED);
assert.strictEqual(redactString('user@example.com'), REDACTED);

// GitHub tokens (bare, without token= prefix)
assert.ok(redactString('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234').includes(REDACTED),
  'bare ghp_ token should be redacted');
assert.ok(redactString('gho_abcdefghijklmnopqrstuvwxyz1234567890').includes(REDACTED),
  'bare gho_ token should be redacted');
assert.ok(redactString('github_pat_abcdefghijklmnopqrstuvwxyz123456').includes(REDACTED),
  'github_pat_ token should be redacted');
assert.ok(redactString('use ghs_abcdefghijklmnopqrstuvwxyz1234567890 for auth').includes(REDACTED),
  'ghs_ in sentence should be redacted');

// AWS keys
assert.ok(redactString('AKIAIOSFODNN7EXAMPLE').includes(REDACTED),
  'AWS access key should be redacted');

// OpenAI project tokens
assert.ok(redactString('sk-proj-bxOCXoWsaPj0IDE1yqlXCXIkWO1f').includes(REDACTED),
  'sk-proj- token should be redacted');

// Anthropic tokens
assert.ok(redactString('sk-ant-api03-abcdefghijklmnopqrst').includes(REDACTED),
  'sk-ant- token should be redacted');

// npm tokens
assert.ok(redactString('npm_abcdefghijklmnopqrstuvwxyz1234567890').includes(REDACTED),
  'npm token should be redacted');

// Private keys
assert.ok(redactString('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----').includes(REDACTED),
  'RSA private key should be redacted');
assert.ok(redactString('-----BEGIN PRIVATE KEY-----\ndata\n-----END PRIVATE KEY-----').includes(REDACTED),
  'generic private key should be redacted');

// Password fields
assert.ok(redactString('password=mysecretpassword123').includes(REDACTED),
  'password= should be redacted');
assert.ok(redactString('PASSWORD: "hunter2xyz"').includes(REDACTED),
  'PASSWORD: should be redacted');

// Basic auth in URLs (should preserve scheme and @)
var urlResult = redactString('https://user:pass123@github.com/repo');
assert.ok(urlResult.includes(REDACTED), 'basic auth in URL should be redacted');
assert.ok(urlResult.startsWith('https://'), 'URL scheme should be preserved');
assert.ok(urlResult.includes('@github.com'), '@ and host should be preserved');

// Safe strings should NOT be redacted
assert.strictEqual(redactString('hello world'), 'hello world');
assert.strictEqual(redactString('error: something failed'), 'error: something failed');
assert.strictEqual(redactString('fix the bug in parser'), 'fix the bug in parser');

// --- sanitizePayload ---

// Deep sanitization
var payload = {
  summary: 'Fixed auth using ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx5678',
  nested: {
    path: '/home/user/.ssh/id_rsa',
    email: 'admin@internal.corp',
    safe: 'this is fine',
  },
};
var sanitized = sanitizePayload(payload);
assert.ok(sanitized.summary.includes(REDACTED), 'ghp token in summary');
assert.ok(sanitized.nested.path.includes(REDACTED), 'path in nested');
assert.ok(sanitized.nested.email.includes(REDACTED), 'email in nested');
assert.strictEqual(sanitized.nested.safe, 'this is fine');

// Null/undefined/number inputs
assert.strictEqual(sanitizePayload(null), null);
assert.strictEqual(sanitizePayload(undefined), undefined);
assert.strictEqual(redactString(null), null);
assert.strictEqual(redactString(123), 123);

console.log('All sanitize tests passed (34 assertions)');
