# PRD: Diagnosable Telegram notification failures (surface AggregateError causes)

## Problem Statement

The scraper stopped delivering its Telegram notifications. Concretely, the "Scraper
container country: <X>" startup message that operators used to receive on every boot
is no longer arriving, and any operational alert sent through `TelegramNotifier`
(scraper failures, etc.) is silently dropped.

The only signal we get is an opaque error in the scraper logs:

```
[main-scraper:telegram-notifier]
Failed to send Telegram message
stack: TypeError: fetch failed
    at node:internal/deps/undici/undici:15141:13
    ...
    at async TelegramNotifier.sendMessage (.../telegram-notifier.js:30:30)
cause: AggregateError
```

`TypeError: fetch failed` is Node/undici's generic wrapper for *any* network-layer
failure. The actual reason — DNS failure, an unroutable address, a refused
connection, a timeout, a blocked exit IP — is nested inside `error.cause`
(an `AggregateError` whose `.errors[]` array holds the real OS-level errors, each
with a `code`, `address`, and `port`). None of that reaches the logs today, so an
operator sees "AggregateError" and cannot tell *why* Telegram is unreachable.

There are two reasons the real cause is invisible:

1. `TelegramNotifier.sendMessage()` catches the error and passes it straight to the
   logger without unwrapping the nested `AggregateError`.
2. The shared `Logger.error()` stringifies the cause with template interpolation
   (`` `cause: ${error.cause}` ``), which renders an `AggregateError` as the literal
   string `"AggregateError"` and discards its `.errors[]` array entirely.

Until we can see the underlying error code, we're guessing at the fix. This PRD makes
the failure **diagnosable** — it does not attempt to fix connectivity.

## Solution

When a Telegram send fails at the network layer, the logs should show the real,
underlying cause(s): the error code(s) (e.g. `ENETUNREACH`, `ENOTFOUND`,
`ECONNREFUSED`, `ETIMEDOUT`), and where available the target address and port that
each connection attempt failed against.

From the operator's perspective: the next time a Telegram notification fails, the log
line tells them *what actually went wrong at the network level*, so the follow-up fix
can be chosen against evidence rather than a hypothesis.

The connectivity fix itself is intentionally deferred to a **follow-up PRD**, gated on
what these improved logs reveal on the next real failure.

## User Stories

1. As a scraper operator, I want a failed Telegram send to log the underlying network
   error code (not just "AggregateError"), so that I can tell at a glance whether the
   problem is DNS resolution, an unroutable route, a refused connection, or a timeout.
2. As a scraper operator, I want each failed connection attempt's target address and
   port surfaced when available, so that I can see *which* address family / endpoint
   the failure occurred against.
3. As a developer diagnosing this incident, I want the nested `AggregateError.errors[]`
   array fully serialized in the log, so that I don't have to reproduce the failure
   locally with a debugger attached to find out what undici was actually complaining
   about.
4. As a developer, I want the fix to improve error *observability* generally — not
   just paper over this one call site — so that the next opaque `fetch failed` from
   any code path is also legible.
5. As an operator, I want to keep receiving (or reliably see the failure of) the
   "Scraper container country" startup message, so that I know whether the scraper's
   egress is coming out of the expected region.
6. As a developer, I do NOT want a connectivity fix shipped in this change, so that we
   don't lock in a fix (e.g. forcing IPv4) before the logs confirm the root cause.
7. As a future maintainer, I want the leading root-cause hypothesis recorded alongside
   this change, so that when the improved logs land I can immediately confirm or reject
   it instead of re-deriving the theory.

## Implementation Decisions

- **Two candidate change sites**, at least one of which must change:
  - `Logger.error()` (`src/modules/_common/logger/logger.ts`): today it does
    `` log += `\ncause: ${error.cause}` ``. This is the general bug — any `cause`
    that is an `Error`/`AggregateError` loses its structure. The preferred fix
    recursively serializes `error.cause`, and when the cause is an `AggregateError`,
    serializes its `.errors[]` array (each entry's `name`, `message`, and any
    `code`/`errno`/`address`/`port`/`syscall` own-properties). This fixes the
    opacity for *every* caller, not just Telegram.
  - `TelegramNotifier.sendMessage()` (`src/modules/telegram/telegram-notifier.ts`):
    optionally build a richer `context` object (unwrapping `error.cause` /
    `cause.errors`) before handing it to the logger, if we want the notifier to be
    explicit about what it captures regardless of logger behavior.
