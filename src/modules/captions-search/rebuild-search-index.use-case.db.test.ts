import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type Kysely, sql } from "kysely";
import type { DatabaseClient } from "../../db/client.js";
import { useTestDatabase } from "../../db/testing/test-database.js";
import type { Database } from "../../db/types.js";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import { ElasticCaptionsSyncRepository } from "./elastic-captions-sync.repository.js";
import { RebuildSearchIndexUseCase } from "./rebuild-search-index.use-case.js";
import { SearchIndexes } from "./search-indexes.js";
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

// ---- Fixtures ---------------------------------------------------------------

async function seedChannel(db: Kysely<Database>, id: string) {
  await db
    .insertInto("channels")
    .values({
      id,
      name: id,
      viewCount: 0,
      videoCount: 0,
      isFamilySafe: true,
      channelCreatedAt: new Date(),
      username: id.toLowerCase(),
      isArtist: false,
      keywords: [],
    })
    .execute();
}

async function seedVideo(
  db: Kysely<Database>,
  video: {
    id: string;
    channelId: string;
    captionsSimilarityScore?: number;
    manualCaptionsStatus?: "CAPTIONS_VALID" | "CAPTIONS_ABSENT";
  },
) {
  await db
    .insertInto("videos")
    .values({
      title: video.id,
      duration: 213,
      keywords: [],
      viewCount: 0,
      thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      autoCaptionsStatus: "CAPTIONS_VALID",
      manualCaptionsStatus: "CAPTIONS_VALID",
      captionsSimilarityScore: 0.95,
      categories: [],
      ...video,
    })
    .execute();
}

let captionMinute = 0;

async function seedCaption(
  db: Kysely<Database>,
  caption: { id: string; videoId: string; type?: "manual" | "auto" },
) {
  captionMinute += 1;
  await db
    .insertInto("captions")
    .values({
      startTime: 2500,
      endTime: 4200,
      duration: 1700,
      text: `caption ${caption.id}`,
      type: "manual",
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, captionMinute)),
      ...caption,
    })
    .execute();
}

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = (documents: Record<string, unknown>[]) =>
  documents.map((document) => document.id);

// ---- Tests ------------------------------------------------------------------

describe("RebuildSearchIndexUseCase", () => {
  const db = useTestDatabase();

  it("indexes only the manual captions of searchable videos, dropping the rest", async () => {
    await seedChannel(db, "UC-rick");
    await db
      .insertInto("channelPriorityScores")
      .values({
        channelId: "UC-rick",
        scrapingScore: 0.5,
        searchScore: 0.87,
        components: {},
      })
      .execute();
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
    const [{ videoId, startTime, endTime, text, channelSearchScore }] =
      elasticsearch.documents("captions");
    assert.deepEqual(
      { videoId, startTime, endTime, text, channelSearchScore },
      {
        videoId: "searchable1",
        startTime: 2500,
        endTime: 4200,
        text: `caption ${uuid(1)}`,
        channelSearchScore: 0.87,
      },
    );
    assert.deepEqual(result, {
      ok: true,
      value: { indexed: 2, oldIndexSize: 1, newIndexSize: 2 },
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
