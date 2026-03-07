import { mkdirSync, writeFileSync } from "fs";
import { Logger } from "../../src/modules/_common/logger/logger.js";
import { YtDlpClient } from "../../src/modules/youtube-api/yt-dlp-client.js";
import { YoutubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";
import { ProcessManualCaptionsService } from "../../src/modules/scrapers/video/process-manual-captions.service.js";
import { CaptionsSimilarityV2Service } from "../../src/modules/scrapers/video/captions-similarity-v2-service.js";
import { CaptionCleanUpService } from "../../src/modules/scrapers/video/caption-clean-up.service.js";
import { httpClient } from "../../src/modules/_common/http/index.js";

const main = async () => {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error("Please provide a video ID as the first argument.");
    process.exit(1);
  }

  const logger = new Logger({ context: "check-similarity-v2", category: "debug" });

  const ytDlpClient = new YtDlpClient(logger);
  const youtubeApiGetVideo = new YoutubeApiGetVideo(logger, ytDlpClient);
  const similarityService = new CaptionsSimilarityV2Service(logger);
  const captionCleanUpService = new CaptionCleanUpService();
  const processManualCaptionsService = new ProcessManualCaptionsService(logger, captionCleanUpService);

  console.log(`\n======================================================`);
  console.log(`Fetching data for video: ${videoId}`);
  console.log(`======================================================\n`);

  // 1. Fetch video metadata including parsed manual/auto captions
  const videoResult = await youtubeApiGetVideo.getVideo(videoId);
  if (!videoResult.ok) {
    console.error("Failed to fetch video using YoutubeApiGetVideo:", videoResult.error);
    return;
  }
  const video = videoResult.value;

  if (!video.manualCaptions) {
    console.error("No manual captions found for this video.");
    return;
  }

  // 2. Fetch raw auto captions from YouTube via yt-dlp metadata
  // We need the raw srv3/json3 format for the V2 similarity service
  console.log("Fetching raw auto captions (json3 format)...");
  const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);
  const args = ["--dump-json", "--no-download", "--skip-download", "--no-warnings"];
  const execResult = await ytDlpClient.execJson<any>([url, ...args]);

  if (!execResult.ok || execResult.value.length === 0) {
    console.error("Failed to fetch video data from yt-dlp.");
    return;
  }
  const ytData = execResult.value[0];
  const language = video.languageCode?.split('-')[0] || "en";

  let autoTrack = ytData.automatic_captions?.[language]?.find((t: any) => t.ext === "json3");
  if (!autoTrack) {
    // fallback to English if the specific language is not found
    autoTrack = ytData.automatic_captions?.['en']?.find((t: any) => t.ext === "json3");
  }

  if (!autoTrack) {
    console.error(`Auto captions (json3) not found for language: ${language} or en`);
    return;
  }

  const autoCaptionsResponse = await httpClient.get(autoTrack.url);
  if (!autoCaptionsResponse.ok) {
    console.error("Failed to download raw auto captions via HTTP client.");
    return;
  }
  const autoCaptionsRaw = autoCaptionsResponse.value;

  // 3. Save raw data for debugging
  mkdirSync("_debug/captions", { recursive: true });
  writeFileSync(`_debug/captions/${videoId}-raw-auto-v2.json`, JSON.stringify(autoCaptionsRaw, null, 2));
  writeFileSync(`_debug/captions/${videoId}-raw-manual-v2.json`, JSON.stringify(video.manualCaptions, null, 2));
  console.log(`Saved raw captions to _debug/captions/${videoId}-raw-*-v2.json`);

  // 4. Process manual captions
  const manualResult = await processManualCaptionsService.process(video.manualCaptions);
  if (!manualResult.ok) {
    console.error(`Manual captions processing failed: ${manualResult.error.type}`);
    return;
  }

  // 5. Calculate Similarity V2
  console.log("\nCalculating Similarity (V2)...");
  const similarityResult = await similarityService.calculateSimilarityV2({
    manualCaptions: manualResult.value,
    autoCaptionsRaw: autoCaptionsRaw,
  });

  // 6. Print Results
  console.log("\n======================================================");
  console.log(`Similarity Check Results (V2)`);
  console.log(`======================================================`);
  console.log(`Manual Captions Segments (Processed): ${manualResult.value.length}`);
  console.log(`Similarity Score: ${(similarityResult.score * 100).toFixed(2)}%`);
  console.log(`Calculated Threshold: ${similarityResult.threshold}`);
  console.log(`Manual Token Count: ${similarityResult.manualTokenCount}`);
  console.log(`Auto Token Count: ${similarityResult.autoTokenCount}`);
  console.log(`Detected Shift: ${similarityResult.shiftMs}ms`);

  const formatToken = (t: any) => {
    const date = new Date(t.startTime);
    const m = date.getUTCMinutes().toString().padStart(2, '0');
    const s = date.getUTCSeconds().toString().padStart(2, '0');
    return `[${m}:${s}] ${t.token}`;
  };

  console.log(`\n--- Missed Tokens Breakdown ---`);
  if (similarityResult.missingTokens.length > 0) {
    console.log(`Tokens in MANUAL but absent from AUTO: ${similarityResult.missingTokens.length}`);
    console.log(similarityResult.missingTokens.map(formatToken).slice(0, 20).join(', ') + (similarityResult.missingTokens.length > 20 ? '...' : ''));
  }
  if (similarityResult.timingMissTokens.length > 0) {
    console.log(`\nTokens that exist in both, but timestamps did not align: ${similarityResult.timingMissTokens.length}`);
    console.log(similarityResult.timingMissTokens.map(formatToken).slice(0, 20).join(', ') + (similarityResult.timingMissTokens.length > 20 ? '...' : ''));
  }
  console.log(`======================================================\n`);
};

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
