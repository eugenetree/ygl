import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import { CaptionsService } from "./captions.service.js";
import { useTestSearchIndex } from "./testing/test-elasticsearch.js";

describe("CaptionsService.findByVideo against Elasticsearch", () => {
  const searchIndex = useTestSearchIndex();
  const buildSut = () =>
    new CaptionsService(
      createLoggerMock() as unknown as Logger,
      searchIndex.client,
    );

  it("returns the video's captions in the order they are spoken, and none of other videos'", async () => {
    await searchIndex.writeCaptions([
      {
        id: "caption-3",
        videoId: "dQw4w9WgXcQ",
        channelId: "UC-rick",
        startTime: 6100,
        endTime: 8000,
        text: "never gonna run around",
      },
      {
        id: "caption-1",
        videoId: "dQw4w9WgXcQ",
        channelId: "UC-rick",
        startTime: 2500,
        endTime: 4200,
        text: "never gonna give you up",
      },
      {
        id: "caption-other",
        videoId: "9bZkp7q19f0",
        channelId: "UC-psy",
        startTime: 3000,
        endTime: 5000,
        text: "oppan gangnam style",
      },
      {
        id: "caption-2",
        videoId: "dQw4w9WgXcQ",
        channelId: "UC-rick",
        startTime: 4200,
        endTime: 6100,
        text: "never gonna let you down",
      },
    ]);

    const result = await buildSut().findByVideo("dQw4w9WgXcQ");

    assert.deepEqual(result, {
      ok: true,
      value: [
        {
          captionId: "caption-1",
          startTime: 2500,
          endTime: 4200,
          text: "never gonna give you up",
        },
        {
          captionId: "caption-2",
          startTime: 4200,
          endTime: 6100,
          text: "never gonna let you down",
        },
        {
          captionId: "caption-3",
          startTime: 6100,
          endTime: 8000,
          text: "never gonna run around",
        },
      ],
    });
  });
});
