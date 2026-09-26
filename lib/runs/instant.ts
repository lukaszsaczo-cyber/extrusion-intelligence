// A user-entered run time: ISO 8601 with an explicit offset (Z or ±hh:mm).
// Empty means "now". A time without an offset is refused, never assumed; the
// same rule as the CSV import. Returns an ISO string, or null when invalid.
export function parseInstant(input: string, now: Date): string | null {
  const v = input.trim();
  if (v === "") return now.toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(v)) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
