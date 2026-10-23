import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { type R2Config, R2RawDataStore } from "./r2-raw-data-store.js";

const gunzipAsync = promisify(gunzip);

const {
  RAW_DATA_R2_ENDPOINT: endpoint,
  RAW_DATA_R2_ACCESS_KEY_ID: accessKeyId,
  RAW_DATA_R2_SECRET_ACCESS_KEY: secretAccessKey,
  RAW_DATA_R2_BUCKET: bucket,
} = process.env;

const config: R2Config | null =
  endpoint && accessKeyId && secretAccessKey && bucket
    ? { endpoint, accessKeyId, secretAccessKey, bucket }
    : null;

async function readObject(config: R2Config, key: string): Promise<unknown> {
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const object = await client.send(
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

    const stored = await store.storeRawVideoInfo(videoId, fetchedAt, result);

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

    const stored = await store.storeRawCaptionTrack(
      videoId,
      "manual",
      fetchedAt,
      "en-uYU-mmqFLq8",
      track,
    );

    assert.ok(stored.ok, !stored.ok ? stored.error.message : undefined);
    assert.deepEqual(
      await readObject(config!, `${videoId}/manual-track.json.gz`),
      { videoId, fetchedAt, trackKey: "en-uYU-mmqFLq8", track },
    );
  });
});
