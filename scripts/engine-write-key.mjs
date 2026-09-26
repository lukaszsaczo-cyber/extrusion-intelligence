// Generates an engine write key for record_engine_decision / _verification
// (migration 0015). Run it on your own machine: `node scripts/engine-write-key.mjs`.
// It prints the key (goes ONLY into the server env ENGINE_WRITE_KEY, e.g. Vercel
// project secrets) and the SQL that registers its SHA-256 in the database. The
// database never sees the key itself. Do not paste the key into chats or tickets.
import { createHash, randomBytes } from "node:crypto";

const key = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(key, "utf8").digest("hex");
const label = process.argv[2] ?? `app-server ${new Date().toISOString().slice(0, 10)}`;

console.log(`1) Server secret (Vercel -> Settings -> Environment Variables, Production):
   ENGINE_WRITE_KEY=${key}

2) Register the hash (Supabase -> SQL Editor):
   insert into private.engine_write_keys (key_sha256, label) values ('${hash}', '${label.replace(/'/g, "''")}');

To revoke later:
   update private.engine_write_keys set revoked_at = now() where key_sha256 = '${hash}';`);
