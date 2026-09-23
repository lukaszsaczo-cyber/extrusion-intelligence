'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../src/sanitizer');
const C = require('../src/contract');
const { createGuard } = require('../src/term-guard');
const { createAdapter } = require('../src/adapter');

// Generic leak-field names (not IP) — the brief lists them as forbidden keys.
const LEAK_FIELDS = ['reasoning', 'chain_of_thought', 'selected_model', 'weights', 'coefficients',
  'thresholds', 'routing_trace', 'internal_stage', 'internal_phase', 'private_trace',
  'debug_trace', 'raw_engine_response'];

const ALLOWED_KEYS = new Set([
  'engineConnected', 'status', 'confidenceLabel', 'predictions', 'riskCategories', 'missingInputs',
  'proposedTest', 'approvalAllowed', 'metric', 'kind', 'value', 'min', 'max', 'unit',
  'parameter', 'current', 'proposed', 'observationSeconds', 'zone',
  'state', 'observed', 'verifiedEvidenceSaved',
]);

function allKeys(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, acc));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) { acc.push(k); allKeys(v[k], acc); }
  return acc;
}

const permissiveGuard = createGuard({ key: 'k'.repeat(32), digests: ['00'] });

function poisoned(status) {
  const raw = {
    status,
    confidenceLabel: 'MEDIUM',
    metrics: [
      { metric: 'pressure', min: 128, max: 139, weights: [0.3], thresholds: { hi: 150 } },
      { metric: 'sme', value: 97, coefficients: [1, 2] },
      { metric: 'secret_metric', value: 1 },
      { metric: 'torque', min: 50, max: 40 },            // inverted range -> dropped
      { metric: 'moisture', value: Number.NaN },        // not finite -> dropped
      { metric: 'pressure', value: 999 },               // duplicate -> dropped
    ],
    riskCategories: ['HARD_MACHINE_CONSTRAINT', 'PRIVATE_CAUSE_X', 'HARD_MACHINE_CONSTRAINT'],
    missingInputs: ['machine.max_pressure', 'Bad Code!'],
    proposedTest: { parameter: 'screw_speed', current: 800, proposed: 840, observationSeconds: 60,
      hypothesis_score: 0.91, ranking: [1, 2] },
    nested: { deep: { reasoning: 'x' } },
  };
  for (const f of LEAK_FIELDS) raw[f] = `leak:${f}`;
  return raw;
}

test('1. engine disconnected -> app works, zero predictions, no approval', async () => {
  const a = createAdapter({ env: {}, fetchImpl: () => { throw new Error('must not be called'); }, guard: permissiveGuard });
  assert.equal(a.connected, false);
  assert.deepEqual(await a.getEngineHealth(), { connected: false });
  const r = await a.analyzePreflight({});
  assert.equal(r.ok, true);
  assert.deepEqual(r.result.predictions, []);
  assert.equal(r.result.status, null);
  assert.equal(r.result.approvalAllowed, false);
  assert.deepEqual(r.result.riskCategories, ['ENGINE_NOT_CONNECTED']);
});

test('2. sanitizer strips every leak field, unknown field and unknown value', () => {
  const out = S.sanitizePreflight(poisoned('TEST_REQUIRED'), permissiveGuard);
  const json = JSON.stringify(out);
  for (const f of LEAK_FIELDS) assert.ok(!json.includes(f), `leaked key ${f}`);
  for (const k of allKeys(out)) assert.ok(ALLOWED_KEYS.has(k), `non-allowlisted key ${k}`);
  assert.ok(!json.includes('leak:'));
  assert.ok(!json.includes('PRIVATE_CAUSE_X'));
  assert.ok(!json.includes('secret_metric'));
  assert.ok(!json.includes('hypothesis_score'));
  assert.deepEqual(out.predictions, [
    { metric: 'pressure', kind: 'RANGE', min: 128, max: 139, unit: 'bar' },
    { metric: 'sme', kind: 'VALUE', value: 97, unit: 'Wh/kg' },
  ]);
  assert.deepEqual(out.riskCategories, ['HARD_MACHINE_CONSTRAINT']);
  assert.deepEqual(out.missingInputs, ['machine.max_pressure']);
  assert.deepEqual(out.proposedTest,
    { parameter: 'screw_speed', current: 800, proposed: 840, unit: 'rpm', observationSeconds: 60 });
});

