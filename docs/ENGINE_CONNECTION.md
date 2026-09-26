# Connecting the engine

The app asks the engine only through `server/engine-contract` (adapter →
sanitizer). Results are stored only by two database functions (migrations 0015
and 0016), and only in the contract's shape:

- `record_engine_decision`: decision, confidence, risk categories, missing
  inputs, proposed test and predictions for a plan;
- `record_engine_verification`: verification state for a completed run
  (kind `ENGINE`, because the contract's verification covers the whole run).

## Who may store a result

Both functions are SECURITY DEFINER, so the database itself checks who calls
them. A call is stored only when all of these hold:

1. The caller passes the **engine write key**. This is a random secret held
   only by the app server in `ENGINE_WRITE_KEY`. The database keeps only its
   SHA-256 in `private.engine_write_keys`. A signed-in user calling the function
   directly does not have the key and is refused. The key opens these two
   functions and nothing else; the service role key is not used.
2. The signed-in user is ADMIN or ENGINEER in the plan's or run's
   organization.
3. The plan has not changed since the engine was asked (`updated_at`), and it
   is not approved yet. For a verification, the run is COMPLETED.
4. Every value is inside the contract: statuses, confidence labels, risk
   categories, units (always the contract's, never the engine's), test
   parameters, and the missing-input code pattern. A missing field is refused,
   never accepted as empty.

## What the operator needs to do

| Secret | Where | State on 2026-09-26 |
|---|---|---|
| `EXTRUSION_CORE_API_URL`, `EXTRUSION_CORE_API_TOKEN` | Vercel env (server) | not set: engine not connected |
| `ENGINE_WRITE_KEY` | Vercel env (server) | not set |
| hash of `ENGINE_WRITE_KEY` | `private.engine_write_keys` (Supabase SQL editor) | none registered |

To create the key, run `node scripts/engine-write-key.mjs` on your own machine
and follow the two printed steps. Never paste the key into a chat.

## What happens in each state

| State | Result |
|---|---|
| Engine not connected (no URL or token) | Nothing is requested or stored. The UI shows NOT AVAILABLE. |
| Engine answer outside the contract | The adapter returns a public error id; nothing is stored. |
| Engine answered, `ENGINE_WRITE_KEY` missing | Nothing is stored. The UI says so. |
| Key not registered or revoked | Refused by the database; nothing is stored. |

## Open point

The contract defines the engine's **answer**, not the **request**. The app
sends `ei-preflight-request-v1` (`lib/engine/results.ts`), which is built only
from stored public app data: plan setpoints, machine configuration, recipe
components, targets and confirmed limits. This format must be agreed with the
engine side before real use.
