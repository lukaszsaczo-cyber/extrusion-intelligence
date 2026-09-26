# Protected term guard

Internal engine terminology must never reach build output, client chunks,
messages or API responses (spec 18). The repository holds **no plaintext
terms**. Detection uses the contract's guard
(`server/engine-contract/src/term-guard.js`):
- HMAC-SHA256 digests keyed with `TERM_GUARD_KEY`;
- token n-grams of up to 3 words;
- case- and separator-insensitive.

## Where it runs

| Place | What | Without key and digests |
|---|---|---|
| Runtime (`server/engine.ts`) | Free-text codes in engine answers (`missingInputs`) | Fails closed: free text is dropped |
| `npm run build` (also on Vercel) | `.next/static` (client chunks), `.next/server` (server output), `messages/*.json` | NOT RUN (exit 0) |
| `npm run test:terms` | Same, plus API responses when `TERM_SCAN_BASE_URL` is set (`TERM_SCAN_PATHS`, default `/api/health`; optional `TERM_SCAN_COOKIE` for signed-in routes) | NOT RUN |
| Contract test 3 (`server/engine-contract`, `npm test`) | Each real term and its variants never survive the sanitizer | SKIP (= NOT RUN) |

A **FAIL** exits 1 and stops the build. The report names only files or API
paths, never a term. PASS requires all three areas: build, messages and API.

## Setting it up

Work on your own machine and keep the terms file outside the repository.

1. Create the key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Compute the digests:
   `TERM_GUARD_KEY=... node server/engine-contract/tools/hash-terms.js /outside/terms.txt`
3. Add these server secrets in Vercel, for the Production and Preview
   environments:
   - `TERM_GUARD_KEY`: the key;
   - `TERM_GUARD_DIGESTS`: the JSON array printed in step 2.

   Digests without the key reveal nothing.
4. For the contract's own term test (test 3), set `TERM_GUARD_TERMS_FILE` in
   CI and save the digests as
   `server/engine-contract/forbidden-term-digests.json`.

Never paste the key or the terms into a chat.

## Known limit (from the contract)

A term glued inside a longer word with no separator (e.g. `abcTERMxyz`) is not
detected. This is pinned by a test in `scripts/term-scan.test.mjs`.

## Evidence without real terms (2026-09-26)

Real terms have not been provided, so the real check is **NOT RUN**. To show
that the scanner reads the real artifacts, it was run on the real build with a
temporary key and control terms:

| Control | Expected | Result |
|---|---|---|
| A word present in the app (`messages/pl.json`) | FAIL | FAIL: `messages/pl.json` and `.next/server/chunks/267.js` named; exit 1 |
| A term absent from the app, API via `next start` (`/api/health`, `/login`) | PASS | PASS: 155 build files, 2 messages files, 2 API responses; exit 0 |
