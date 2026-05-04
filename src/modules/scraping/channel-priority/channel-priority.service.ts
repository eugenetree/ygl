import { injectable } from "inversify";
import { DatabaseClient } from "../../../db/client.js";
import { DatabaseError } from "../../../db/types.js";
import { Failure, Result, Success } from "../../../types/index.js";
import { tryCatch } from "../../_common/try-catch.js";
import {
  PRIORITY_BAD_CHANNEL_PENALTY,
  PRIORITY_CAPTION_THRESHOLD,
  PRIORITY_CAPTION_WEIGHT,
  PRIORITY_DURATION_CAP,
  PRIORITY_DURATION_WEIGHT,
  PRIORITY_MANUAL_BOOST,
  PRIORITY_SIMILARITY_WEIGHT,
  PRIORITY_STATS_MIN_VIDEOS,
  PRIORITY_SUBS_CAP,
  PRIORITY_SUBS_WEIGHT,
  PRIORITY_VIEWS_CAP,
  PRIORITY_VIEWS_WEIGHT,
} from "./channel-priority.constants.js";

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

const logNorm = (value: number, cap: number): number =>
  clamp01(Math.log10(value + 1) / Math.log10(cap + 1));

const round2 = (n: number): number => Math.round(n * 100) / 100;

@injectable()
export class ChannelPriorityService {
  constructor(private readonly db: DatabaseClient) {}

  public async recalculate(channelId: string): Promise<Result<void, DatabaseError>> {
    const result = await tryCatch(this.doRecalculate(channelId));
    if (!result.ok) {
      return Failure({ type: "DATABASE", error: result.error });
    }
    return Success(undefined);
  }

