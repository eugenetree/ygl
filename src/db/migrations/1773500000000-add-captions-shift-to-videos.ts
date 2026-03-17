import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .addColumn('captionsShift', 'real')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .dropColumn('captionsShift')
    .execute();
}
