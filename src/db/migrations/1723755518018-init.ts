// import { Kysely, sql } from "kysely";
// import { dbClient } from "../client";

// export async function up(db: Kysely<any>): Promise<void> {
//   await dbClient.schema
//     .createTable("videos")
//     .addColumn("id", "uuid", (col) =>
//       col
//         .primaryKey()
//         .notNull()
//         .defaultTo(sql`uuid_generate_v4()`)
//     )
//     .addColumn("youtubeId", "varchar", (col) => col.notNull())
//     .addColumn("title", "varchar", (col) => col.notNull())
//     .addColumn("duration", "int4", (col) => col.notNull())
//     .addColumn("fullText", "text", (col) => col.notNull())
//     .addColumn("createdAt", "timestamp", (col) =>
//       col.defaultTo(sql`current_timestamp`).notNull()
//     )
//     .addColumn("updatedAt", "timestamp", (col) =>
//       col.defaultTo(sql`current_timestamp`).notNull()
//     )
//     .execute();

//   await db.schema
//     .createTable("subtitles")
//     .addColumn("id", "varchar", (col) => col.primaryKey().notNull())
//     .addColumn("videoId", "varchar", (col) =>
//       col.notNull().references("videos.id")
//     )
//     .addColumn("startTime", "float", (col) => col.notNull())
//     .addColumn("endTime", "float", (col) => col.notNull())
//     .addColumn("text", "text", (col) => col.notNull())
//     .execute();
// }

// export async function down(db: Kysely<any>): Promise<void> {
//   // Migration code
// }
