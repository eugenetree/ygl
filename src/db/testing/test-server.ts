import pg from "pg";

import type { DatabaseConnectionConfig } from "../client.js";

// Test files run in child processes of the test runner, so global setup hands
// them the server through the environment they inherit.
const ENV_VAR = "TEST_POSTGRES";

export type ServerAddress = Required<
  Pick<DatabaseConnectionConfig, "host" | "port" | "user" | "password">
>;

export type TestServer = ServerAddress & {
  baseDatabase: string;
};

export function publishTestServer(server: TestServer): void {
  process.env[ENV_VAR] = JSON.stringify(server);
}

export function readTestServer(): TestServer {
  const value = process.env[ENV_VAR];
  if (!value) {
    throw new Error(
      `${ENV_VAR} is not set. Database tests need the Postgres container from ` +
        "--test-global-setup=src/db/testing/global-setup.mjs, which npm test passes.",
    );
  }
  return JSON.parse(value);
}

export async function withAdminClient<T>(
  server: ServerAddress,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ ...server, database: "postgres" });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