  private async doRecalculate(channelId: string): Promise<void> {
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
          (eb) => eb.fn.count<string>("videoJobs.id")
            .filterWhere("videoJobs.status", "=", "SUCCEEDED")
            .as("totalProcessedCount"),
          (eb) => eb.fn.count<string>("videoJobs.id")
            .filterWhere((eb) =>
              eb.and([
                eb("videoJobs.status", "=", "SUCCEEDED"),
                eb.or([
                  eb("videos.autoCaptionsStatus", "=", "CAPTIONS_VALID"),
                  eb("videos.manualCaptionsStatus", "=", "CAPTIONS_VALID"),
                ]),
              ])
            )
            .as("validCaptionsCount"),
          (eb) => eb.fn.avg<number | null>("videos.duration")
            .filterWhere("videoJobs.status", "=", "SUCCEEDED")
            .as("avgDuration"),
          (eb) => eb.fn.avg<number | null>("videos.viewCount")
            .filterWhere("videoJobs.status", "=", "SUCCEEDED")
            .as("avgViews"),
          (eb) => eb.fn.avg<number | null>("videos.captionsSimilarityScore")
            .filterWhere("videoJobs.status", "=", "SUCCEEDED")
            .as("avgSimilarity"),
        ])
        .where("videoJobs.channelId", "=", channelId)
        .executeTakeFirst(),
    ]);

    const totalProcessed = Number(videoStatsRow?.totalProcessedCount ?? 0);
    const validCaptions = Number(videoStatsRow?.validCaptionsCount ?? 0);
    const avgDuration = videoStatsRow?.avgDuration ?? null;
    const avgViews = videoStatsRow?.avgViews ?? null;
    const avgSimilarity = videoStatsRow?.avgSimilarity ?? null;
    const subscriberCount = channelRow?.subscriberCount ?? 0;

    let captionBonus = 0;
    let captionPenalty = 0;
    if (totalProcessed >= PRIORITY_STATS_MIN_VIDEOS) {
      const captionRate = validCaptions / totalProcessed;
      if (captionRate <= PRIORITY_CAPTION_THRESHOLD) {
        captionPenalty = PRIORITY_BAD_CHANNEL_PENALTY;
      } else {
        const norm = clamp01((captionRate - PRIORITY_CAPTION_THRESHOLD) / (1 - PRIORITY_CAPTION_THRESHOLD));
        captionBonus = norm * PRIORITY_CAPTION_WEIGHT;
      }
    }

    const subsBonus = logNorm(subscriberCount, PRIORITY_SUBS_CAP) * PRIORITY_SUBS_WEIGHT;
    const durationBonus = avgDuration != null
      ? logNorm(avgDuration, PRIORITY_DURATION_CAP) * PRIORITY_DURATION_WEIGHT
      : 0;
    const viewsBonus = avgViews != null
      ? logNorm(avgViews, PRIORITY_VIEWS_CAP) * PRIORITY_VIEWS_WEIGHT
      : 0;
    const similarityBonus = avgSimilarity != null
      ? clamp01(avgSimilarity) * PRIORITY_SIMILARITY_WEIGHT
      : 0;
    const manualBoost = boostedRow ? PRIORITY_MANUAL_BOOST : 0;

    const captionRate = totalProcessed > 0 ? validCaptions / totalProcessed : null;
    const captionValue = captionBonus + captionPenalty;

    const components = {
      captions: {
        value: round2(captionValue),
        totalVideos: totalProcessed,
        validVideos: validCaptions,
        rate: captionRate != null ? round2(captionRate) : null,
        threshold: PRIORITY_CAPTION_THRESHOLD,
        minVideos: PRIORITY_STATS_MIN_VIDEOS,
        gateActive: totalProcessed >= PRIORITY_STATS_MIN_VIDEOS,
        weight: PRIORITY_CAPTION_WEIGHT,
        penalty: PRIORITY_BAD_CHANNEL_PENALTY,
      },
      subs: {
        value: round2(subsBonus),
        subscriberCount,
        cap: PRIORITY_SUBS_CAP,
        weight: PRIORITY_SUBS_WEIGHT,
      },
      duration: {
        value: round2(durationBonus),
        avgDuration: avgDuration != null ? round2(Number(avgDuration)) : null,
        cap: PRIORITY_DURATION_CAP,
        weight: PRIORITY_DURATION_WEIGHT,
      },
      views: {
        value: round2(viewsBonus),
        avgViews: avgViews != null ? round2(Number(avgViews)) : null,
        cap: PRIORITY_VIEWS_CAP,
        weight: PRIORITY_VIEWS_WEIGHT,
      },
      similarity: {
        value: round2(similarityBonus),
        avgSimilarity: avgSimilarity != null ? round2(Number(avgSimilarity)) : null,
        weight: PRIORITY_SIMILARITY_WEIGHT,
      },
      manualBoost: {
        value: manualBoost,
        isBoosted: !!boostedRow,
        amount: PRIORITY_MANUAL_BOOST,
      },
    };
    const score =
      captionValue +
      subsBonus +
      durationBonus +
      viewsBonus +
      similarityBonus +
      manualBoost;

    const componentsJson = JSON.stringify(components) as unknown as Record<string, unknown>;

    await this.db
      .insertInto("channelPriorityScores")
      .values({ channelId, score, components: componentsJson, calculatedAt: new Date() })
      .onConflict((oc) => oc.column("channelId").doUpdateSet({ score, components: componentsJson, calculatedAt: new Date() }))
      .execute();

    await Promise.all([
      this.db
        .updateTable("channelJobs")
        .set({ priority: score })
        .where("channelId", "=", channelId)
        .where("status", "=", "PENDING")
        .execute(),
      this.db
        .updateTable("videoDiscoveryJobs")
        .set({ priority: score })
        .where("channelId", "=", channelId)
        .where("status", "=", "PENDING")
        .execute(),
      this.db
        .updateTable("videoJobs")
        .set({ priority: score })
        .where("channelId", "=", channelId)
        .where("status", "=", "PENDING")
        .execute(),
    ]);
  }
}
