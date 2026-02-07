import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import { Database } from "./types.js";

const dialect = new PostgresDialect({
  pool: new pg.Pool({
    database: "ygl-pg",
    host: "db",
    user: "admin",
    password: "admin",
    port: 5432,
    max: 10,
  }),
});

export const dbClient = new Kysely<Database>({
  dialect,
  plugins: [new CamelCasePlugin()],
});
