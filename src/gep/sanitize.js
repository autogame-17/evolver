// Pre-publish payload sanitization.
// Removes sensitive tokens, local paths, emails, and env references
// from capsule payloads before broadcasting to the hub.

// Patterns to redact (replaced with placeholder)
const REDACT_PATTERNS = [
  // API keys & tokens (generic)
  /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /token[=:]\s*["']?[A-Za-z0-9\-._~+\/]{16,}["']?/gi,
  /api[_-]?key[=:]\s*["']?[A-Za-z0-9\-._~+\/]{16,}["']?/gi,
  /secret[=:]\s*["']?[A-Za-z0-9\-._~+\/]{16,}["']?/gi,
  /password[=:]\s*["']?[^\s"',;)}\]]{6,}["']?/gi,
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, github_pat_)
  /ghp_[A-Za-z0-9]{36,}/g,
  /gho_[A-Za-z0-9]{36,}/g,
  /ghu_[A-Za-z0-9]{36,}/g,
  /ghs_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  // AWS access keys
  /AKIA[0-9A-Z]{16}/g,
  // OpenAI / Anthropic tokens
  /sk-proj-[A-Za-z0-9\-_]{20,}/g,
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  // npm tokens
  /npm_[A-Za-z0-9]{36,}/g,
  // Private keys
  /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g,
  // Basic auth in URLs (redact only credentials, keep :// and @)
  /(?<=:\/\/)[^@\s]+:[^@\s]+(?=@)/g,
  // Local filesystem paths
  /\/home\/[^\s"',;)}\]]+/g,
  /\/Users\/[^\s"',;)}\]]+/g,
  /[A-Z]:\\[^\s"',;)}\]]+/g,
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // .env file references
  /\.env(?:\.[a-zA-Z]+)?/g,
];

const REDACTED = '[REDACTED]';

function redactString(str) {
  if (typeof str !== 'string') return str;
  let result = str;
  for (const pattern of REDACT_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

/**
 * Deep-clone and sanitize a capsule payload.
 * Returns a new object with sensitive values redacted.
 * Does NOT modify the original.
 */
function sanitizePayload(capsule) {
  if (!capsule || typeof capsule !== 'object') return capsule;
  return JSON.parse(JSON.stringify(capsule), (_key, value) => {
    if (typeof value === 'string') return redactString(value);
    return value;
  });
}

module.exports = { sanitizePayload, redactString };
