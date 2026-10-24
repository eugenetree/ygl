import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger } from "../_common/logger/logger.js";
import { createLoggerMock } from "../_common/logger/testing/logger-mock.js";
import { RawDataStore } from "./raw-data-store.js";

const R2_VARS = {
  RAW_DATA_R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  RAW_DATA_R2_ACCESS_KEY_ID: "key-id",
  RAW_DATA_R2_SECRET_ACCESS_KEY: "secret",
  RAW_DATA_R2_BUCKET: "raw-data",
};

const NOTHING_SET = {
  RAW_DATA_R2_ENDPOINT: undefined,
  RAW_DATA_R2_ACCESS_KEY_ID: undefined,
  RAW_DATA_R2_SECRET_ACCESS_KEY: undefined,
  RAW_DATA_R2_BUCKET: undefined,
};

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous = Object.fromEntries(
    Object.keys(vars).map((k) => [k, process.env[k]]),
  );
  const apply = (values: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  apply(vars);
  try {
    return fn();
  } finally {
    apply(previous);
  }
}

function startupLogs() {
  const logger = createLoggerMock();
  new RawDataStore(logger as unknown as Logger);
  return logger.info.mock.calls.map((call) => call.arguments[0]);
}

describe("RawDataStore", () => {
  it("stores raw data in R2 in production when every variable is set", () => {
    withEnv({ APP_ENV: "production", ...R2_VARS }, () => {
      assert.deepEqual(startupLogs(), [
        "Raw data storage is on: R2 bucket raw-data.",
      ]);
    });
  });

  it("refuses to start in production and names the missing variables", () => {
    withEnv(
      {
        APP_ENV: "production",
        ...R2_VARS,
        RAW_DATA_R2_SECRET_ACCESS_KEY: undefined,
        RAW_DATA_R2_BUCKET: undefined,
      },
      () => {
        assert.throws(startupLogs, {
          message:
            "Raw data storage is required in production, missing: RAW_DATA_R2_SECRET_ACCESS_KEY, RAW_DATA_R2_BUCKET",
        });
      },
    );
  });

  it("turns raw data storage off in development when nothing is set", () => {
    withEnv({ APP_ENV: "development", ...NOTHING_SET }, () => {
      assert.deepEqual(startupLogs(), [
        "Raw data storage is off: RAW_DATA_R2_ENDPOINT, RAW_DATA_R2_ACCESS_KEY_ID, RAW_DATA_R2_SECRET_ACCESS_KEY, RAW_DATA_R2_BUCKET not set.",
      ]);
    });
  });

  it("stores raw data in R2 in development when every variable is set", () => {
    withEnv({ APP_ENV: "development", ...R2_VARS }, () => {
      assert.deepEqual(startupLogs(), [
        "Raw data storage is on: R2 bucket raw-data.",
      ]);
    });
  });

  it("succeeds without writing when storage is off", async () => {
    const store = withEnv(
      { APP_ENV: "development", ...NOTHING_SET },
      () => new RawDataStore(createLoggerMock() as unknown as Logger),
    );

    const result = await store.storeRawVideoInfo({
      videoId: "abc",
      fetchedAt: "2026-10-24T00:00:00.000Z",
      result: {},
    });

    assert.deepEqual(result, { ok: true, value: undefined });
  });
});
