import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DatabaseClient } from "../../db/client.js";
import { useTestDatabase } from "../../db/testing/test-database.js";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import { ElasticCaptionsSyncRepository } from "./elastic-captions-sync.repository.js";
import { SearchIndexes } from "./search-indexes.js";
import { SyncDataToElasticUseCase } from "./sync-data-to-elastic.use-case.js";
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
  return new SyncDataToElasticUseCase(
    new ElasticCaptionsSyncRepository(db),
    new SearchIndexes(logger, elasticsearch.asClient()),
    logger,
  );
}

async function failedPasses(db: DatabaseClient) {
  return db
    .selectFrom("elasticCaptionsSync")
    .select("failReason")
    .where("syncStatus", "=", "FAIL")
    .execute();
}

// ---- Tests ------------------------------------------------------------------

describe("SyncDataToElasticUseCase", () => {
  const db = useTestDatabase();

  it("writes the captions newer than the watermark and moves it to the newest", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions");
    const repository = new ElasticCaptionsSyncRepository(db);
    const sut = buildSut(db, elasticsearch);
    await sut.execute();
    await seedCaption(db, { id: uuid(2), videoId: "searchable1" });
    await seedCaption(db, { id: uuid(3), videoId: "searchable1" });

    const result = await sut.execute();

    assert.deepEqual(result, { ok: true, value: { synced: 2 } });
    assert.deepEqual(ids(elasticsearch.documents("captions")), [
      uuid(1),
      uuid(2),
      uuid(3),
    ]);
    const [, { videoId, startTime, endTime, text }] =
      elasticsearch.documents("captions");
    assert.deepEqual(
      { videoId, startTime, endTime, text },
      {
        videoId: "searchable1",
        startTime: 2500,
        endTime: 4200,
        text: `caption ${uuid(2)}`,
      },
    );
    const lastSync = await repository.getLastSuccessfulSync();
    assert.ok(lastSync.ok);
    assert.equal(lastSync.value?.latestSyncedCaptionId, uuid(3));
  });

  it("leaves creating the search index to the rebuild", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    const elasticsearch = new FakeElasticsearch();

    await assert.rejects(buildSut(db, elasticsearch).execute());

    assert.deepEqual(elasticsearch.indexNames(), []);
  });

  it("fails the pass when Elasticsearch rejects a document, keeping the watermark", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions");
    const repository = new ElasticCaptionsSyncRepository(db);
    const sut = buildSut(db, elasticsearch);
    await sut.execute();
    await seedCaption(db, { id: uuid(2), videoId: "searchable1" });
    elasticsearch.failWrites();

    await assert.rejects(sut.execute());

    const [failed, ...others] = await failedPasses(db);
    assert.equal(others.length, 0);
    assert.match(
      failed?.failReason ?? "",
      new RegExp(`${uuid(2)}.*es_rejected_execution_exception`),
    );
    const lastSync = await repository.getLastSuccessfulSync();
    assert.ok(lastSync.ok);
    assert.equal(lastSync.value?.latestSyncedCaptionId, uuid(1));
  });

  it("writes the captions of a failed pass on the next pass, once each", async () => {
    await seedChannel(db, "UC-rick");
    await seedVideo(db, { id: "searchable1", channelId: "UC-rick" });
    await seedCaption(db, { id: uuid(1), videoId: "searchable1" });
    const elasticsearch = new FakeElasticsearch();
    elasticsearch.createIndex("captions");
    const sut = buildSut(db, elasticsearch);
    await sut.execute();
    await seedCaption(db, { id: uuid(2), videoId: "searchable1" });
    await seedCaption(db, { id: uuid(3), videoId: "searchable1" });
    elasticsearch.failWrites();
    await assert.rejects(sut.execute());
    elasticsearch.acceptWrites();

    const result = await sut.execute();

    assert.deepEqual(result, { ok: true, value: { synced: 2 } });
    assert.deepEqual(ids(elasticsearch.documents("captions")), [
      uuid(1),
      uuid(2),
      uuid(3),
    ]);
  });
});
