import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { Failure, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { WorkerStopCause } from "../../constants.js";
import { ChannelsQueue } from "./channels.queue.js";
import { ChannelsWorker } from "./channels.worker.js";
import { FindChannelVideosUseCase } from "./use-cases/find-channel-videos.use-case.js";

// ---- Fixtures ---------------------------------------------------------------

const channel = { id: "UCv368NU4ZOCTst8WCXHOkdA" };

function createMocks() {
  return {
    logger: {
      child: mock.fn<Logger["child"]>(),
      setContext: mock.fn<Logger["setContext"]>(),
      info: mock.fn<Logger["info"]>(),
      error: mock.fn<Logger["error"]>(),
      warn: mock.fn<Logger["warn"]>(),
    },
    findChannelVideos: {
      execute: mock.fn<FindChannelVideosUseCase["execute"]>(),
    },
    channelsQueue: {
      getNextChannel: mock.fn<ChannelsQueue["getNextChannel"]>(),
      markAsSuccess: mock.fn<ChannelsQueue["markAsSuccess"]>(),
      markAsFailed: mock.fn<ChannelsQueue["markAsFailed"]>(),
      markAsSkipped: mock.fn<ChannelsQueue["markAsSkipped"]>(),
    },
  };
}

function buildSut(mocks: ReturnType<typeof createMocks>) {
  mocks.logger.child.mock.mockImplementation(
    () => mocks.logger as unknown as Logger,
  );

  return new ChannelsWorker(
    mocks.logger as unknown as Logger,
    mocks.findChannelVideos as unknown as FindChannelVideosUseCase,
    mocks.channelsQueue as unknown as ChannelsQueue,
  );
}

/** Yields the channel once, then reports an empty queue. */
function queueWithOneChannel(mocks: ReturnType<typeof createMocks>) {
  let calls = 0;
  mocks.channelsQueue.getNextChannel.mock.mockImplementation(() => {
    calls += 1;
    if (calls === 1) return Promise.resolve(Success(channel));
    return Promise.resolve(Success(null));
  });
}

// ---- Tests ------------------------------------------------------------------

describe("ChannelsWorker", () => {
  let mocks: ReturnType<typeof createMocks>;
  let sut: ChannelsWorker;

  beforeEach(() => {
    mocks = createMocks();
    sut = buildSut(mocks);

    mocks.channelsQueue.markAsSkipped.mock.mockImplementation(() =>
      Promise.resolve(Success(undefined)),
    );
    mocks.channelsQueue.markAsFailed.mock.mockImplementation(() =>
      Promise.resolve(Success(undefined)),
    );
  });

  it("marks the job SKIPPED with NO_VIDEOS_TAB and continues when the channel has no videos tab", async () => {
    queueWithOneChannel(mocks);
    mocks.findChannelVideos.execute.mock.mockImplementation(() =>
      Promise.resolve(
        Failure({ type: "CHANNEL_NO_VIDEOS_TAB", channelId: channel.id }),
      ),
    );

    const result = await sut.run({
      shouldContinue: () => true,
      onError: async () => {},
    });

    assert.ok(result.ok);
    assert.equal(result.value, WorkerStopCause.EMPTY);
    assert.equal(mocks.channelsQueue.markAsSkipped.mock.callCount(), 1);
    assert.deepEqual(
      mocks.channelsQueue.markAsSkipped.mock.calls[0]?.arguments,
      [channel.id, "NO_VIDEOS_TAB"],
    );
    assert.equal(mocks.channelsQueue.markAsFailed.mock.callCount(), 0);
  });

  it("marks the job SKIPPED with CHANNEL_NOT_FOUND and continues when the channel does not exist", async () => {
    queueWithOneChannel(mocks);
    mocks.findChannelVideos.execute.mock.mockImplementation(() =>
      Promise.resolve(
        Failure({ type: "CHANNEL_NOT_FOUND", channelId: channel.id }),
      ),
    );

    const result = await sut.run({
      shouldContinue: () => true,
      onError: async () => {},
    });

    assert.ok(result.ok);
    assert.equal(result.value, WorkerStopCause.EMPTY);
    assert.deepEqual(
      mocks.channelsQueue.markAsSkipped.mock.calls[0]?.arguments,
      [channel.id, "CHANNEL_NOT_FOUND"],
    );
    assert.equal(mocks.channelsQueue.markAsFailed.mock.callCount(), 0);
  });

  it("marks the job FAILED and stops the loop for an unrecognized yt-dlp error", async () => {
    mocks.channelsQueue.getNextChannel.mock.mockImplementation(() =>
      Promise.resolve(Success(channel)),
    );
    mocks.findChannelVideos.execute.mock.mockImplementation(() =>
      Promise.resolve(
        Failure({ type: "YT_DLP_ERROR", message: "something unexpected" }),
      ),
    );

    const onError = mock.fn<(error: unknown) => Promise<void>>();
    const result = await sut.run({
      shouldContinue: () => true,
      onError,
    });

    assert.equal(result.ok, false);
    assert.equal(mocks.channelsQueue.markAsFailed.mock.callCount(), 1);
    assert.equal(mocks.channelsQueue.markAsSkipped.mock.callCount(), 0);
    assert.equal(onError.mock.callCount(), 1);
  });
});
