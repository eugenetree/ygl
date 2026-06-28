import { injectable } from "inversify";
import { ExpressionBuilder } from "kysely";
import { DatabaseClient } from "../../../db/client.js";
import { Database, DatabaseError } from "../../../db/types.js";
import { Failure, type Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import {
  ChannelPriorityCalculator,
  ChannelStats,
} from "./channel-priority.calculator.js";

export type TopChannel = {
  id: string;
  name: string;
  scrapingScore: number;
  subscriberCount: number | null;
  processedCount: number;
  totalCount: number;
};

@injectable()
export class ChannelPriorityService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly calculator: ChannelPriorityCalculator,
  ) {}

  public async recalculateScore(
    channelId: string,
  ): Promise<
    Result<{ scrapingScore: number; searchScore: number }, DatabaseError>
  > {
    const result = await tryCatch(this.doRecalculateScore(channelId));
    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }
    return Success(result.value);
  }

  public async propagatePriorityToPendingJobs(
    channelId: string,
    scrapingScore: number,
  ): Promise<
    Result<
      {
        updatedChannelJobs: number;
        updatedVideoDiscoveryJobs: number;
        updatedVideoJobs: number;
      },
      DatabaseError
    >
  > {
    const result = await tryCatch(
      this.doPropagatePriorityToPendingJobs(channelId, scrapingScore),
    );
    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }
    return Success(result.value);
  }

  public async getStoredScrapingScore(
    channelId: string,
  ): Promise<Result<number | null, DatabaseError>> {
    const result = await tryCatch(
      this.db
        .selectFrom("channelPriorityScores")
        .select("scrapingScore")
        .where("channelId", "=", channelId)
        .executeTakeFirst(),
    );
    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }
    return Success(result.value?.scrapingScore ?? null);
  }

  public async getTopChannels({
    activeOnly,
  }: {
    activeOnly: boolean;
  }): Promise<Result<TopChannel[], DatabaseError>> {
    const result = await tryCatch(this.doGetTopChannels({ activeOnly }));
    if (!result.ok) return Failure({ type: "DATABASE", error: result.error });
    return Success(result.value);
  }

  private async doGetTopChannels({
    activeOnly,
  }: {
    activeOnly: boolean;
  }): Promise<TopChannel[]> {
    const rows = await this.db
      .selectFrom("channelPriorityScores")
      .innerJoin("channels", "channels.id", "channelPriorityScores.channelId")
      .$if(activeOnly, (qb) =>
        qb.innerJoin(
          (eb: ExpressionBuilder<Database, "channelPriorityScores" | "channels">) =>
            eb
              .selectFrom("videoJobs")
              .select("videoJobs.channelId")
              .where("videoJobs.status", "in", ["PENDING", "PROCESSING"])
              .distinct()
              .as("activeChannels"),
          "activeChannels.channelId",
          "channels.id",
        ),
      )
      .leftJoin("videoJobs", "videoJobs.channelId", "channels.id")
      .select([
        "channels.id",
        "channels.name",
        "channels.subscriberCount",
        "channelPriorityScores.scrapingScore",
        (eb) =>
          eb.fn
            .count<string>(
              eb
                .case()
                .when("videoJobs.status", "=", "SUCCEEDED")
                .then(eb.ref("videoJobs.id"))
                .else(eb.val(null))
                .end(),
            )
            .as("processedCount"),
        (eb) => eb.fn.count<string>("videoJobs.id").as("totalCount"),
      ])
      .groupBy([
        "channels.id",
        "channels.name",
        "channels.subscriberCount",
        "channelPriorityScores.scrapingScore",
      ])
      .orderBy("channelPriorityScores.scrapingScore", "desc")
      .limit(10)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      scrapingScore: row.scrapingScore,
      subscriberCount: row.subscriberCount,
      processedCount: Number(row.processedCount),
      totalCount: Number(row.totalCount),
    }));
  }

  private async doRecalculateScore(
    channelId: string,
  ): Promise<{ scrapingScore: number; searchScore: number }> {
    const [boostedRow, channelRow, videoStatsRow] = await Promise.all([
      this.db
        .selectFrom("boostedChannels")
        .select("channelId")
        .where("channelId", "=", channelId)
        .executeTakeFirst(),
      this.db
        .selectFrom("channels")
        .select("subscriberCount")
        .where("id", "=", channelId)
        .executeTakeFirst(),
      this.db
        .selectFrom("videoJobs")
        .leftJoin("videos", "videos.id", "videoJobs.videoId")
        .select([
          (eb) =>
            eb.fn
              .count<string>("videoJobs.id")
              .filterWhere("videoJobs.status", "=", "SUCCEEDED")
              .as("totalProcessedCount"),
          (eb) =>
            eb.fn
              .count<string>("videoJobs.id")
              .filterWhere((eb) =>
                eb.and([
                  eb("videoJobs.status", "=", "SUCCEEDED"),
                  eb.and([
                    eb("videos.autoCaptionsStatus", "=", "CAPTIONS_VALID"),
                    eb("videos.manualCaptionsStatus", "=", "CAPTIONS_VALID"),
                  ]),
                ]),
              )
              .as("validCaptionsCount"),
          (eb) =>
            eb.fn
              .count<string>("videoJobs.id")
              .filterWhere((eb) =>
                eb.and([
                  eb("videoJobs.status", "=", "SUCCEEDED"),
                  eb("videos.languageCode", "is not", null),
                  eb("videos.languageCode", "!=", "en"),
                ]),
              )
              .as("nonEnglishCount"),
          (eb) =>
            eb.fn
              .avg<number | null>("videos.duration")
              .filterWhere("videoJobs.status", "=", "SUCCEEDED")
              .as("avgDuration"),
          (eb) =>
            eb.fn
              .avg<number | null>("videos.viewCount")
              .filterWhere("videoJobs.status", "=", "SUCCEEDED")
              .as("avgViews"),
          (eb) =>
            eb.fn
              .avg<number | null>("videos.captionsSimilarityScore")
              .filterWhere("videoJobs.status", "=", "SUCCEEDED")
              .as("avgSimilarity"),
        ])
        .where("videoJobs.channelId", "=", channelId)
        .executeTakeFirst(),
    ]);

    const stats: ChannelStats = {
      isBoosted: !!boostedRow,
      subscriberCount: channelRow?.subscriberCount ?? 0,
      totalProcessed: Number(videoStatsRow?.totalProcessedCount ?? 0),
      validCaptions: Number(videoStatsRow?.validCaptionsCount ?? 0),
      nonEnglishCount: Number(videoStatsRow?.nonEnglishCount ?? 0),
      avgDuration: videoStatsRow?.avgDuration ?? null,
      avgViews: videoStatsRow?.avgViews ?? null,
      avgSimilarity: videoStatsRow?.avgSimilarity ?? null,
    };

    const { scrapingScore, searchScore, components } =
      this.calculator.calculate(stats);

    const componentsJson = JSON.stringify(components) as unknown as Record<
      string,
      unknown
    >;

    await this.db
      .insertInto("channelPriorityScores")
      .values({
        channelId,
        scrapingScore,
        searchScore,
        components: componentsJson,
        calculatedAt: new Date(),
      })
      .onConflict((oc) =>
        oc.column("channelId").doUpdateSet({
          scrapingScore,
          searchScore,
          components: componentsJson,
          calculatedAt: new Date(),
        }),
      )
      .execute();

    return { scrapingScore, searchScore };
  }

  private async doPropagatePriorityToPendingJobs(
    channelId: string,
    scrapingScore: number,
  ): Promise<{
    updatedChannelJobs: number;
    updatedVideoDiscoveryJobs: number;
    updatedVideoJobs: number;
  }> {
    const [channelJobsResult, videoDiscoveryJobsResult, videoJobsResult] =
      await Promise.all([
        this.db
          .updateTable("channelJobs")
          .set({ priority: scrapingScore })
          .where("channelId", "=", channelId)
          .where("status", "=", "PENDING")
          .execute(),
        this.db
          .updateTable("videoDiscoveryJobs")
          .set({ priority: scrapingScore })
          .where("channelId", "=", channelId)
          .where("status", "=", "PENDING")
          .execute(),
        this.db
          .updateTable("videoJobs")
          .set({ priority: scrapingScore })
          .where("channelId", "=", channelId)
          .where("status", "=", "PENDING")
          .execute(),
      ]);

    return {
      updatedChannelJobs: Number(channelJobsResult[0]?.numUpdatedRows ?? 0),
      updatedVideoDiscoveryJobs: Number(
        videoDiscoveryJobsResult[0]?.numUpdatedRows ?? 0,
      ),
      updatedVideoJobs: Number(videoJobsResult[0]?.numUpdatedRows ?? 0),
    };
  }
}
