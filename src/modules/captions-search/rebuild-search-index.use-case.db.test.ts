import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sql } from "kysely";
import type { DatabaseClient } from "../../db/client.js";
import { useTestDatabase } from "../../db/testing/test-database.js";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import { ElasticCaptionsSyncRepository } from "./elastic-captions-sync.repository.js";
import { RebuildSearchIndexUseCase } from "./rebuild-search-index.use-case.js";
import { SearchIndexes } from "./search-indexes.js";
import {
  ids,
  seedCaption,
  seedChannel,
  seedVideo,
  uuid,
} from "./testing/captions-to-index.js";
import { FakeElasticsearch } from "./testing/fake-elasticsearch.js";

// ---- SUT factory ------------------------------------------------------------

function buildSut(db: DatabaseClient, elasticsearch: FakeElasticsearch) {
  const logger = createLoggerMock() as unknown as Logger;
  return new RebuildSearchIndexUseCase(
    new ElasticCaptionsSyncRepository(db),
    new SearchIndexes(logger, elasticsearch.asClient()),
    logger,
    { oldIndexGraceMs: 0 },
  );
}

// ---- Tests ------------------------------------------------------------------

describe("RebuildSearchIndexUseCase", () => {
  const db = useTestDatabase();

  it("indexes only the manual captions of searchable videos, dropping the rest", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedVideo(db, {
      id: "lowsimilary",
      channelId: "UC-rick",
      captionsSimilarityScore: 0.5,
    });
    await seedVideo(db, {
      id: "nomanualcap",
      channelId: "UC-rick",
      manualCaptionsStatus: "CAPTIONS_ABSENT",
    });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    await seedCaption(db, { id: uuid(2), videoId: "searchable1" });
    await seedCaption(db, {
      id: uuid(3),
      videoId: "searchable1",
      type: "auto",
    });
    await seedCaption(db, { id: uuid(4), videoId: "lowsimilary" });
    await seedCaption(db, { id: uuid(5), videoId: "nomanualcap" });
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions", [{ id: uuid(4) }]);

    const result = await buildSut(db, elasticsearch).execute();

    assert.deepEqual(ids(elasticsearch.documents("captions")), [
      uuid(1),
      uuid(2),
    ]);
    assert.deepEqual(result, {
      ok: true,
      value: { indexed: 2, oldIndexSize: 1, newIndexSize: 2 },
    });
  });

  it("writes each caption with its features and its video's channel", async () => {
    await seedChannel(db, "UC-rick");
    await seedChannel(db, "UC-tame");
    await seedVideo(db, { id: "rickroll001", channelId: "UC-rick" });
    await seedVideo(db, { id: "letitallhap", channelId: "UC-tame" });
    await seedCaption(db, {
      id: uuid(1),
      videoId: "rickroll001",
      text: "Never gonna give you up.",
    });
    await seedCaption(db, {
      id: uuid(2),
      videoId: "letitallhap",
      text: "let it happen",
    });
    const elasticsearch = new FakeElasticsearch();

    await buildSut(db, elasticsearch).execute();

    assert.deepEqual(elasticsearch.documents("captions"), [
      {
        id: uuid(1),
        videoId: "rickroll001",
        channelId: "UC-rick",
        startTime: 2500,
        endTime: 4200,
        text: "Never gonna give you up.",
        wordCount: 5,
        startsSentence: true,
        endsSentence: true,
      },
      {
        id: uuid(2),
        videoId: "letitallhap",
        channelId: "UC-tame",
        startTime: 2500,
        endTime: 4200,
        text: "let it happen",
        wordCount: 3,
        startsSentence: false,
        endsSentence: false,
      },
    ]);
  });

  it("creates the new index with one shard, no replicas and a strict mapping of the document", async () => {
    const elasticsearch = new FakeElasticsearch();

    await buildSut(db, elasticsearch).execute();

    const live = elasticsearch.aliasTarget("captions") ?? "";
    assert.deepEqual(elasticsearch.createdWith(live), {
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      mappings: {
        dynamic: "strict",
        properties: {
          id: { type: "keyword" },
          videoId: { type: "keyword" },
          channelId: { type: "keyword" },
          startTime: { type: "long" },
          endTime: { type: "long" },
          text: { type: "text", analyzer: "standard", norms: false },
          wordCount: { type: "short" },
          startsSentence: { type: "boolean" },
          endsSentence: { type: "boolean" },
        },
      },
    });
  });

  it("points the search index at a new dated index, deleting the index named like it", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions", [{ id: uuid(1) }]);

    await buildSut(db, elasticsearch).execute();

    const live = elasticsearch.aliasTarget("captions");
    assert.match(live ?? "", /^captions-\d{8}t\d{9}z$/);
    assert.deepEqual(elasticsearch.indexNames(), [live]);
  });

  it("moves the search index to a newer index and deletes the one it pointed at", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    const elasticsearch = new FakeElasticsearch();
    const sut = buildSut(db, elasticsearch);
    await sut.execute();
    const previous = elasticsearch.aliasTarget("captions");

    await sut.execute();

    const live = elasticsearch.aliasTarget("captions");
    assert.notEqual(live, previous);
    assert.deepEqual(elasticsearch.indexNames(), [live]);
    assert.deepEqual(ids(elasticsearch.documents("captions")), [uuid(1)]);
  });

  it("deletes an index left half-built by an earlier failed rebuild", async () => {
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions-20260101t000000000z", [
      { id: uuid(9) },
    ]);
    elasticsearch.createIndex("captions-20260102t000000000z", []);
    elasticsearch.createIndex("captions-20260103t000000000z", [
      { id: uuid(8) },
    ]);
    await elasticsearch.client.indices.updateAliases({
      actions: [
        { add: { index: "captions-20260102t000000000z", alias: "captions" } },
      ],
    });

    await buildSut(db, elasticsearch).execute();

    assert.deepEqual(elasticsearch.indexNames(), [
      elasticsearch.aliasTarget("captions"),
    ]);
  });

  it("records the newest caption at its start as synced, so the incremental sync picks up the rest", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedVideo(db, {
      id: "lowsimilary",
      channelId: "UC-rick",
      captionsSimilarityScore: 0.5,
    });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    await seedCaption(db, { id: uuid(2), videoId: "lowsimilary" });
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.beforeEachWrite = async () => {
      await seedCaption(db, { id: uuid(3), videoId: "searchable1" });
    };
    const repository = new ElasticCaptionsSyncRepository(db);

    await buildSut(db, elasticsearch).execute();

    const lastSync = await repository.getLastSuccessfulSync();
    assert.ok(lastSync.ok);
    assert.equal(lastSync.value?.latestSyncedCaptionId, uuid(2));
  });

  it("leaves the index searches run against as it was when a write fails", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions", [{ id: uuid(7) }]);
    elasticsearch.failWrites();

    const result = await buildSut(db, elasticsearch).execute();

    assert.ok(!result.ok);
    assert.equal(result.error.type, "SEARCH_UNAVAILABLE");
    assert.equal(elasticsearch.aliasTarget("captions"), undefined);
    assert.deepEqual(ids(elasticsearch.documents("captions")), [uuid(7)]);
  });

  it("leaves the index searches run against as it was when its signal fires", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions", [{ id: uuid(7) }]);
    const controller = new AbortController();
    controller.abort();

    const result = await buildSut(db, elasticsearch).execute(controller.signal);

    assert.ok(!result.ok);
    assert.equal(result.error.type, "REBUILD_STOPPED");
    assert.equal(elasticsearch.aliasTarget("captions"), undefined);
    assert.deepEqual(ids(elasticsearch.documents("captions")), [uuid(7)]);
  });

  it("leaves the index searches run against as it was when recording the sync fails", async (t) => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions", [{ id: uuid(7) }]);
    await sql`ALTER TABLE elastic_captions_sync ADD CONSTRAINT no_success CHECK (sync_status <> 'SUCCESS')`.execute(
      db,
    );
    t.after(() =>
      sql`ALTER TABLE elastic_captions_sync DROP CONSTRAINT no_success`.execute(
        db,
      ),
    );

    const result = await buildSut(db, elasticsearch).execute();

    assert.ok(!result.ok);
    assert.equal(result.error.type, "DATABASE");
    assert.equal(elasticsearch.aliasTarget("captions"), undefined);
    assert.deepEqual(ids(elasticsearch.documents("captions")), [uuid(7)]);
  });

  it("leaves the incremental sync going on from the last sync when the switch fails", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    const repository = new ElasticCaptionsSyncRepository(db);
    const elasticsearch = new FakeElasticsearch();
    const sut = buildSut(db, elasticsearch);
    await sut.execute();
    const before = await repository.getLastSuccessfulSync();
    await seedCaption(db, { id: uuid(2), videoId: "searchable1" });
    elasticsearch.failAliasUpdates();

    const result = await sut.execute();

    assert.ok(!result.ok);
    assert.deepEqual(await repository.getLastSuccessfulSync(), before);
  });

  it("completes with the new index live when deleting the old one fails", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    const elasticsearch = new FakeElasticsearch();
    const sut = buildSut(db, elasticsearch);
    await sut.execute();
    const previous = elasticsearch.aliasTarget("captions");
    elasticsearch.failDeletes();

    const result = await sut.execute();

    assert.ok(result.ok);
    const live = elasticsearch.aliasTarget("captions");
    assert.notEqual(live, previous);
    assert.deepEqual(elasticsearch.indexNames(), [previous, live]);
  });
});
