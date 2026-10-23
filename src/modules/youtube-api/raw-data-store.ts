import { type Result, Success } from "../../types/index.js";
import type { Logger } from "../_common/logger/logger.js";
import { R2RawDataStore } from "./r2-raw-data-store.js";

export type RawDataStorageError = {
  type: "RAW_DATA_STORAGE_ERROR";
  message: string;
  cause?: unknown;
};

export type CaptionTrackKind = "auto" | "manual";

export const RAW_DATA_STORE = Symbol.for("RAW_DATA_STORE");

/**
 * Where a video fetch keeps its raw video info and raw caption tracks.
 * `fetchedAt` is an ISO timestamp shared by every object of one fetch.
 */
export interface RawDataStore {
  storeRawVideoInfo(
    videoId: string,
    fetchedAt: string,
    result: unknown,
  ): Promise<Result<void, RawDataStorageError>>;
  storeRawCaptionTrack(
    videoId: string,
    kind: CaptionTrackKind,
    fetchedAt: string,
    trackKey: string,
    track: unknown,
  ): Promise<Result<void, RawDataStorageError>>;
}

export class DisabledRawDataStore implements RawDataStore {
  public async storeRawVideoInfo(): Promise<Result<void, never>> {
    return Success(undefined);
  }

  public async storeRawCaptionTrack(): Promise<Result<void, never>> {
    return Success(undefined);
  }
}

const RAW_DATA_VARIABLES = [
  "RAW_DATA_R2_ENDPOINT",
  "RAW_DATA_R2_ACCESS_KEY_ID",
  "RAW_DATA_R2_SECRET_ACCESS_KEY",
  "RAW_DATA_R2_BUCKET",
] as const;

/**
 * Builds the raw data store from the environment. In production every raw
 * data variable is required and a missing one throws; elsewhere a missing one
 * turns storage off.
 */
export function createRawDataStore(
  env: Record<string, string | undefined>,
  logger: Logger,
): RawDataStore {
  const {
    RAW_DATA_R2_ENDPOINT: endpoint,
    RAW_DATA_R2_ACCESS_KEY_ID: accessKeyId,
    RAW_DATA_R2_SECRET_ACCESS_KEY: secretAccessKey,
    RAW_DATA_R2_BUCKET: bucket,
  } = env;

  if (endpoint && accessKeyId && secretAccessKey && bucket) {
    return new R2RawDataStore({
      endpoint,
      accessKeyId,
      secretAccessKey,
      bucket,
    });
  }

  const missing = RAW_DATA_VARIABLES.filter((name) => !env[name]);

  if (env.APP_ENV === "production") {
    throw new Error(
      `Raw data storage is required in production, missing: ${missing.join(", ")}`,
    );
  }

  logger.info(`Raw data storage is off: ${missing.join(", ")} not set.`);
  return new DisabledRawDataStore();
}
