import test from "node:test";
import assert from "node:assert/strict";
import { buildSamples, parseDelimited, parseNumber, parseTimestamp, type ImportOptions } from "./run-file.ts";

const base: ImportOptions = {
  delimiter: ",",
  decimal: ".",
  timestampColumn: "time",
  timestampFormat: "iso_offset",
  mappedTags: new Map([["P1", "bar"], ["T1", "°C"]]),
};

test("parseDelimited handles quotes, escaped quotes, CRLF and BOM", () => {
  const rows = parseDelimited('﻿a,"b,c","d ""x"""\r\n1,2,3\r\n', ",");
  assert.deepEqual(rows, [["a", "b,c", 'd "x"'], ["1", "2", "3"]]);
});

test("timestamps without an explicit offset are rejected, not assumed", () => {
  assert.equal(parseTimestamp("2026-09-25 10:00:00", "iso_offset"), null);
  assert.equal(parseTimestamp("2026-09-25T10:00:00Z", "iso_offset"), "2026-09-25T10:00:00.000Z");
  assert.equal(parseTimestamp("2026-09-25 12:00:00+0200", "iso_offset"), "2026-09-25T10:00:00.000Z");
  assert.equal(parseTimestamp("1790000000", "epoch_s"), new Date(1790000000000).toISOString());
  assert.equal(parseTimestamp("abc", "epoch_ms"), null);
});

test("numbers: decimal separator is explicit, thousands separators rejected", () => {
  assert.equal(parseNumber("12.5", "."), 12.5);
  assert.equal(parseNumber("12,5", ","), 12.5);
  assert.equal(parseNumber("1,234.5", "."), null);
  assert.equal(parseNumber("1.234,5", ","), null);
  assert.equal(parseNumber("12,5", "."), null);
  assert.equal(parseNumber("-3e2", "."), -300);
  assert.equal(parseNumber("n/a", "."), null);
});

test("sample quality: VALID / SUSPECT / MISSING / UNMAPPED", () => {
  const csv = "time,P1,T1,X9\n2026-09-25T10:00:00Z,120.5,,7\n2026-09-25T10:00:01Z,ERR,180,8\n";
  const r = buildSamples(csv, base);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.rowCount, 2);
  assert.equal(r.columnCount, 4);
  assert.deepEqual(r.unmappedColumns, ["X9"]);
  assert.deepEqual(r.counts, { VALID: 2, SUSPECT: 1, MISSING: 1, UNMAPPED: 2 });
  const p = r.samples.find((s) => s.signal === "P1" && s.quality === "VALID")!;
  assert.deepEqual(p, { signal: "P1", ts: "2026-09-25T10:00:00.000Z", value: 120.5, raw_text: "120.5", unit: "bar", quality: "VALID" });
  const x = r.samples.find((s) => s.signal === "X9")!;
  assert.equal(x.value, null); // unmapped: text kept, never interpreted
  assert.equal(x.raw_text, "7");
  assert.equal(r.firstTs, "2026-09-25T10:00:00.000Z");
  assert.equal(r.lastTs, "2026-09-25T10:00:01.000Z");
});

test("semicolon + decimal comma export", () => {
  const r = buildSamples("time;P1\n1790000000;12,5\n", { ...base, delimiter: ";", decimal: ",", timestampFormat: "epoch_s" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.samples[0]!.value, 12.5);
});

test("whole file rejected on any bad timestamp or ragged row", () => {
  const bad = buildSamples("time,P1\n2026-09-25 10:00:00,1\n2026-09-25T10:00:01Z,2,9\n", base);
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.deepEqual(bad.errors[0], { code: "BAD_TIMESTAMP", params: { line: 2, value: "2026-09-25 10:00:00" } });
    assert.deepEqual(bad.errors[1], { code: "FIELD_COUNT", params: { line: 3, expected: 2, found: 3 } });
  }
});

test("header problems are reported", () => {
  const r1 = buildSamples("ts,P1\n2026-09-25T10:00:00Z,1\n", base);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.errors[0]!.code, "TS_COLUMN_MISSING");
  const r2 = buildSamples("time,P1,P1\n2026-09-25T10:00:00Z,1,2\n", base);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.deepEqual(r2.errors[0], { code: "DUPLICATE_HEADER", params: { header: "P1" } });
  const r3 = buildSamples("time,P1\n", base);
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.equal(r3.errors[0]!.code, "NO_DATA_ROWS");
  const r4 = buildSamples("time,P1\n1,2\n", { ...base, decimal: "," });
  assert.equal(r4.ok, false);
  if (!r4.ok) assert.equal(r4.errors[0]!.code, "BOTH_COMMA");
});
