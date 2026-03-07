import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .addColumn('asr', 'integer')
    .addColumn('abr', 'integer')
    .addColumn('acodec', 'varchar')
    .addColumn('audioChannels', 'integer')
    .addColumn('audioQuality', 'varchar')
    .addColumn('isDrc', 'boolean')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .dropColumn('asr')
    .dropColumn('abr')
    .dropColumn('acodec')
    .dropColumn('audioChannels')
    .dropColumn('audioQuality')
    .dropColumn('isDrc')
    .execute();
}