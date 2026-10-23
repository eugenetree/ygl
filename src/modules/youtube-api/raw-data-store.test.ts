import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Logger } from "../_common/logger/logger.js";
import { R2RawDataStore } from "./r2-raw-data-store.js";
import { createRawDataStore, DisabledRawDataStore } from "./raw-data-store.js";

const R2_VARS = {
  RAW_DATA_R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  RAW_DATA_R2_ACCESS_KEY_ID: "key-id",
  RAW_DATA_R2_SECRET_ACCESS_KEY: "secret",
  RAW_DATA_R2_BUCKET: "raw-data",
};

const logger = new Logger({ context: "test", category: "test" });

describe("createRawDataStore", () => {
  it("stores raw data in R2 in production when every variable is set", () => {
    const store = createRawDataStore(
      { APP_ENV: "production", ...R2_VARS },
      logger,
    );

    assert.ok(store instanceof R2RawDataStore);
  });

  it("refuses to start in production and names the missing variables", () => {
    const { RAW_DATA_R2_BUCKET, RAW_DATA_R2_SECRET_ACCESS_KEY, ...partial } =
      R2_VARS;

    assert.throws(
      () => createRawDataStore({ APP_ENV: "production", ...partial }, logger),
      {
        message:
          "Raw data storage is required in production, missing: RAW_DATA_R2_SECRET_ACCESS_KEY, RAW_DATA_R2_BUCKET",
      },
    );
  });

  it("turns raw data storage off in development when nothing is set", () => {
    const store = createRawDataStore({ APP_ENV: "development" }, logger);

    assert.ok(store instanceof DisabledRawDataStore);
  });

  it("stores raw data in R2 in development when every variable is set", () => {
    const store = createRawDataStore(
      { APP_ENV: "development", ...R2_VARS },
      logger,
    );

    assert.ok(store instanceof R2RawDataStore);
  });
});
