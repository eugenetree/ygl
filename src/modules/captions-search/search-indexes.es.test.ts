import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import type { SearchIndexDocument } from "./search-index-document.js";
import { SEARCH_INDEX, SearchIndexes } from "./search-indexes.js";
import { useTestSearchIndex } from "./testing/test-elasticsearch.js";

describe("SearchIndexes.write against Elasticsearch", () => {
  const searchIndex = useTestSearchIndex();
  const buildSut = () =>
    new SearchIndexes(
      createLoggerMock() as unknown as Logger,
      searchIndex.client,
    );

  it("rejects a document with a field the search index doesn't map", async () => {
    const document = {
      id: "caption-1",
      videoId: "dQw4w9WgXcQ",
      channelId: "UC-rick",
      startTime: 2500,
      endTime: 4200,
      text: "never gonna give you up",
      wordCount: 5,
      startsSentence: false,
      endsSentence: false,
      channelSearchScore: 0.87,
    } as SearchIndexDocument;

    await assert.rejects(buildSut().write(SEARCH_INDEX, [document]), {
      message: /rejected document caption-1 .*strict_dynamic_mapping_exception/,
    });
  });
});
