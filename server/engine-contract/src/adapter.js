'use strict';
// Server-only adapter. The browser never reaches this module or the engine.
// fetchImpl and logger are injectable for tests.

const S = require('./sanitizer');

function createAdapter({ env = process.env, fetchImpl = globalThis.fetch, guard, logger = console } = {}) {
  const url = env.EXTRUSION_CORE_API_URL;
  const token = env.EXTRUSION_CORE_API_TOKEN;
  const connected = Boolean(url && token);

  // Logs only error id + category. Never URL, headers, token or response body.
  function fail(category) {
    const err = S.publicError();
    logger.error(`[engine-adapter] ${err.errorId} ${category}`);
    return { ok: false, error: err };
  }

  async function call(path, body) {
    const res = await fetchImpl(new URL(path, url).toString(), {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error('http');
    return res.json();
  }

  return {
    connected,

    async getEngineHealth() {
      if (!connected) return { connected: false };
      try { await call('/health'); return { connected: true }; }
      catch { return { connected: false }; }
    },

    async analyzePreflight(publicInput) {
      if (!connected) return { ok: true, result: S.disconnectedPreflight() };
      let raw;
      try { raw = await call('/preflight', publicInput); }
      catch { return fail('transport'); }
      try { return { ok: true, result: S.sanitizePreflight(raw, guard) }; }
      catch (e) { return fail(e instanceof S.ContractViolation ? 'contract' : 'sanitize'); }
      // raw goes out of scope here; it is never stored or returned.
    },

    async verifyRun(runId) {
      if (!connected) return fail('not_connected');
      let raw;
      try { raw = await call(`/runs/${encodeURIComponent(runId)}/verify`, {}); }
      catch { return fail('transport'); }
      try { return { ok: true, result: S.sanitizeVerification(raw) }; }
      catch (e) { return fail(e instanceof S.ContractViolation ? 'contract' : 'sanitize'); }
    },
  };
}

module.exports = { createAdapter };
