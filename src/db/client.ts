import { injectable, unmanaged } from "inversify";
import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import { Database } from "./types.js";

export type DatabaseConnectionConfig = Pick<
  pg.PoolConfig,
  "host" | "port" | "database" | "user" | "password"
>;

function connectionConfigFromEnv(): DatabaseConnectionConfig {
  return {
    database: process.env.POSTGRES_DB,
    host: process.env.DB_HOST,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    port: Number(process.env.DB_PORT),
  };
}

@injectable()
export class DatabaseClient extends Kysely<Database> {
  constructor(
    @unmanaged()
    connection: DatabaseConnectionConfig = connectionConfigFromEnv(),
  ) {
    super({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ ...connection, max: 10 }),
      }),
      plugins: [new CamelCasePlugin()],
    });
  }
}

export const dbClient = new DatabaseClient();
