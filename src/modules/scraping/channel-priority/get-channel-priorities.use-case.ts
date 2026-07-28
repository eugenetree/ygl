import { injectable } from "inversify";
import { sql } from "kysely";
import { DatabaseClient } from "../../../db/client.js";
import { DatabaseError, VideoJobStatus } from "../../../db/types.js";
import { Failure, type Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";

/** The statuses that make a channel active — see "Active channel" in CONTEXT.md. */
const ACTIVE_STATUSES = [
  "PENDING",
  "PROCESSING",
] as const satisfies readonly VideoJobStatus[];

/**
 * Channels created before the priority feature have no score row, so a missing
 * score ranks as zero rather than dropping the channel from the listing.
 *
 * Written as raw SQL, which bypasses CamelCasePlugin — hence snake_case.
 */
const SCRAPING_SCORE = sql<number>`coalesce("channel_priority_scores"."scraping_score", 0)`;

export type ChannelPriorityListing = {
  channelId: string;
  name: string;
  scrapingScore: number;
  isBoosted: boolean;
  total: number;
  processed: number;
  left: number;
  failed: number;
  skipped: number;
};

export type GetChannelPrioritiesOptions = {
  /** When true, restrict to active channels — those with video jobs still to run. */
  onlyActive: boolean;
  limit: number;
};

@injectable()
export class GetChannelPrioritiesUseCase {
  constructor(private readonly db: DatabaseClient) {}

  public async execute(
    options: GetChannelPrioritiesOptions,
  ): Promise<Result<ChannelPriorityListing[], DatabaseError>> {
    const result = await tryCatch(this.doExecute(options));
    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }
    return Success(result.value);
  }

  /**
   * Ranking and counting are two queries rather than one grouped join: a single
   * aggregate over the whole of `videoJobs` would scan every row regardless of
   * priority, whereas ranking first narrows the counting pass to the handful of
   * channels actually being shown.
   */
  private async doExecute(
    options: GetChannelPrioritiesOptions,
  ): Promise<ChannelPriorityListing[]> {
    const ranked = await this.rankChannels(options);
    if (ranked.length === 0) return [];

    const counts = await this.countVideoJobs(ranked.map((c) => c.channelId));

    return ranked.map((channel) => ({
      ...channel,
      ...(counts.get(channel.channelId) ?? {
        total: 0,
        processed: 0,
        left: 0,
        failed: 0,
        skipped: 0,
      }),
    }));
  }

  private async rankChannels(options: GetChannelPrioritiesOptions) {
    let query = this.db
      .selectFrom("channels")
      .leftJoin(
        "channelPriorityScores",
        "channelPriorityScores.channelId",
        "channels.id",
      )
      .leftJoin("boostedChannels", "boostedChannels.channelId", "channels.id")
      .select([
        "channels.id as channelId",
        "channels.name as name",
        SCRAPING_SCORE.as("scrapingScore"),
        sql<boolean>`"boosted_channels"."channel_id" is not null`.as(
          "isBoosted",
        ),
      ])
      .orderBy(sql`${SCRAPING_SCORE} desc`)
      // subscriberCount is nullable, and Postgres sorts NULLs first under DESC,
      // which would float channels of unknown size above known-large ones.
      .orderBy(sql`"channels"."subscriber_count" desc nulls last`)
      .orderBy("channels.id", "asc")
      .limit(options.limit);

    if (options.onlyActive) {
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom("videoJobs")
            .select("videoJobs.id")
            .whereRef("videoJobs.channelId", "=", "channels.id")
            .where("videoJobs.status", "in", [...ACTIVE_STATUSES]),
        ),
      );
    }

    return query.execute();
  }

  private async countVideoJobs(channelIds: string[]) {
    const rows = await this.db
      .selectFrom("videoJobs")
      .select((eb) => [
        "videoJobs.channelId as channelId",
        eb.fn.count<string>("videoJobs.id").as("total"),
        eb.fn
          .count<string>("videoJobs.id")
          .filterWhere("videoJobs.status", "=", "SUCCEEDED")
          .as("processed"),
        eb.fn
          .count<string>("videoJobs.id")
          .filterWhere("videoJobs.status", "in", [...ACTIVE_STATUSES])
          .as("left"),
        eb.fn
          .count<string>("videoJobs.id")
          .filterWhere("videoJobs.status", "=", "FAILED")
          .as("failed"),
        eb.fn
          .count<string>("videoJobs.id")
          .filterWhere("videoJobs.status", "=", "SKIPPED")
          .as("skipped"),
      ])
      .where("videoJobs.channelId", "in", channelIds)
      .groupBy("videoJobs.channelId")
      .execute();

    return new Map(
      rows.map((row) => [
        row.channelId,
        {
          total: Number(row.total),
          processed: Number(row.processed),
          left: Number(row.left),
          failed: Number(row.failed),
          skipped: Number(row.skipped),
        },
      ]),
    );
  }
}
