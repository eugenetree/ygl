import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Logger } from "../_common/logger/logger.js";
import { YtDlpClient } from "./yt-dlp-client.js";

const testLogger = () => new Logger({ context: "test", category: "test" });

describe("YtDlpClient (real binary)", () => {
  it("surfaces yt-dlp's full stderr when the binary exits non-zero", async () => {
    // No runner injected: goes through ytdlp-nodejs, which rejects with only
    // the first `ERROR:` line — a usage error has none, so without stderr
    // capture the failure would read "Unknown yt-dlp error". No network.
    const client = new YtDlpClient(testLogger());

    const result = await client.exec([
      "https://youtube.com/watch?v=abc",
      "--this-flag-does-not-exist",
    ]);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.type, "YT_DLP_ERROR");
    assert.match(
      result.error.message,
      /no such option: --this-flag-does-not-exist/,
    );
  });
});

describe("YtDlpClient.getVersion()", () => {
  it("resolves the real yt-dlp version by invoking the binary", async () => {
    const client = new YtDlpClient(testLogger());

    const version = await client.getVersion();

    assert.ok(version, "expected a version string, got undefined");
    assert.match(version, /^\d{4}\.\d{2}\.\d{2}/);
  });
});