test('units come from the contract, never from the engine', () => {
  const out = S.sanitizePreflight({ status: 'NEEDS_DATA', metrics: [{ metric: 'pressure', value: 5, unit: 'psi' }] }, permissiveGuard);
  assert.equal(out.predictions[0].unit, 'bar');
});

test('status outside contract is an error, never mapped to a friendlier status', async () => {
  assert.throws(() => S.sanitizePreflight({ status: 'SAFE' }, permissiveGuard), S.ContractViolation);
  assert.throws(() => S.sanitizePreflight({}, permissiveGuard), S.ContractViolation);
  const logs = [];
  const a = createAdapter({
    env: { EXTRUSION_CORE_API_URL: 'https://core.invalid/', EXTRUSION_CORE_API_TOKEN: 'tok_SECRET_123' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'GUARANTEED', reasoning: 'x' }) }),
    guard: permissiveGuard,
    logger: { error: (m) => logs.push(m) },
  });
  const r = await a.analyzePreflight({});
  assert.equal(r.ok, false);
  assert.equal(r.error.message, 'Request could not be completed.');
  assert.match(r.error.errorId, /^EI-[0-9A-F]{8}$/);
  assert.ok(!JSON.stringify(r).includes('GUARANTEED'));
  const logText = logs.join('\n');
  assert.ok(!logText.includes('tok_SECRET_123'), 'token in log');
  assert.ok(!logText.includes('core.invalid'), 'URL in log');
  assert.ok(!logText.includes('reasoning'), 'raw body in log');
});

for (const [status, allowed] of [
  ['DO_NOT_RUN', false], ['NEEDS_DATA', false], ['NOT_APPLICABLE', false],
  ['CHANGE_FORMULATION', false], ['CHANGE_CONFIGURATION', false],
  ['READY_FOR_OPERATOR_REVIEW', true], ['SHADOW_TEST_ONLY', true], ['TEST_REQUIRED', true],
]) {
  test(`4-6. approval for ${status} = ${allowed}`, () => {
    assert.equal(S.sanitizePreflight({ status }, permissiveGuard).approvalAllowed, allowed);
  });
}

test('all 8 contract statuses are covered by the approval table above', () => {
  assert.equal(C.DECISION_STATUSES.length, 8);
});

test('verified evidence only on VERIFIED_PASS with strict boolean true', () => {
  assert.equal(S.sanitizeVerification({ state: 'VERIFIED_PASS', evidenceSaved: true }).verifiedEvidenceSaved, true);
  assert.equal(S.sanitizeVerification({ state: 'VERIFIED_PASS', evidenceSaved: 'true' }).verifiedEvidenceSaved, false);
  assert.equal(S.sanitizeVerification({ state: 'VERIFIED_PASS' }).verifiedEvidenceSaved, false);
  assert.equal(S.sanitizeVerification({ state: 'INCONCLUSIVE', evidenceSaved: true }).verifiedEvidenceSaved, false);
  assert.throws(() => S.sanitizeVerification({ state: 'PASS' }), S.ContractViolation);
});

test('predicted vs actual: pure comparison, missing -> NOT_AVAILABLE', () => {
  const p = { kind: 'RANGE', min: 130, max: 138 };
  assert.deepEqual(S.compare(p, 134), { status: 'WITHIN_RANGE', difference: 0 });
  assert.deepEqual(S.compare({ kind: 'RANGE', min: 92, max: 101 }, 104), { status: 'OUTSIDE_RANGE', difference: 3 });
  assert.deepEqual(S.compare(p, null), { status: 'NOT_AVAILABLE', difference: null });
  assert.deepEqual(S.compare(null, 134), { status: 'NOT_AVAILABLE', difference: null });
});

