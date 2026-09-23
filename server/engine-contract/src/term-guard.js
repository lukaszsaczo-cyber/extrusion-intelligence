'use strict';
// Server-only. Detects internal terminology in free-text strings WITHOUT
// storing the terms in plaintext. The repo holds only HMAC-SHA256 digests;
// the key (TERM_GUARD_KEY) lives in the server environment / CI secret.
// Plain SHA-256 is NOT used: short terms are trivially brute-forced.

const crypto = require('node:crypto');

const MAX_NGRAM = 3;

function normalize(s) {
  return String(s).normalize('NFC').toUpperCase();
}

function tokens(s) {
  return normalize(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function ngrams(toks) {
  const out = [];
  for (let n = 1; n <= MAX_NGRAM; n++) {
    for (let i = 0; i + n <= toks.length; i++) out.push(toks.slice(i, i + n).join(' '));
  }
  return out;
}

function digest(key, term) {
  return crypto.createHmac('sha256', key).update(term, 'utf8').digest('hex');
}

// Used offline to produce the digest file from a terms list kept OUTSIDE the repo.
function digestTerms(key, terms) {
  return [...new Set(terms.map((t) => digest(key, tokens(t).join(' '))))].sort();
}

function createGuard({ key, digests }) {
  const ready = typeof key === 'string' && key.length >= 32 && Array.isArray(digests) && digests.length > 0;
  const set = new Set(ready ? digests : []);
  return {
    ready,
    // true  -> string is safe to publish
    // false -> contains a forbidden term, OR guard not configured (fail-closed)
    isClean(s) {
      if (!ready) return false;
      return !ngrams(tokens(s)).some((g) => set.has(digest(key, g)));
    },
  };
}

module.exports = { createGuard, digestTerms, tokens };
