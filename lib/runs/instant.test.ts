import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInstant } from "./instant.ts";

const now = new Date("2026-09-26T10:00:00Z");

test("empty = now; explicit offsets are converted to UTC", () => {
  assert.equal(parseInstant("", now), "2026-09-26T10:00:00.000Z");
  assert.equal(parseInstant("2026-09-26T08:00+02:00", now), "2026-09-26T06:00:00.000Z");
  assert.equal(parseInstant("2026-09-26T08:00:30Z", now), "2026-09-26T08:00:30.000Z");
});

test("no offset, date only or free text -> invalid, never assumed", () => {
  for (const v of ["2026-09-26T08:00", "2026-09-26", "26.09.2026 08:00", "now", "2026-09-26T25:00+02:00"]) {
    assert.equal(parseInstant(v, now), null, v);
  }
});
