import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import { SearchIndexes } from "./search-indexes.js";
import { FakeElasticsearch } from "./testing/fake-elasticsearch.js";

// ---- Factory ----------------------------------------------------------------

function buildSut(elasticsearch: FakeElasticsearch) {
  return new SearchIndexes(
    createLoggerMock() as unknown as Logger,
    elasticsearch.asClient(),
  );
}

async function pointSearchIndexAt(
  elasticsearch: FakeElasticsearch,
  index: string,
) {
  await elasticsearch.client.indices.updateAliases({
    actions: [{ add: { index, alias: "captions" } }],
  });
}

const documents = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `caption-${i}` }));

// ---- Tests ------------------------------------------------------------------

describe("SearchIndexes.rebuildProgress()", () => {
  it("reports the index being built against the live index's size", async () => {
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions-20260101t000000000z", documents(3));
    elasticsearch.createIndex("captions-20260201t000000000z", documents(1));
    await pointSearchIndexAt(elasticsearch, "captions-20260101t000000000z");

    const result = await buildSut(elasticsearch).rebuildProgress();

    assert.deepEqual(result, { ok: true, value: { indexed: 1, liveSize: 3 } });
  });

  it("reports the index being built against the index named like the search index, the first time", async () => {
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions", documents(3));
    elasticsearch.createIndex("captions-20260201t000000000z", documents(1));

    const result = await buildSut(elasticsearch).rebuildProgress();

    assert.deepEqual(result, { ok: true, value: { indexed: 1, liveSize: 3 } });
  });

  it("reports no index being built once the new one is live, while the old one awaits deletion", async () => {
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions-20260101t000000000z", documents(3));
    elasticsearch.createIndex("captions-20260201t000000000z", documents(1));
    await pointSearchIndexAt(elasticsearch, "captions-20260201t000000000z");

    const result = await buildSut(elasticsearch).rebuildProgress();

    assert.deepEqual(result, { ok: true, value: null });
  });
});
