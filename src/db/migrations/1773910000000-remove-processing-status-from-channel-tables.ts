import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('channels')
    .dropColumn('videosDiscoveryStatus')
    .dropColumn('videosDiscoveryStatusUpdatedAt')
    .execute();

  await db.schema
    .alterTable('channelEntries')
    .dropColumn('processingStatus')
    .execute();

  await db.schema
    .alterTable('searchChannelQueries')
    .dropColumn('processingStatus')
    .dropColumn('processingStatusUpdatedAt')
    .execute();
}

export async function down(db: Kysely<any>, sql: any): Promise<void> {
  await db.schema
    .alterTable('channels')
    .addColumn('videosDiscoveryStatus', sql`processing_status`, (col: any) => col.notNull().defaultTo('PENDING'))
    .addColumn('videosDiscoveryStatusUpdatedAt', 'timestamp')
    .execute();

  await db.schema
    .alterTable('channelEntries')
    .addColumn('processingStatus', sql`processing_status`, (col: any) => col.notNull().defaultTo('PENDING'))
    .execute();

  await db.schema
    .alterTable('searchChannelQueries')
    .addColumn('processingStatus', sql`processing_status`, (col: any) => col.notNull().defaultTo('PENDING'))
    .addColumn('processingStatusUpdatedAt', 'timestamp')
    .execute();
}
