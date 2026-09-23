'use strict';
// Server-only. Builds every public object field-by-field from an allowlist.
// Never spreads, never returns the raw engine object, never computes values.
// Invalid or unknown input -> dropped (NOT AVAILABLE), never guessed.

const crypto = require('node:crypto');
const C = require('./contract');

const has = (list, v) => typeof v === 'string' && list.includes(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const CODE_RE = /^[a-z][a-z0-9_]{0,31}(\.[a-z][a-z0-9_]{0,31}){0,2}$/;

function sanitizeMetric(key, m) {
  if (!Object.prototype.hasOwnProperty.call(C.METRICS, key) || !m || typeof m !== 'object') return null;
  const unit = C.METRICS[key];
  if (finite(m.value)) return { metric: key, kind: 'VALUE', value: m.value, unit };
  if (finite(m.min) && finite(m.max) && m.min <= m.max) {
    return { metric: key, kind: 'RANGE', min: m.min, max: m.max, unit };
  }
  return null;
}

function sanitizeMetrics(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || seen.has(item.metric)) continue;
    const m = sanitizeMetric(item.metric, item);
    if (m) { seen.add(m.metric); out.push(m); }
  }
  return out;
}

function sanitizeReasons(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((r) => has(C.REASON_CATEGORIES, r)))];
}

function sanitizeMissingInputs(raw, guard) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((c) => typeof c === 'string' && CODE_RE.test(c) && guard.isClean(c)))];
}

function sanitizeProposedTest(t) {
  if (!t || typeof t !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(C.TEST_PARAMETERS, t.parameter)) return null;
  if (!finite(t.current) || !finite(t.proposed)) return null;
  if (!Number.isInteger(t.observationSeconds) || t.observationSeconds <= 0 || t.observationSeconds > 86400) return null;
  const out = {
    parameter: t.parameter,
    current: t.current,
    proposed: t.proposed,
    unit: C.TEST_PARAMETERS[t.parameter],
    observationSeconds: t.observationSeconds,
  };
  if (t.parameter === 'zone_temperature') {
    if (!Number.isInteger(t.zone) || t.zone < 1 || t.zone > 64) return null;
    out.zone = t.zone;
  }
  return out;
}

class ContractViolation extends Error {}

// Engine disconnected: no decision, no predictions, one public reason.
function disconnectedPreflight() {
  return {
    engineConnected: false,
    status: null,
    confidenceLabel: 'NOT_AVAILABLE',
    predictions: [],
    riskCategories: ['ENGINE_NOT_CONNECTED'],
    missingInputs: [],
    proposedTest: null,
    approvalAllowed: false,
  };
}

function sanitizePreflight(raw, guard) {
  if (!raw || typeof raw !== 'object') throw new ContractViolation('preflight: not an object');
  // Unknown/absent status is NOT converted to a friendlier one: it is an error.
  if (!has(C.DECISION_STATUSES, raw.status)) throw new ContractViolation('preflight: status outside contract');
  return {
    engineConnected: true,
    status: raw.status,
    confidenceLabel: has(C.CONFIDENCE_LABELS, raw.confidenceLabel) ? raw.confidenceLabel : 'NOT_AVAILABLE',
    predictions: sanitizeMetrics(raw.metrics),
    riskCategories: sanitizeReasons(raw.riskCategories),
    missingInputs: sanitizeMissingInputs(raw.missingInputs, guard),
    proposedTest: sanitizeProposedTest(raw.proposedTest),
    approvalAllowed: C.APPROVABLE_STATUSES.includes(raw.status),
  };
}

function sanitizeVerification(raw) {
  if (!raw || typeof raw !== 'object') throw new ContractViolation('verification: not an object');
  if (!has(C.VERIFICATION_STATES, raw.state)) throw new ContractViolation('verification: state outside contract');
  return {
    state: raw.state,
    observed: sanitizeMetrics(raw.observed),
    // Only a strict boolean true together with VERIFIED_PASS counts.
    verifiedEvidenceSaved: raw.state === 'VERIFIED_PASS' && raw.evidenceSaved === true,
  };
}

// Predicted vs actual. Pure comparison of two public values; no hidden logic.
function compare(pred, actual) {
  if (!pred || !finite(actual)) return { status: 'NOT_AVAILABLE', difference: null };
  if (pred.kind === 'VALUE') return { status: 'POINT_PREDICTION', difference: actual - pred.value };
  const inside = actual >= pred.min && actual <= pred.max;
  const difference = inside ? 0 : actual < pred.min ? actual - pred.min : actual - pred.max;
  return { status: inside ? 'WITHIN_RANGE' : 'OUTSIDE_RANGE', difference };
}

function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

const AUDIT_FIELDS = Object.freeze([
  'auditId', 'runId', 'organization', 'site', 'machine', 'serialNumber',
  'machineConfigSnapshot', 'recipeVersion', 'processPlanVersion', 'operator',
  'startTime', 'endTime', 'importedFilename', 'fileHash',
]);

// Audit export is assembled from app records + already-sanitized objects only.
function buildAuditExport(record, preflight, processVerification, productVerification, finalStatus) {
  const out = {};
  for (const f of AUDIT_FIELDS) out[f] = record && record[f] !== undefined ? record[f] : null;
  out.preflightDecision = preflight ? preflight.status : null;
  out.processVerification = processVerification ? processVerification.state : null;
  out.productVerification = productVerification ? productVerification.state : null;
  out.finalStatus = has(C.VERIFICATION_STATES, finalStatus) ? finalStatus : null;
  out.finalAuditHash = crypto.createHash('sha256').update(canonical(out), 'utf8').digest('hex');
  return out;
}

function publicError() {
  return {
    message: 'Request could not be completed.',
    errorId: 'EI-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
  };
}

module.exports = {
  ContractViolation,
  disconnectedPreflight,
  sanitizePreflight,
  sanitizeVerification,
  compare,
  buildAuditExport,
  publicError,
  canonical,
  AUDIT_FIELDS,
};
