import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .addColumn('liveStatus', 'varchar')
    .addColumn('ageLimit', 'integer')
    .addColumn('mediaType', 'varchar')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .dropColumn('liveStatus')
    .dropColumn('ageLimit')
    .dropColumn('mediaType')
    .execute();
}
