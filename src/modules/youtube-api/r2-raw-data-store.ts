import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Failure, type Result, Success } from "../../types/index.js";
import type {
  RawDataStorageError,
  RawDataStore,
  StoreRawCaptionTrackParams,
  StoreRawVideoInfoParams,
} from "./raw-data-store.js";

const gzipAsync = promisify(gzip);

export type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

/**
 * Keeps raw data in its own R2 bucket (ADR-0014), one gzipped JSON object per
 * video and kind, overwritten by a later fetch.
 */
export class R2RawDataStore implements RawDataStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2Config) {
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // The SDK's default request checksums have broken uploads to R2, and
      // nothing exercises this client against R2 before the first prod fetch.
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
    this.bucket = config.bucket;
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
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: await gzipAsync(JSON.stringify(content)),
          ContentType: "application/gzip",
        }),
      );
      return Success(undefined);
    } catch (error) {
      return Failure({
        type: "RAW_DATA_STORAGE_ERROR",
        message: `Failed to store ${key} in R2 bucket ${this.bucket}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error,
      });
    }
  }
}