test('13. audit export contains only the public allowlist and a reproducible hash', () => {
  const pre = S.sanitizePreflight(poisoned('TEST_REQUIRED'), permissiveGuard);
  const rec = { auditId: 'A1', runId: 'R1', fileHash: 'abc', reasoning: 'x', raw_engine_response: {} };
  const out = S.buildAuditExport(rec, pre, { state: 'VERIFIED_PASS' }, { state: 'INCOMPLETE' }, 'INCOMPLETE');
  const expected = new Set([...S.AUDIT_FIELDS, 'preflightDecision', 'processVerification',
    'productVerification', 'finalStatus', 'finalAuditHash']);
  assert.deepEqual(new Set(Object.keys(out)), expected);
  const json = JSON.stringify(out);
  for (const f of LEAK_FIELDS) assert.ok(!json.includes(f));
  const again = S.buildAuditExport(rec, pre, { state: 'VERIFIED_PASS' }, { state: 'INCOMPLETE' }, 'INCOMPLETE');
  assert.equal(out.finalAuditHash, again.finalAuditHash);
  assert.match(out.finalAuditHash, /^[0-9a-f]{64}$/);
});

test('guard not configured -> fail-closed: free-text codes dropped, enums/numbers still flow', () => {
  const g = createGuard({ key: undefined, digests: [] });
  assert.equal(g.ready, false);
  const out = S.sanitizePreflight({ status: 'NEEDS_DATA', missingInputs: ['recipe.moisture'],
    metrics: [{ metric: 'pressure', value: 1 }] }, g);
  assert.deepEqual(out.missingInputs, []);
  assert.equal(out.predictions.length, 1);
});

// 3. Real forbidden terms. Terms + key live OUTSIDE the repo (CI secret).
// Without them this test is reported as SKIPPED (= NOT RUN), never as PASS.
test('3. forbidden internal terms never reach public output', (t) => {
  const key = process.env.TERM_GUARD_KEY;
  const termsFile = process.env.TERM_GUARD_TERMS_FILE;
  const digestsFile = path.join(__dirname, '..', 'forbidden-term-digests.json');
  if (!key || !termsFile || !fs.existsSync(termsFile) || !fs.existsSync(digestsFile)) {
    t.skip('NOT RUN: TERM_GUARD_KEY / TERM_GUARD_TERMS_FILE / digests not provided');
    return;
  }
  const terms = fs.readFileSync(termsFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const guard = createGuard({ key, digests: JSON.parse(fs.readFileSync(digestsFile, 'utf8')) });
  assert.ok(guard.ready);
  for (const term of terms) {
    const codeLike = term.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/g, '_');
    const variants = [term, term.toLowerCase(), `x ${term} y`, `machine.${codeLike}`, `${codeLike}_state`];
    for (const v of variants) assert.equal(guard.isClean(v), false, `guard missed a variant of term #${terms.indexOf(term)}`);
    const raw = { status: 'TEST_REQUIRED', confidenceLabel: term, missingInputs: [`machine.${codeLike}`, 'recipe.moisture'],
      riskCategories: [term], metrics: [{ metric: term, value: 1 }], [term]: term };
    const json = JSON.stringify(S.sanitizePreflight(raw, guard)).toUpperCase();
    assert.ok(!json.includes(term.toUpperCase()), `term #${terms.indexOf(term)} leaked`);
  }
  // No false positives on ordinary vocabulary.
  for (const ok of ['recipe.moisture', 'machine.max_pressure', 'process_plan.zone_3']) assert.equal(guard.isClean(ok), true);
});
