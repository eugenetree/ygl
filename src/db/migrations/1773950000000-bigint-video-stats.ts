import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .alterColumn('viewCount', (col) => col.setDataType('bigint'))
    .alterColumn('likeCount', (col) => col.setDataType('bigint'))
    .alterColumn('commentCount', (col) => col.setDataType('bigint'))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('videos')
    .alterColumn('viewCount', (col) => col.setDataType('integer'))
    .alterColumn('likeCount', (col) => col.setDataType('integer'))
    .alterColumn('commentCount', (col) => col.setDataType('integer'))
    .execute();
}
