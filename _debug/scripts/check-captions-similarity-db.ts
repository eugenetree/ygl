// @ts-nocheck

import { dbClient } from "../../src/db/client.js";
import { Logger } from "../../src/modules/_common/logger/logger.js";
import { CaptionSimilarityService } from "../../src/modules/scrapers/video/use-cases/process-video-entry/captions-similarity.service.js";
import { CaptionCleanUpService } from "../../src/modules/scrapers/video/use-cases/process-video-entry/caption-clean-up.service.js";

const main = async () => {
  const videoId = process.argv[2];

  if (!videoId) {
    console.error("Please provide a video ID as the first argument.");
    console.log("Usage: npx tsx _debug/scripts/check-captions-similarity-db.ts <VIDEO_ID>");
    process.exit(1);
  }

  const logger = new Logger({ context: "check-similarity-db", category: "debug" });
  const captionCleanUpService = new CaptionCleanUpService();
  const similarityService = new CaptionSimilarityService(logger, captionCleanUpService);

  console.log(`Fetching captions from DB for video: ${videoId}`);

  const captions = await dbClient
    .selectFrom("captions")
    .selectAll()
    .where("videoId", "=", videoId)
    .execute();

  const autoCaptions = captions.filter((c) => c.type === "auto");
  const manualCaptions = captions.filter((c) => c.type === "manual");

  console.log(`Auto Captions: ${autoCaptions.length} segments`);
  console.log(`Manual Captions: ${manualCaptions.length} segments`);

  if (autoCaptions.length === 0 || manualCaptions.length === 0) {
    console.error("Need both auto and manual captions to compare.");
    await dbClient.destroy();
    process.exit(1);
  }

  const similarityResult = await similarityService.calculateSimilarity({
    autoCaptions,
    manualCaptions,
  });

  console.log("\n--- Similarity Result ---");
  console.log(`Score: ${(similarityResult.score * 100).toFixed(2)}%`);
  console.log(`Shift: ${similarityResult.shiftMs}ms`);
  console.log(`Auto Tokens: ${similarityResult.autoTokenCount}`);
  console.log(`Manual Tokens: ${similarityResult.manualTokenCount}`);
  console.log(`Missing Tokens: ${similarityResult.missingTokens.length}`);
  console.log(`Timing Miss Tokens: ${similarityResult.timingMissTokens.length}`);

  const formatToken = (t: any) => {
    const m = Math.floor(t.startTime / 60000).toString().padStart(2, "0");
    const s = Math.floor((t.startTime % 60000) / 1000).toString().padStart(2, "0");
    return `[${m}:${s}] ${t.token}`;
  };

  if (similarityResult.missingTokens.length > 0) {
    console.log(`\nTokens in MANUAL but absent from AUTO: ${similarityResult.missingTokens.length}`);
    console.log(similarityResult.missingTokens.map(formatToken).join(", "));
  }

  if (similarityResult.timingMissTokens.length > 0) {
    console.log(`\nTokens with timing mismatch: ${similarityResult.timingMissTokens.length}`);
    console.log(similarityResult.timingMissTokens.map(formatToken).join(", "));
  }

  await dbClient.destroy();
};

main();
