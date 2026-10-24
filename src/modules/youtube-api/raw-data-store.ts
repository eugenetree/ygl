import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { injectable } from "inversify";
import { Failure, type Result, Success } from "../../types/index.js";
import { Logger } from "../_common/logger/logger.js";

const gzipAsync = promisify(gzip);

export type RawDataStorageError = {
  type: "RAW_DATA_STORAGE_ERROR";
  message: string;
  cause?: unknown;
};

export type CaptionTrackKind = "auto" | "manual";

export type StoreRawVideoInfoParams = {
  videoId: string;
  fetchedAt: string;
  result: unknown;
};

export type StoreRawCaptionTrackParams = {
  videoId: string;
  kind: CaptionTrackKind;
  fetchedAt: string;
  trackKey: string;
  track: unknown;
};

const RAW_DATA_VARIABLES = [
  "RAW_DATA_R2_ENDPOINT",
  "RAW_DATA_R2_ACCESS_KEY_ID",
  "RAW_DATA_R2_SECRET_ACCESS_KEY",
  "RAW_DATA_R2_BUCKET",
] as const;

/**
 * Where a video fetch keeps its raw video info and raw caption tracks: its own
 * R2 bucket (ADR-0014), one gzipped JSON object per video and kind, overwritten
 * by a later fetch. `fetchedAt` is an ISO timestamp shared by every object of
 * one fetch.
 *
 * Required when APP_ENV=production, where a missing variable throws at
 * construction. Elsewhere a missing variable turns storage off, and every call
 * succeeds without writing.
 */
@injectable()
export class RawDataStore {
  private readonly r2: { client: S3Client; bucket: string } | undefined;

  constructor(private readonly logger: Logger) {
    this.logger.setContext(RawDataStore.name);

    const {
      RAW_DATA_R2_ENDPOINT: endpoint,
      RAW_DATA_R2_ACCESS_KEY_ID: accessKeyId,
      RAW_DATA_R2_SECRET_ACCESS_KEY: secretAccessKey,
      RAW_DATA_R2_BUCKET: bucket,
    } = process.env;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      const missing = RAW_DATA_VARIABLES.filter((name) => !process.env[name]);
      if (process.env.APP_ENV === "production") {
        throw new Error(
          `Raw data storage is required in production, missing: ${missing.join(", ")}`,
        );
      }
      this.logger.info(
        `Raw data storage is off: ${missing.join(", ")} not set.`,
      );
      return;
    }

    this.r2 = {
      client: new S3Client({
        region: "auto",
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        // The SDK's default request checksums have broken uploads to R2, and
        // nothing exercises this client against R2 before the first prod fetch.
        requestChecksumCalculation: "WHEN_REQUIRED",
      }),
      bucket,
    };
    this.logger.info(`Raw data storage is on: R2 bucket ${bucket}.`);
  }

  public storeRawVideoInfo({
    videoId,
    fetchedAt,
    result,
  }: StoreRawVideoInfoParams): Promise<Result<void, RawDataStorageError>> {
    return this.put(`${videoId}/video-info.json.gz`, {
      videoId,
      fetchedAt,
      result,
    });
  }

  public storeRawCaptionTrack({
    videoId,
    kind,
    fetchedAt,
    trackKey,
    track,
  }: StoreRawCaptionTrackParams): Promise<Result<void, RawDataStorageError>> {
    return this.put(`${videoId}/${kind}-track.json.gz`, {
      videoId,
      fetchedAt,
      trackKey,
      track,
    });
  }

  private async put(
    key: string,
    content: unknown,
  ): Promise<Result<void, RawDataStorageError>> {
    if (!this.r2) return Success(undefined);
    const { client, bucket } = this.r2;

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: await gzipAsync(JSON.stringify(content)),
          ContentType: "application/gzip",
        }),
      );
      return Success(undefined);
    } catch (error) {
      return Failure({
        type: "RAW_DATA_STORAGE_ERROR",
        message: `Failed to store ${key} in R2 bucket ${bucket}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error,
      });
    }
  }
}
