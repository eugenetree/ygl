import { after, beforeEach } from "node:test";
import { Client } from "@elastic/elasticsearch";
import type { CaptionRow } from "../../../db/types.js";
import type { Logger } from "../../_common/logger/logger.js";
import { createLoggerMock } from "../../_common/logger/testing/logger-mock.js";
import { toSearchIndexDocument } from "../search-index-document.js";
import { SearchIndexes } from "../search-indexes.js";

// Test files run in child processes of the test runner, so global setup hands
// them the node through the environment they inherit.
const ENV_VAR = "TEST_ELASTICSEARCH";

export function publishTestElasticsearch(node: string): void {
  process.env[ENV_VAR] = node;
}

function readTestElasticsearch(): string {
  const node = process.env[ENV_VAR];
  if (!node) {
    throw new Error(
      `${ENV_VAR} is not set. Elasticsearch tests need the container from ` +
        "--test-global-setup=src/modules/captions-search/testing/elasticsearch-global-setup.mjs, " +
        "which npm run test:es passes.",
    );
  }
  return node;
}

export type CaptionFixture = Pick<
  CaptionRow,
  "id" | "videoId" | "startTime" | "endTime" | "text"
> & { channelId: string };

export type TestSearchIndex = {
  client: Client;
  /** Writes captions as the sync does, and makes them searchable. */
  writeCaptions(captions: CaptionFixture[]): Promise<void>;
};

/**
 * Call at the top of a test file or `describe`. Before each test, the search
 * index is an empty index created the way the rebuild creates one.
 */
export function useTestSearchIndex(): TestSearchIndex {
  const client = new Client({ node: readTestElasticsearch() });
  const searchIndexes = new SearchIndexes(
    createLoggerMock() as unknown as Logger,
    client,
  );
  let index: string | undefined;

  beforeEach(async () => {
    const { live, others } = await searchIndexes.state();
    for (const name of [...(live ? [live] : []), ...others]) {
      await searchIndexes.delete(name);
    }
    index = await searchIndexes.createDated(new Date());
    await searchIndexes.makeLive(index, null);
  });

  after(async () => {
    await client.close();
  });

  return {
    client,
    async writeCaptions(captions) {
      if (!index) throw new Error("writeCaptions runs inside a test");
      await searchIndexes.write(
        index,
        captions.map((caption) =>
          toSearchIndexDocument(caption, caption.channelId),
        ),
      );
      await searchIndexes.refresh(index);
    },
  };
}
