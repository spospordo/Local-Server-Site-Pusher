// Redaction helpers for the read-only dashboard AI assistant.
// Everything that is sent to the model, written to assistant log storage or audited
// must pass through these helpers first.

const REDACTED = '[REDACTED]';
const NOT_SET = '[not set]';

// Object keys whose values are treated as credentials.
const SENSITIVE_KEY_PATTERN = /(pass(word|wd|phrase)?|secret|token|api[-_]?key|apikey|private[-_]?key|encryption[-_]?key|access[-_]?key|secret[-_]?key|credential|authorization|auth[-_]?header|cookie|session|bearer|signature|^key$|[-_]key$|^pwd$|^auth$|^salt$|encrypteddata|^pin$)/i;
// Keys that look sensitive but only carry non-secret status information.
const SAFE_KEY_PATTERN = /^(has[A-Z_].*|.*configured|.*enabled|.*present|.*required|authmethod|auth_method|passwordrequired|requirepassword|sessionTimeout)$/i;

const SENSITIVE_QUERY_PARAM = /^(.*(token|key|secret|pass|pwd|auth|signature|sig|credential|session).*|code|jwt|sas)$/i;

const PEM_BLOCK = /-----BEGIN [A-Z0-9 ]*(PRIVATE KEY|ENCRYPTED|CERTIFICATE)[A-Z0-9 ]*-----[\s\S]*?(-----END [A-Z0-9 ]*-----|$)/g;
const URL_PATTERN = /\b(?:https?|webcal|webcals|ftp|sftp|ssh|ws|wss):\/\/[^\s"'<>\\)\]}]+/gi;
const TOKEN_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
];
const BEARER_PATTERN = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const HEADER_PATTERN = /\b(authorization|x-api-key|api-key|cookie|set-cookie|proxy-authorization)\s*[:=]\s*[^\r\n]+/gi;
const KEY_VALUE_PATTERN = /(["']?)\b([A-Za-z0-9_.-]*(?:pass(?:word|wd|phrase)?|secret|token|api[-_]?key|apikey|private[-_]?key|encryption[-_]?key|access[-_]?key|credential|pwd|session[-_]?id|sid)[A-Za-z0-9_.-]*)\1(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&}\]]+)/gi;

function isSensitiveKey(key) {
  const k = String(key);
  if (SAFE_KEY_PATTERN.test(k)) return false;
  return SENSITIVE_KEY_PATTERN.test(k);
}

// A path segment that looks like an opaque token (long, mixed alphanumeric).
function looksLikeOpaqueSegment(segment) {
  if (segment.length < 20) return false;
  if (!/^[A-Za-z0-9_~%.=-]+$/.test(segment)) return false;
  return /\d/.test(segment) && /[A-Za-z]/.test(segment);
}

/**
 * Redact the credential-bearing parts of a URL: user info, sensitive/opaque query
 * values, and opaque path segments. Scheme, host and general shape are preserved.
 */
function redactUrl(urlText) {
  const text = String(urlText);
  const match = text.match(/^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i);
  if (!match) return text;
  let [, scheme, authority, pathPart, query, hash] = match;
  const at = authority.lastIndexOf('@');
  if (at !== -1) authority = `${REDACTED}@${authority.slice(at + 1)}`;
  pathPart = pathPart
    .split('/')
    .map(seg => (looksLikeOpaqueSegment(seg) ? REDACTED : seg))
    .join('/');
  if (query) {
    query = '?' + query.slice(1).split('&').map(pair => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (!value) return pair;
      let decodedName = name;
      try { decodedName = decodeURIComponent(name); } catch (e) { /* keep raw */ }
      return SENSITIVE_QUERY_PARAM.test(decodedName) || looksLikeOpaqueSegment(value)
        ? `${name}=${REDACTED}`
        : pair;
    }).join('&');
  }
  if (hash && /(token|key|secret|pass|access)/i.test(hash)) hash = `#${REDACTED}`;
  return `${scheme}${authority}${pathPart}${query || ''}${hash || ''}`;
}

/**
 * Redact secrets from free text (log lines, error messages, string values).
 * `secrets` is an optional list of exact secret values that must never appear.
 */
function redactString(input, secrets = []) {
  if (input === undefined || input === null) return input;
  let text = String(input);
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 4) {
      text = text.split(secret).join(REDACTED);
    }
  }
  text = text.replace(PEM_BLOCK, REDACTED);
  text = text.replace(URL_PATTERN, url => redactUrl(url));
  text = text.replace(HEADER_PATTERN, (m, name) => `${name}: ${REDACTED}`);
  text = text.replace(BEARER_PATTERN, (m, scheme) => `${scheme} ${REDACTED}`);
  text = text.replace(KEY_VALUE_PATTERN, (m, q, name, sep, value) => {
    if (SAFE_KEY_PATTERN.test(name) || /^(true|false|null|undefined)$/i.test(value) || value === REDACTED || value === `"${REDACTED}"`) return m;
    if (/^["']?\[REDACTED/.test(value)) return m;
    return `${q}${name}${q}${sep}${REDACTED}`;
  });
  for (const pattern of TOKEN_PATTERNS) text = text.replace(pattern, REDACTED);
  return text;
}

/**
 * Create a redactor bound to a (growing) list of known secret values.
 */
function createRedactor() {
  const secrets = new Set();

  function collectSecrets(value, depth = 0) {
    if (depth > 12 || value === null || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      if (isSensitiveKey(key) && typeof v === 'string' && v.length >= 4) secrets.add(v);
      else if (v && typeof v === 'object') collectSecrets(v, depth + 1);
    }
  }

  /**
   * Deep-sanitize any JSON-like value. Returns the sanitized copy; paths of redacted
   * fields are pushed to `redactedPaths` (when provided).
   */
  function sanitize(value, redactedPaths = [], pathPrefix = '', depth = 0) {
    const list = Array.from(secrets);
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      const out = redactString(value, list);
      if (out !== value) redactedPaths.push(pathPrefix || '(value)');
      return out;
    }
    if (typeof value !== 'object') return value;
    if (depth > 20) return '[max depth]';
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map((item, i) => sanitize(item, redactedPaths, `${pathPrefix}[${i}]`, depth + 1));
    }
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      const keyPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (isSensitiveKey(key) && (v === REDACTED || v === NOT_SET)) {
        out[key] = v;
      } else if (isSensitiveKey(key) && typeof v !== 'boolean' && !(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)) {
        const isEmpty = v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0);
        out[key] = isEmpty ? NOT_SET : REDACTED;
        if (!isEmpty) redactedPaths.push(keyPath);
      } else {
        out[key] = sanitize(v, redactedPaths, keyPath, depth + 1);
      }
    }
    return out;
  }

  return {
    sanitize,
    redactString: text => redactString(text, Array.from(secrets)),
    addSecretsFrom: collectSecrets,
    addSecret(secret) { if (typeof secret === 'string' && secret.length >= 4) secrets.add(secret); },
    secretCount: () => secrets.size
  };
}

module.exports = { REDACTED, NOT_SET, isSensitiveKey, redactUrl, redactString, createRedactor };
