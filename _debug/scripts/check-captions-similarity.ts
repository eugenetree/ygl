import { YoutubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";
import { Logger } from "../../src/modules/_common/logger/logger.js";
import { YtDlpClient } from "../../src/modules/youtube-api/yt-dlp-client.js";
import { CaptionsSimilarityService } from "../../src/modules/scrapers/video-entries/captions-similarity-service.js";

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
  const similarityService = new CaptionsSimilarityService(logger);

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

  const similarityResult = await similarityService.calculateSimilarity({
    autoCaptions: video.autoCaptions!,
    manualCaptions: video.manualCaptions!,
  });

  console.log("\n--- Similarity Check ---");
  console.log(`Auto Captions Segments: ${video.autoCaptions!.length}`);
  console.log(`Manual Captions Segments: ${video.manualCaptions!.length}`);
  console.log(`Auto Token Count: ${similarityResult.autoTokenCount}`);
  console.log(`Manual Token Count: ${similarityResult.manualTokenCount}`);
  console.log(`Similarity Score: ${(similarityResult.score * 100).toFixed(2)}%`);

  if (similarityResult.extraManualTokens && similarityResult.extraManualTokens.length > 0) {
    console.log(`Extra Manual Tokens Count: ${similarityResult.extraManualTokens.length}`);
  }
};

main();
