// @ts-nocheck

import { Logger } from "../../src/modules/_common/logger/logger.js";
import { YoutubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";
import { YtDlpClient } from "../../src/modules/youtube-api/yt-dlp-client.js";
import { AutoCaptionsValidator } from "../../src/modules/scrapers/video/use-cases/process-video-entry/auto-captions.validator.js";
import { ManualCaptionsValidator } from "../../src/modules/scrapers/video/use-cases/process-video-entry/manual-captions.validator.js";
import { CaptionSimilarityService } from "../../src/modules/scrapers/video/use-cases/process-video-entry/captions-similarity.service.js";
import { CaptionCleanUpService } from "../../src/modules/scrapers/video/use-cases/process-video-entry/caption-clean-up.service.js";
import { writeFileSync } from "fs";

const main = async () => {
  const videoId = process.argv[2] || "VMewtb930VA";

  const logger = new Logger({ context: "fetch-and-check-similarity", category: "debug" });
  const ytDlpClient = new YtDlpClient(logger);
  const youtubeApiGetVideo = new YoutubeApiGetVideo(logger, ytDlpClient);
  const captionCleanUpService = new CaptionCleanUpService();
  const autoCaptionsValidator = new AutoCaptionsValidator(logger, captionCleanUpService);
  const manualCaptionsValidator = new ManualCaptionsValidator(logger, captionCleanUpService);
  const similarityService = new CaptionSimilarityService(logger, captionCleanUpService);

  console.log(`Fetching video: ${videoId}`);
  const videoResult = await youtubeApiGetVideo.getVideo(videoId);

  if (!videoResult.ok) {
    console.error("Failed to fetch video:", videoResult.error);
    process.exit(1);
  }

  const video = videoResult.value;
  console.log(`Title: ${video.title}`);
  console.log(`Auto captions: ${video.autoCaptions?.length ?? 0} segments`);
  console.log(`Manual captions: ${video.manualCaptions?.length ?? 0} segments`);

  writeFileSync(`./_debug/captions/${videoId}-auto.json`, JSON.stringify(video.autoCaptions, null, 2));
  writeFileSync(`./_debug/captions/${videoId}-manual.json`, JSON.stringify(video.manualCaptions, null, 2));

  if (!video.autoCaptions?.length && !video.manualCaptions?.length) {
    console.log("No captions available for this video.");
    process.exit(0);
  }

  const autoResult = video.autoCaptions?.length
    ? autoCaptionsValidator.validate(video.autoCaptions)
    : null;

  if (autoResult && !autoResult.ok) {
    console.log(`Auto captions validation failed: ${autoResult.error.type}`);
  } else if (autoResult?.ok) {
    console.log("Auto captions: valid");
  }

  const manualResult = video.manualCaptions?.length
    ? manualCaptionsValidator.validate(video.manualCaptions)
    : null;

  if (manualResult && !manualResult.ok) {
    console.log(`Manual captions validation failed: ${manualResult.error.type}`);
  } else if (manualResult?.ok) {
    console.log("Manual captions: valid");
  }

  if (!video.autoCaptions?.length || !video.manualCaptions?.length) {
    console.log("\nCannot run similarity check: both auto and manual captions are required.");
    process.exit(0);
  }

  console.log("\nCalculating similarity...");
  const similarityResult = await similarityService.calculateSimilarity({
    autoCaptions: video.autoCaptions,
    manualCaptions: video.manualCaptions,
  });

  const formatToken = (t: any) => {
    const date = new Date(t.startTime);
    const m = date.getUTCMinutes().toString().padStart(2, "0");
    const s = date.getUTCSeconds().toString().padStart(2, "0");
    return `[${m}:${s}] ${t.token}`;
  };

  console.log("\n--- Similarity Result ---");
  console.log(`Score:             ${(similarityResult.score * 100).toFixed(2)}%`);
  console.log(`Shift:             ${similarityResult.shiftMs}ms`);
  console.log(`Manual tokens:     ${similarityResult.manualTokenCount}`);
  console.log(`Auto tokens:       ${similarityResult.autoTokenCount}`);

  console.log("\n--- Missed Tokens ---");
  if (similarityResult.missingTokens.length > 0) {
    console.log(`In manual but absent from auto (${similarityResult.missingTokens.length}):`);
    console.log(
      similarityResult.missingTokens
        .map(formatToken)
        .slice(0, 30)
        .join(", ") + (similarityResult.missingTokens.length > 30 ? "..." : ""),
    );
  }

  if (similarityResult.timingMissTokens.length > 0) {
    console.log(`\nIn both but timestamps misaligned (${similarityResult.timingMissTokens.length}):`);
    console.log(
      similarityResult.timingMissTokens
        .map(formatToken)
        .slice(0, 30)
        .join(", ") + (similarityResult.timingMissTokens.length > 30 ? "..." : ""),
    );
  }

  if (!similarityResult.missingTokens.length && !similarityResult.timingMissTokens.length) {
    console.log("No missed tokens.");
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
