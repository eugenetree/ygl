import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .addColumn('categories', sql`varchar[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('track', 'varchar')
    .addColumn('artist', 'varchar')
    .addColumn('album', 'varchar')
    .addColumn('creator', 'varchar')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .dropColumn('categories')
    .dropColumn('track')
    .dropColumn('artist')
    .dropColumn('album')
    .dropColumn('creator')
    .execute();
}
