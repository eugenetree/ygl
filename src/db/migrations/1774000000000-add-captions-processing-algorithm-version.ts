import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .addColumn('captionsProcessingAlgorithmVersion', 'varchar')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .dropColumn('captionsProcessingAlgorithmVersion')
    .execute();
}
