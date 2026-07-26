import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { Logger } from "./logger.js";

// ---- Helpers ----------------------------------------------------------------

/**
 * Captures the string passed to `console.error` by `Logger.error()` so we can
 * assert on the serialized output without reading log files off disk.
 */
function captureError(run: (logger: Logger) => void): string {
  const spy = mock.method(console, "error", () => {});
  const logger = new Logger({ context: "test", category: "test" });
  run(logger);
  const calls = spy.mock.calls;
  assert.equal(calls.length, 1, "expected exactly one console.error call");
  return String(calls[0]!.arguments[0]);
}

// ---- Tests ------------------------------------------------------------------

describe("Logger.error cause serialization", () => {
  beforeEach(() => {
    mock.reset();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("serializes a plain Error cause with its name and message", () => {
    const output = captureError((logger) => {
      logger.error({
        error: new Error("outer", { cause: new Error("inner boom") }),
      });
    });

    assert.match(output, /cause: Error: inner boom/);
    assert.doesNotMatch(output, /\[object Object\]/);
  });

  it("serializes an AggregateError cause including each inner code/address/port", () => {
    const inner1 = Object.assign(new Error("connect ENETUNREACH"), {
      code: "ENETUNREACH",
      errno: -101,
      syscall: "connect",
      address: "149.154.167.220",
      port: 443,
    });
    const inner2 = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
      code: "ENOTFOUND",
      syscall: "getaddrinfo",
    });
    const cause = new AggregateError([inner1, inner2], "all attempts failed");
    const output = captureError((logger) => {
      logger.error({ error: new Error("fetch failed", { cause }) });
    });

    // Not the bare class name.
    assert.doesNotMatch(output, /cause: AggregateError\n?$/);
    assert.match(output, /ENETUNREACH/);
    assert.match(output, /address=149\.154\.167\.220/);
    assert.match(output, /port=443/);
    assert.match(output, /ENOTFOUND/);
  });

  it("logs arbitrary own-enumerable props on inner errors, not just network fields", () => {
    const inner = Object.assign(new Error("upstream rejected"), {
      statusCode: 503,
      hostname: "api.example.com",
    });
    const cause = new AggregateError([inner], "all failed");
    const output = captureError((logger) => {
      logger.error({ error: new Error("outer", { cause }) });
    });

    assert.match(output, /statusCode=503/);
    assert.match(output, /hostname=api\.example\.com/);
  });

  it("does not throw when cause is undefined", () => {
    const output = captureError((logger) => {
      logger.error({ error: new Error("no cause here") });
    });

    assert.match(output, /cause: undefined/);
  });

  it("does not throw when an AggregateError-like cause has a non-array .errors", () => {
    const cause = Object.assign(new Error("weird cause"), {
      errors: "not-an-array",
    });
    const output = captureError((logger) => {
      logger.error({ error: new Error("outer", { cause }) });
    });

    assert.match(output, /cause: Error: weird cause/);
    // Non-array errors are ignored rather than expanded.
    assert.doesNotMatch(output, /errors:/);
  });

  it("does not throw when inner errors are missing code/address/port", () => {
    const cause = new AggregateError([new Error("bare inner")], "aggregate");
    const output = captureError((logger) => {
      logger.error({ error: new Error("outer", { cause }) });
    });

    assert.match(output, /bare inner/);
  });
});
