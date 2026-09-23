# ei-engine-contract

Server-only public contract, sanitizer and adapter for Extrusion Intelligence.
Zero dependencies, Node >= 20. `npm test`.

## What it guarantees (covered by tests)
- Engine disconnected -> app works, `predictions = []`, `status = null`, no approval.
- Every public object is built field-by-field. Unknown keys, unknown enum values,
  non-finite numbers, inverted ranges and duplicate metrics are dropped.
- Units come from the contract, never from the engine.
- Status outside the contract -> public error `EI-XXXXXXXX`, never a "friendlier" status.
- Approval only for READY_FOR_OPERATOR_REVIEW / SHADOW_TEST_ONLY / TEST_REQUIRED.
- "Verified evidence saved" only for VERIFIED_PASS with strict boolean `evidenceSaved === true`.
- Audit export = fixed field allowlist + SHA-256 over canonical JSON.
- Logs contain only error id + category (no token, URL, headers, body).

## Forbidden-term guard
The repo holds no plaintext internal terms. Only HMAC-SHA256 digests, keyed with
`TERM_GUARD_KEY` (>= 32 chars, server env / CI secret). Plain SHA-256 is not
used because short terms are brute-forceable.

    export TERM_GUARD_KEY=...                  # secret
    export TERM_GUARD_TERMS_FILE=/outside/repo/terms.txt
    node tools/hash-terms.js "$TERM_GUARD_TERMS_FILE" > forbidden-term-digests.json
    npm test

Without these the term test reports SKIP (= NOT RUN), never PASS.
If the guard is not configured at runtime it fails closed: free-text codes are
dropped, enums and numbers still flow.

Known limit: detection is token/n-gram based (up to 3 words). A term glued to
other letters with no separator (e.g. `abcTERMxyz`) is not detected. The engine
contract allows free text only in `missingInputs` (strict `a.b_c` code pattern),
so the exposed surface is small.

## Engine contract (the engine must conform)
See `src/contract.js`. The engine returns public enums only:
`status`, `confidenceLabel`, `metrics[{metric, value | min,max}]`,
`riskCategories[]`, `missingInputs[]`,
`proposedTest{parameter, current, proposed, observationSeconds, zone?}`,
verification `{state, observed[], evidenceSaved}`.
Everything else is ignored.