- **Preferred approach**: fix the `Logger` so the improvement is codebase-wide, since
  `main-scraper.ts`'s `fetchScraperCountry()` uses the same raw `fetch` and would
  benefit identically. The notifier-level change is secondary/optional.
- **No behavioral change** to notification flow: a failed send still returns the
  existing `TELEGRAM_NOTIFICATION_ERROR` `Failure` result and does not throw or halt
  the scraper. Only what gets *logged* changes.
- **Serialization must be defensive**: `AggregateError.errors` may be absent or not an
  array; `code`/`address`/`port` may be undefined; the cause may be a plain value
  rather than an `Error`. The serializer must not throw while logging an error.
- **Leading hypothesis (recorded, not fixed here)**: `api.telegram.org` publishes an
  IPv6 `AAAA` record (`2001:67c:4e8:f004::9`) whereas `ipinfo.io` (used by the country
  fetch, which *succeeds*) is IPv4-only. The scraper runs behind an IPv4-only OpenVPN
  tunnel (`tun0`). The theory is that Node's `fetch` attempts the IPv6 address, which
  is unroutable through the tunnel, producing the `AggregateError`. If correct, the
  improved logs should show an `ENETUNREACH`/`EHOSTUNREACH` (or similar) against the
  `2001:67c:...` address. This PRD ships only the logging that would confirm it.
- **No ADR** — this is a small, low-risk observability change with no architectural
  trade-off.

## Testing Decisions

- Good tests here assert observable output: given an `Error` whose `cause` is an
  `AggregateError` carrying inner errors with `code`/`address`/`port`, the produced log
  string contains those codes/addresses — not the literal `"AggregateError"`. Tests
  should not assert on internal formatting minutiae beyond "the codes are present".
- **Module under test**: `Logger.error()` — it is a deep-ish, isolatable unit (input:
  an error object; output: a log string). To make it testable, the string-building may
  need to be separable from the `console.error` / `fs.appendFileSync` side effects
  (e.g. a private `format`/`serialize` helper, or asserting via a captured
  `console.error`). Prefer asserting on the built string over asserting file writes.
- Cases to cover: (a) `error.cause` is a plain `Error` (message/stack surfaced);
  (b) `error.cause` is an `AggregateError` with a populated `.errors[]` (each inner
  code/address surfaced); (c) `error.cause` is `undefined` (no crash, graceful output);
  (d) `error.cause.errors` is missing/non-array (no crash).
- **Prior art**: follow the repo's existing test convention — plain `node:test`
  (`describe`/`it`/`beforeEach`/`mock`) with `node:assert/strict`, run via
  `npm test` (`node --test --import tsx "src/**/*.test.ts"`). No new tooling.
- The `Logger` currently has no test coverage; this would be its first.

## Out of Scope

- **Any connectivity fix.** Forcing IPv4 (via `NODE_OPTIONS=--dns-result-order=ipv4first`
  or a global undici `Agent({ connect: { family: 4 } })`), changing the VPN routing,
  switching Telegram transport, or routing Telegram off-tunnel are all explicitly
  deferred to a follow-up PRD gated on the diagnostic output this change produces.
- Retry/backoff for failed Telegram sends.
- Migrating `TelegramNotifier`/`fetchScraperCountry` off raw `fetch` onto the shared
  axios-based `HttpClient`.
- The separate, unrelated `yt-dlp version: unknown` bug (its own PRD).
- Changing notification content, formatting, or which events trigger notifications.

## Further Notes

This PRD originated from a production log where the scraper's boot-time "Scraper
container country" Telegram message silently stopped arriving after the scraper was
moved behind the OpenVPN tunnel (multi-instance scraper work). The failure surfaces
only as `TypeError: fetch failed` / `cause: AggregateError`, which is uninformative.
Rather than commit to the (well-supported but unconfirmed-from-inside-the-container)
IPv6-behind-IPv4-VPN theory, this change first makes the failure legible; the actual
fix is chosen once the improved logs confirm the underlying error code.
