import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  createR2Client,
  type R2Config,
  R2RawDataStore,
} from "./r2-raw-data-store.js";
import { readR2Config } from "./raw-data-store.js";

const gunzipAsync = promisify(gunzip);

const r2Config = readR2Config(process.env);
const config = r2Config.ok ? r2Config.value : null;

async function readObject(config: R2Config, key: string): Promise<unknown> {
  const object = await createR2Client(config).send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  const body = await gunzipAsync(await object.Body!.transformToByteArray());
  return JSON.parse(body.toString("utf-8"));
}

describe("R2RawDataStore", {
  skip: config ? false : "RAW_DATA_R2_* variables are not set",
}, () => {
  const videoId = "net-test-video";

  it("writes a raw video info that reads back from the bucket", async () => {
    const store = new R2RawDataStore(config!);
    const fetchedAt = new Date().toISOString();
    const result = { ok: true, value: [{ id: videoId, title: "Net test" }] };

    const stored = await store.storeRawVideoInfo({
      videoId,
      fetchedAt,
      result,
    });

    assert.ok(stored.ok, !stored.ok ? stored.error.message : undefined);
    assert.deepEqual(
      await readObject(config!, `${videoId}/video-info.json.gz`),
      { videoId, fetchedAt, result },
    );
  });

  it("writes a raw caption track that reads back from the bucket", async () => {
    const store = new R2RawDataStore(config!);
    const fetchedAt = new Date().toISOString();
    const track = { events: [{ tStartMs: 0, segs: [{ utf8: "hello" }] }] };

    const stored = await store.storeRawCaptionTrack({
      videoId,
      kind: "manual",
      fetchedAt,
      trackKey: "en-uYU-mmqFLq8",
      track,
    });

    assert.ok(stored.ok, !stored.ok ? stored.error.message : undefined);
    assert.deepEqual(
      await readObject(config!, `${videoId}/manual-track.json.gz`),
      { videoId, fetchedAt, trackKey: "en-uYU-mmqFLq8", track },
    );
  });
});
