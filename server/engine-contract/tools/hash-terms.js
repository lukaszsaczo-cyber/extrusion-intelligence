'use strict';
// Usage: TERM_GUARD_KEY=... node tools/hash-terms.js /path/outside/repo/terms.txt > forbidden-term-digests.json
const fs = require('node:fs');
const { digestTerms } = require('../src/term-guard');
const key = process.env.TERM_GUARD_KEY;
if (!key || key.length < 32) { console.error('TERM_GUARD_KEY missing or < 32 chars'); process.exit(1); }
const terms = fs.readFileSync(process.argv[2], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
process.stdout.write(JSON.stringify(digestTerms(key, terms), null, 0) + '\n');
