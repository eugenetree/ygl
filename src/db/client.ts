import { injectable } from "inversify";
import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import { Database } from "./types.js";

@injectable()
export class DatabaseClient extends Kysely<Database> {
  constructor() {
    super({
      dialect: new PostgresDialect({
        pool: new pg.Pool({
          database: process.env.POSTGRES_DB,
          host: process.env.DB_HOST,
          user: process.env.POSTGRES_USER,
          password: process.env.POSTGRES_PASSWORD,
          port: Number(process.env.DB_PORT),
          max: 10,
        }),
      }),
      plugins: [new CamelCasePlugin()],
    });
  }
}

export const dbClient = new DatabaseClient();
