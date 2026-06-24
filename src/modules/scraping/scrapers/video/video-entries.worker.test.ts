import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { Failure, Success } from "../../../../types/index.js";
import { Logger } from "../../../_common/logger/logger.js";
import { WorkerStopCause } from "../../constants.js";
import { ProcessVideoEntryUseCase } from "./use-cases/process-video-entry/process-video-entry.use-case.js";
import { VideoEntriesQueue } from "./video-entries.queue.js";
import { VideoEntriesWorker } from "./video-entries.worker.js";

// ---- Fixtures ---------------------------------------------------------------

const entry = {
  id: "video-1",
  channelId: "channel-1",
  availability: "PUBLIC" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMocks() {
  return {
    logger: {
      child: mock.fn<Logger["child"]>(),
      setContext: mock.fn<Logger["setContext"]>(),
      info: mock.fn<Logger["info"]>(),
      error: mock.fn<Logger["error"]>(),
      warn: mock.fn<Logger["warn"]>(),
    },
    processVideoEntry: {
      execute: mock.fn<ProcessVideoEntryUseCase["execute"]>(),
    },
    videoEntriesQueue: {
      getNextEntry: mock.fn<VideoEntriesQueue["getNextEntry"]>(),
      markAsSuccess: mock.fn<VideoEntriesQueue["markAsSuccess"]>(),
      markAsFailed: mock.fn<VideoEntriesQueue["markAsFailed"]>(),
      markAsSkipped: mock.fn<VideoEntriesQueue["markAsSkipped"]>(),
    },
  };
}

function buildSut(mocks: ReturnType<typeof createMocks>) {
  mocks.logger.child.mock.mockImplementation(
    () => mocks.logger as unknown as Logger,
  );

  return new VideoEntriesWorker(
    mocks.logger as unknown as Logger,
    mocks.processVideoEntry as unknown as ProcessVideoEntryUseCase,
    mocks.videoEntriesQueue as unknown as VideoEntriesQueue,
  );
}

// ---- Tests ------------------------------------------------------------------

describe("VideoEntriesWorker", () => {
  let mocks: ReturnType<typeof createMocks>;
  let sut: VideoEntriesWorker;

  beforeEach(() => {
    mocks = createMocks();
    sut = buildSut(mocks);

    mocks.videoEntriesQueue.markAsSkipped.mock.mockImplementation(() =>
      Promise.resolve(Success(undefined)),
    );
    mocks.videoEntriesQueue.markAsFailed.mock.mockImplementation(() =>
      Promise.resolve(Success(undefined)),
    );
  });

  it("marks the job SKIPPED with REMOVED_BY_UPLOADER and continues when the video was removed by its uploader", async () => {
    let calls = 0;
    mocks.videoEntriesQueue.getNextEntry.mock.mockImplementation(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve(Success(entry));
      return Promise.resolve(Success(null));
    });
    mocks.processVideoEntry.execute.mock.mockImplementation(() =>
      Promise.resolve(
        Failure({
          type: "REMOVED_BY_UPLOADER_VIDEO",
          message: "This video has been removed by the uploader",
        }),
      ),
    );

    const result = await sut.run({
      shouldContinue: () => true,
      onError: async () => {},
    });

    assert.ok(result.ok);
    assert.equal(result.value, WorkerStopCause.EMPTY);
    assert.equal(mocks.videoEntriesQueue.markAsSkipped.mock.callCount(), 1);
    assert.deepEqual(
      mocks.videoEntriesQueue.markAsSkipped.mock.calls[0]?.arguments,
      [entry.id, "REMOVED_BY_UPLOADER"],
    );
    assert.equal(mocks.videoEntriesQueue.markAsFailed.mock.callCount(), 0);
  });

  it("marks the job FAILED and stops the loop for an unrecognized yt-dlp error", async () => {
    mocks.videoEntriesQueue.getNextEntry.mock.mockImplementation(() =>
      Promise.resolve(Success(entry)),
    );
    mocks.processVideoEntry.execute.mock.mockImplementation(() =>
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
    assert.equal(mocks.videoEntriesQueue.markAsFailed.mock.callCount(), 1);
    assert.equal(mocks.videoEntriesQueue.markAsSkipped.mock.callCount(), 0);
    assert.equal(onError.mock.callCount(), 1);
  });
});
