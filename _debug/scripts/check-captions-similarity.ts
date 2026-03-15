// @ts-nocheck

import { YoutubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";
import { Logger } from "../../src/modules/_common/logger/logger.js";
import { YtDlpClient } from "../../src/modules/youtube-api/yt-dlp-client.js";
import { CaptionsSimilarityService } from "../../src/modules/scrapers/video/captions/captions-similarity.service.js";
import { CaptionCleanUpService } from "../../src/modules/scrapers/video/captions/caption-clean-up.service.js";
import { AutoCaptionsValidator } from "../../src/modules/scrapers/video/captions/auto-captions.validator.js";
import { ManualCaptionsValidator } from "../../src/modules/scrapers/video/captions/manual-captions.validator.js";
import { writeFileSync, mkdirSync } from "fs";

const main = async () => {
  const videoId = process.argv[2];

  if (!videoId) {
    console.error("Please provide a video ID as the first argument.");
    console.log("Usage: npx tsx _debug/scripts/check-captions-similarity.ts <VIDEO_ID>");
    process.exit(1);
  }

  const logger = new Logger({ context: "check-similarity", category: "debug" });
  const ytDlpClient = new YtDlpClient(logger);
  const youtubeApiGetVideo = new YoutubeApiGetVideo(logger, ytDlpClient);
  const captionCleanUpService = new CaptionCleanUpService();
  const similarityService = new CaptionsSimilarityService(logger, captionCleanUpService);
  const autoCaptionsValidator = new AutoCaptionsValidator(logger, captionCleanUpService);
  const manualCaptionsValidator = new ManualCaptionsValidator(logger, captionCleanUpService);

  console.log(`Fetching captions for video: ${videoId}`);
  const result = await youtubeApiGetVideo.getVideo(videoId);

  if (!result.ok) {
    console.error("Failed to fetch video:", result.error);
    return;
  }

  const video = result.value;

  const hasAuto = video.autoCaptions && video.autoCaptions.length > 0;
  const hasManual = video.manualCaptions && video.manualCaptions.length > 0;

  console.log(`Auto Captions: ${hasAuto ? video.autoCaptions!.length + " segments" : "None"}`);
  console.log(`Manual Captions: ${hasManual ? video.manualCaptions!.length + " segments" : "None"}`);

  if (!hasAuto || !hasManual) {
    console.log("Cannot compare. Video must have both auto and manual captions to check similarity.");
    return;
  }

  mkdirSync("_debug/captions", { recursive: true });

  writeFileSync(`_debug/captions/${videoId}-raw-auto.json`, JSON.stringify(video.autoCaptions, null, 2));
  writeFileSync(`_debug/captions/${videoId}-raw-manual.json`, JSON.stringify(video.manualCaptions, null, 2));

  const autoResult = await autoCaptionsValidator.validate(video.autoCaptions!);
  if (!autoResult.ok) {
    console.log(`Auto captions processing failed: ${autoResult.error.type}`);
    return;
  }

  const manualResult = await manualCaptionsValidator.validate(video.manualCaptions!);
  if (!manualResult.ok) {
    console.log(`Manual captions processing failed: ${manualResult.error.type}`);
    return;
  }

  writeFileSync(`_debug/captions/${videoId}-processed-auto.json`, JSON.stringify(autoResult.value, null, 2));
  writeFileSync(`_debug/captions/${videoId}-processed-manual.json`, JSON.stringify(manualResult.value, null, 2));

  const similarityResult = await similarityService.calculateSimilarity({
    autoCaptions: autoResult.value,
    manualCaptions: manualResult.value,
  });

  console.log("\n--- Similarity Check ---");
  console.log(`Auto Captions Segments (Processed): ${autoResult.value.length}`);
  console.log(`Manual Captions Segments (Processed): ${manualResult.value.length}`);

  const autoWordCount = autoResult.value.reduce((acc, cap) => acc + cap.text.trim().split(/\s+/).filter(w => w.length > 0).length, 0);
  const manualWordCount = manualResult.value.reduce((acc, cap) => acc + cap.text.trim().split(/\s+/).filter(w => w.length > 0).length, 0);

  console.log(`Auto Word Count: ${autoWordCount}`);
  console.log(`Manual Word Count: ${manualWordCount}`);
  console.log(`Auto Token Count: ${similarityResult.autoTokenCount}`);
  console.log(`Manual Token Count: ${similarityResult.manualTokenCount}`);
  console.log(`Similarity Score: ${(similarityResult.score * 100).toFixed(2)}%`);

  const formatToken = (t: any) => {
    const date = new Date(t.startTime);
    const m = date.getUTCMinutes().toString().padStart(2, '0');
    const s = date.getUTCSeconds().toString().padStart(2, '0');
    return `[${m}:${s}] ${t.token}`;
  };

  console.log(`\n--- Missed Tokens Breakdown ---`);
  if (similarityResult.missingTokens.length > 0) {
    console.log(`Tokens in MANUAL but absent from AUTO: ${similarityResult.missingTokens.length}`);
    console.log(similarityResult.missingTokens.map(formatToken).join(', '));
  }
  if (similarityResult.timingMissTokens.length > 0) {
    console.log(`\nTokens that exist in both, but timestamps did not align: ${similarityResult.timingMissTokens.length}`);
    console.log(similarityResult.timingMissTokens.map(formatToken).join(', '));
  }
};

main();
