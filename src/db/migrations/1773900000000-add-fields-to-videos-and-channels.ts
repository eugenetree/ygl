import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .addColumn('uploadedAt', 'timestamptz')
    .addColumn('description', 'text')
    .addColumn('likeCount', 'integer')
    .addColumn('commentCount', 'integer')
    .addColumn('availability', 'varchar')
    .addColumn('playableInEmbed', 'boolean')
    .addColumn('channelIsVerified', 'boolean')
    .execute();

  await db.schema
    .alterTable('channels')
    .addColumn('keywords', sql`varchar[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .dropColumn('uploadedAt')
    .dropColumn('description')
    .dropColumn('likeCount')
    .dropColumn('commentCount')
    .dropColumn('availability')
    .dropColumn('playableInEmbed')
    .dropColumn('channelIsVerified')
    .execute();

  await db.schema
    .alterTable('channels')
    .dropColumn('keywords')
    .execute();
}
