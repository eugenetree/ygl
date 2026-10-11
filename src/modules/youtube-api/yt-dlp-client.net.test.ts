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

  it("finds out that an owner disabled playback on other websites", async () => {
    // GOBE0yqiMHo can be watched on YouTube but not embedded. Prod passes
    // cookies, which make yt-dlp try these clients; only web_embedded gets
    // formats there, so it fails with a bare "Video unavailable".
    const client = new YtDlpClient(testLogger());

    const result = await client.execJson(
      [
        "https://youtube.com/watch?v=GOBE0yqiMHo",
        "--dump-json",
        "--skip-download",
        "--extractor-args",
        "youtube:player_client=web_embedded,tv_downgraded,web",
      ],
      { diagnoseUnavailable: true },
    );

    assert.equal(
      result.ok ? undefined : result.error.type,
      "EMBEDDING_DISABLED_VIDEO",
    );
  });
});
