// One safe line per server-side failure, for the Vercel runtime logs.
// It carries only the scope (a fixed action name), the Postgres error code,
// the leading guard token of a database message (e.g. "fail_order", "run_locked")
// and, for the engine, the contract's errorId. It never carries the message
// body, form data, record ids, keys or tokens. Pure except logServerError.

export type LoggableError = { code?: string | null; message?: string | null } | null | undefined;

const TOKEN = /^([a-z][a-z0-9_]{2,40})(?::|$)/;
const CODE = /^[0-9A-Z]{5}$/;
const SAFE_ID = /^[A-Za-z0-9_.-]{1,64}$/;

export function errorLine(scope: string, error: LoggableError, detail?: { reason?: string; errorId?: string }): string {
  const code = error?.code && CODE.test(error.code) ? error.code : "-";
  const token = error?.message ? (TOKEN.exec(error.message)?.[1] ?? "-") : "-";
  const parts = [`[ei:${scope}] failed`, `code=${code}`, `token=${token}`];
  if (detail?.reason && SAFE_ID.test(detail.reason)) parts.push(`reason=${detail.reason}`);
  if (detail?.errorId && SAFE_ID.test(detail.errorId)) parts.push(`errorId=${detail.errorId}`);
  return parts.join(" ");
}

export function logServerError(scope: string, error: LoggableError, detail?: { reason?: string; errorId?: string }): void {
  console.error(errorLine(scope, error, detail));
}
