import { injectable } from "inversify";
import { DatabaseClient } from "../../../db/client.js";
import { DatabaseError } from "../../../db/types.js";
import { Failure, type Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import {
  ChannelPriorityCalculator,
  ChannelStats,
} from "./channel-priority.calculator.js";

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
