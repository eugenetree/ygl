import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Failure, Result } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";
import { YoutubeApiGetChannelVideoEntries } from "./yt-api-get-channel-video-entries.js";
import { YtDlpClient, YtDlpError } from "./yt-dlp-client.js";

const channelId = "UCv368NU4ZOCTst8WCXHOkdA";

// ── Mock client ───────────────────────────────────────────────────────────────

/** Emulates yt-dlp exiting non-zero with the given stderr before any entry. */
class FailingYtDlpClient {
  constructor(private readonly stderr: string) {}

  async *execJsonStream<T>(
    _args: string[],
  ): AsyncGenerator<Result<T, YtDlpError>, void, undefined> {
    yield Failure({ type: "YT_DLP_ERROR", message: this.stderr });
  }
}

function buildSut(stderr: string) {
  const logger = new Logger({ context: "test", category: "test" });
  return new YoutubeApiGetChannelVideoEntries(
    logger,
    new FailingYtDlpClient(stderr) as unknown as YtDlpClient,
  );
}

async function firstYield(sut: YoutubeApiGetChannelVideoEntries) {
  const next = await sut.getChannelVideoEntries({ channelId }).next();
  assert.equal(next.done, false);
  return next.value;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("YoutubeApiGetChannelVideoEntries.getChannelVideoEntries()", () => {
  it("yields CHANNEL_NO_VIDEOS_TAB when yt-dlp reports the channel has no videos tab", async () => {
    const sut = buildSut(
      `ERROR: [youtube:tab] ${channelId}: This channel does not have a videos tab\n`,
    );

    const result = await firstYield(sut);

    assert.deepEqual(
      result,
      Failure({ type: "CHANNEL_NO_VIDEOS_TAB", channelId }),
    );
  });

  it("yields CHANNEL_NOT_FOUND when yt-dlp reports the channel does not exist", async () => {
    const sut = buildSut(
      `ERROR: [youtube:tab] ${channelId}: This channel does not exist.\n`,
    );

    const result = await firstYield(sut);

    assert.deepEqual(result, Failure({ type: "CHANNEL_NOT_FOUND", channelId }));
  });

  it("passes an unrecognized yt-dlp error through unchanged", async () => {
    const stderr = "ERROR: Unable to download webpage: HTTP Error 429\n";
    const sut = buildSut(stderr);

    const result = await firstYield(sut);

    assert.deepEqual(
      result,
      Failure({ type: "YT_DLP_ERROR", message: stderr }),
    );
  });
});
