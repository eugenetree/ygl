import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Logger } from "../_common/logger/logger.js";
import { YtDlpClient } from "./yt-dlp-client.js";

const testLogger = () => new Logger({ context: "test", category: "test" });

describe("YtDlpClient (real binary)", () => {
  it("surfaces yt-dlp's full stderr when the binary exits non-zero", async () => {
    // No spawn injected: runs the yt-dlp on PATH. A usage error has no
    // `ERROR:` line, so this checks stderr is read in full. No network.
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
