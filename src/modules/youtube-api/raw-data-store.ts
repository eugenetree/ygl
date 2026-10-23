import { Failure, type Result, Success } from "../../types/index.js";
import type { Logger } from "../_common/logger/logger.js";
import { type R2Config, R2RawDataStore } from "./r2-raw-data-store.js";

export type RawDataStorageError = {
  type: "RAW_DATA_STORAGE_ERROR";
  message: string;
  cause?: unknown;
};

export type CaptionTrackKind = "auto" | "manual";

export const RAW_DATA_STORE = Symbol.for("RAW_DATA_STORE");

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

/**
 * Where a video fetch keeps its raw video info and raw caption tracks.
 * `fetchedAt` is an ISO timestamp shared by every object of one fetch.
 */
export interface RawDataStore {
  storeRawVideoInfo(
    params: StoreRawVideoInfoParams,
  ): Promise<Result<void, RawDataStorageError>>;
  storeRawCaptionTrack(
    params: StoreRawCaptionTrackParams,
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

const RAW_DATA_VARIABLES = {
  endpoint: "RAW_DATA_R2_ENDPOINT",
  accessKeyId: "RAW_DATA_R2_ACCESS_KEY_ID",
  secretAccessKey: "RAW_DATA_R2_SECRET_ACCESS_KEY",
  bucket: "RAW_DATA_R2_BUCKET",
} as const satisfies Record<keyof R2Config, string>;

/** Fails with the names of the variables that aren't set. */
export function readR2Config(
  env: Record<string, string | undefined>,
): Result<R2Config, string[]> {
  const config: Partial<R2Config> = {};
  const missing: string[] = [];

  for (const [field, name] of Object.entries(RAW_DATA_VARIABLES)) {
    const value = env[name];
    if (value) config[field as keyof R2Config] = value;
    else missing.push(name);
  }

  return missing.length ? Failure(missing) : Success(config as R2Config);
}

export function createRawDataStore(
  env: Record<string, string | undefined>,
  logger: Logger,
): RawDataStore {
  const config = readR2Config(env);
  if (config.ok) {
    return new R2RawDataStore(config.value);
  }

  const missing = config.error.join(", ");

  if (env.APP_ENV === "production") {
    throw new Error(
      `Raw data storage is required in production, missing: ${missing}`,
    );
  }

  logger.info(`Raw data storage is off: ${missing} not set.`);
  return new DisabledRawDataStore();
}
