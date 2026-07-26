# Surface nested network error causes in Logger.error

**Type:** AFK

## Parent

PRD: `docs/prd/prd-telegram-notification-failure-diagnostics.md`

## What to build

Make failed network calls diagnosable by fixing the shared logger so it serializes the
*real* underlying cause instead of collapsing it to the string `"AggregateError"`.

Today `Logger.error()` builds its output with `` `cause: ${error.cause}` ``. When the
cause is an `AggregateError` (as produced by Node/undici's `TypeError: fetch failed`),
template interpolation renders it as the literal text `"AggregateError"` and discards
its `.errors[]` array — which is exactly where the actionable detail lives
(`ENETUNREACH` / `ENOTFOUND` / `ECONNREFUSED` / `ETIMEDOUT`, plus target address and
port for each failed connection attempt).

Change `Logger.error()` so that when `error.cause` is an `Error`/`AggregateError`, it is
serialized structurally: the cause's `name`/`message`, and — when it is an
`AggregateError` — each entry of its `.errors[]` array including any
`code`/`errno`/`syscall`/`address`/`port` own-properties. This is a codebase-wide
improvement: `TelegramNotifier.sendMessage()` and `main-scraper.ts`'s
`fetchScraperCountry()` both route through this logger and both benefit immediately.

This is observability only. Do **not** add any connectivity fix (no forcing IPv4, no
VPN/routing changes, no transport change) — that is a separate, follow-up PRD gated on
what these logs reveal. Notification flow is unchanged: a failed send still returns the
existing `TELEGRAM_NOTIFICATION_ERROR` failure result and never halts the scraper.

The `TelegramNotifier` may optionally build a richer `context` object (unwrapping
`error.cause` / `cause.errors`) before logging, but the primary, required fix is in the
logger so every caller benefits.

## Acceptance criteria

- [ ] `Logger.error()` serializes an `error.cause` that is a plain `Error` (surfaces its message; stack/name as applicable) rather than printing `[object Object]` or a bare class name.
- [ ] When `error.cause` is an `AggregateError`, the log output includes each inner error's `code` and, when present, its `address`/`port` — not the literal string `"AggregateError"`.
- [ ] A failed `TelegramNotifier.sendMessage()` (undici `fetch failed`) now produces a log line from which an operator can read the underlying network error code.
- [ ] Serialization is defensive: `undefined` cause, non-array `.errors`, and missing `code`/`address`/`port` do not throw while logging.
- [ ] Notification behavior is unchanged — the method still returns the existing `TELEGRAM_NOTIFICATION_ERROR` failure result; no connectivity fix is introduced.
- [ ] Unit tests (first coverage for `Logger`) cover: cause is a plain `Error`; cause is an `AggregateError` with populated `.errors[]` (codes/addresses asserted present); cause is `undefined`; `.errors` missing/non-array. Tests use `node:test` + `node:assert/strict`, run via `npm test`.

## Blocked by

None - can start immediately.
