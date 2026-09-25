// Pure parsing of one run data file (wide CSV: one timestamp column + one column
// per source tag). No I/O. Nothing is guessed: the caller states delimiter,
// decimal separator, timestamp column and format; anything the parser cannot
// decide unambiguously is reported as an error and the whole file is rejected.

export type Delimiter = "," | ";" | "\t";
export type DecimalSeparator = "." | ",";
export type TimestampFormat = "iso_offset" | "epoch_s" | "epoch_ms";
export type SampleQuality = "VALID" | "SUSPECT" | "MISSING" | "UNMAPPED";

export type ImportOptions = {
  delimiter: Delimiter;
  decimal: DecimalSeparator;
  timestampColumn: string;
  timestampFormat: TimestampFormat;
  // raw column header (source tag) -> unit, for tags mapped to a canonical signal
  mappedTags: ReadonlyMap<string, string | null>;
};

export type Sample = {
  signal: string; // raw source tag, kept as-is (evidence)
  ts: string; // ISO 8601 UTC
  value: number | null;
  raw_text: string | null;
  unit: string | null;
  quality: SampleQuality;
};

export type ImportErrorCode =
  | "BOTH_COMMA" | "NO_DATA_ROWS" | "EMPTY_HEADER" | "DUPLICATE_HEADER" | "TS_COLUMN_MISSING"
  | "NO_DATA_COLUMNS" | "TOO_MANY_VALUES" | "FIELD_COUNT" | "BAD_TIMESTAMP" | "TOO_MANY_ERRORS";

// Codes + parameters; the UI turns them into PL/EN text.
export type ImportError = { code: ImportErrorCode; params?: Record<string, string | number> };

export type ImportResult =
  | {
      ok: true;
      samples: Sample[];
      rowCount: number;
      columnCount: number;
      dataColumns: string[];
      unmappedColumns: string[];
      counts: Record<SampleQuality, number>;
      firstTs: string;
      lastTs: string;
    }
  | { ok: false; errors: ImportError[] };

export const MAX_SAMPLES = 200_000;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ERRORS = 20;

// RFC 4180-style parsing: quoted fields, "" escapes, CRLF/LF, optional BOM.
export function parseDelimited(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  // drop trailing fully empty lines
  while (rows.length && rows[rows.length - 1]!.every((f) => f === "")) rows.pop();
  return rows;
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

export function parseTimestamp(raw: string, format: TimestampFormat): string | null {
  const s = raw.trim();
  let ms: number;
  if (format === "iso_offset") {
    // A timestamp without an explicit offset is ambiguous: reject, do not assume a zone.
    if (!ISO_WITH_OFFSET.test(s)) return null;
    ms = Date.parse(s.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  } else {
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    ms = Number(s) * (format === "epoch_s" ? 1000 : 1);
  }
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function parseNumber(raw: string, decimal: DecimalSeparator): number | null {
  const s = raw.trim();
  if (decimal === ",") {
    if (s.includes(".")) return null; // thousands separators are ambiguous: reject
    const t = s.replace(",", ".");
    return NUMBER.test(t) ? Number(t) : null;
  }
  if (s.includes(",")) return null;
  return NUMBER.test(s) ? Number(s) : null;
}

export function buildSamples(text: string, opts: ImportOptions): ImportResult {
  if (opts.delimiter === "," && opts.decimal === ",") {
    return { ok: false, errors: [{ code: "BOTH_COMMA" }] };
  }
  const rows = parseDelimited(text, opts.delimiter);
  if (rows.length < 2) return { ok: false, errors: [{ code: "NO_DATA_ROWS" }] };

  const header = rows[0]!.map((h) => h.trim());
  const errors: ImportError[] = [];
  const seen = new Set<string>();
  header.forEach((h, i) => {
    if (h === "") errors.push({ code: "EMPTY_HEADER", params: { column: i + 1 } });
    else if (seen.has(h)) errors.push({ code: "DUPLICATE_HEADER", params: { header: h } });
    seen.add(h);
  });
  const tsIndex = header.indexOf(opts.timestampColumn.trim());
  if (tsIndex < 0) errors.push({ code: "TS_COLUMN_MISSING", params: { column: opts.timestampColumn } });
  if (errors.length) return { ok: false, errors };

  const dataColumns = header.filter((_, i) => i !== tsIndex);
  if (dataColumns.length === 0) return { ok: false, errors: [{ code: "NO_DATA_COLUMNS" }] };
  const cells = (rows.length - 1) * dataColumns.length;
  if (cells > MAX_SAMPLES) {
    return { ok: false, errors: [{ code: "TOO_MANY_VALUES", params: { values: cells, limit: MAX_SAMPLES } }] };
  }

  const samples: Sample[] = [];
  const counts: Record<SampleQuality, number> = { VALID: 0, SUSPECT: 0, MISSING: 0, UNMAPPED: 0 };
  let firstMs = Infinity;
  let lastMs = -Infinity;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const line = r + 1;
    if (row.length !== header.length) {
      errors.push({ code: "FIELD_COUNT", params: { line, expected: header.length, found: row.length } });
      if (errors.length >= MAX_ERRORS) break;
      continue;
    }
    const ts = parseTimestamp(row[tsIndex]!, opts.timestampFormat);
    if (!ts) {
      errors.push({ code: "BAD_TIMESTAMP", params: { line, value: row[tsIndex]!.slice(0, 64) } });
      if (errors.length >= MAX_ERRORS) break;
      continue;
    }
    const ms = Date.parse(ts);
    firstMs = Math.min(firstMs, ms);
    lastMs = Math.max(lastMs, ms);

    header.forEach((signal, c) => {
      if (c === tsIndex) return;
      const raw = row[c]!;
      const text = raw.trim();
      let sample: Sample;
      if (text === "") {
        sample = { signal, ts, value: null, raw_text: null, unit: null, quality: "MISSING" };
      } else if (!opts.mappedTags.has(signal)) {
        // No canonical signal yet: keep the source text, do not interpret it.
        sample = { signal, ts, value: null, raw_text: raw, unit: null, quality: "UNMAPPED" };
      } else {
        const unit = opts.mappedTags.get(signal) ?? null;
        const value = parseNumber(text, opts.decimal);
        sample = value === null || !Number.isFinite(value)
          ? { signal, ts, value: null, raw_text: raw, unit, quality: "SUSPECT" }
          : { signal, ts, value, raw_text: raw, unit, quality: "VALID" };
      }
      counts[sample.quality]++;
      samples.push(sample);
    });
  }
  if (errors.length) {
    if (errors.length >= MAX_ERRORS) errors.push({ code: "TOO_MANY_ERRORS", params: { limit: MAX_ERRORS } });
    return { ok: false, errors };
  }

  return {
    ok: true,
    samples,
    rowCount: rows.length - 1,
    columnCount: header.length,
    dataColumns,
    unmappedColumns: dataColumns.filter((c) => !opts.mappedTags.has(c)),
    counts,
    firstTs: new Date(firstMs).toISOString(),
    lastTs: new Date(lastMs).toISOString(),
  };
}
