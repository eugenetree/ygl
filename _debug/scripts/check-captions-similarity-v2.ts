// @ts-nocheck

import { mkdirSync, writeFileSync } from "fs";
import { Logger } from "../../src/modules/_common/logger/logger.js";
import { YtDlpClient } from "../../src/modules/youtube-api/yt-dlp-client.js";
import { YoutubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";
import { ManualCaptionsValidator } from "../../src/modules/scrapers/video/captions/manual-captions.validator.js";
import { CaptionsSimilarityService } from "../../src/modules/scrapers/video/captions/captions-similarity.service.js";
import { CaptionCleanUpService } from "../../src/modules/scrapers/video/captions/caption-clean-up.service.js";
import { httpClient } from "../../src/modules/_common/http/index.js";
import { Caption } from "../../src/modules/youtube-api/youtube-api.types.js";

/**
 * Parses YouTube's TimedText "srv3" JSON format into standard Caption objects.
 * This format provides word-level timing via 'segs'.
 */
function parseRawAutoCaptions(raw: any): Caption[] {
  const captions: Caption[] = [];
  const events = raw.events || [];

  for (const event of events) {
    if (!event.segs) continue;

    const eventStart = event.tStartMs || 0;
    const eventDuration = event.dDurationMs || 0;

    for (let i = 0; i < event.segs.length; i++) {
      const seg = event.segs[i];
      const text = (seg.utf8 || "").trim();
      if (!text) continue;

      const startTime = eventStart + (seg.tOffsetMs || 0);

      // Estimating end time: either the next segment's start or event end
      let endTime;
      if (i < event.segs.length - 1 && event.segs[i + 1].tOffsetMs !== undefined) {
        endTime = eventStart + event.segs[i + 1].tOffsetMs;
      } else {
        endTime = eventStart + eventDuration;
      }

      captions.push({
        startTime,
        endTime,
        duration: endTime - startTime,
        text,
      });
    }
  }

  return captions;
}

const main = async () => {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error("Please provide a video ID as the first argument.");
    process.exit(1);
  }

  const logger = new Logger({ context: "check-similarity-v2", category: "debug" });

  const ytDlpClient = new YtDlpClient(logger);
  const youtubeApiGetVideo = new YoutubeApiGetVideo(logger, ytDlpClient);
  const captionCleanUpService = new CaptionCleanUpService();
  const similarityService = new CaptionsSimilarityService(logger, captionCleanUpService);
  const manualCaptionsValidator = new ManualCaptionsValidator(logger, captionCleanUpService);

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
  // We need the raw srv3/json3 format for the similarity check
  // console.log("Fetching raw auto captions (json3 format)...");
  // const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);
  // const args = ["--dump-json", "--no-download", "--skip-download", "--no-warnings"];
  // const execResult = await ytDlpClient.execJson<any>([url, ...args]);

  // if (!execResult.ok || execResult.value.length === 0) {
  //   console.error("Failed to fetch video data from yt-dlp.");
  //   return;
  // }
  // const ytData = execResult.value[0];
  // const language = video.languageCode?.split('-')[0] || "en";

  // let autoTrack = ytData.automatic_captions?.[language]?.find((t: any) => t.ext === "json3");
  // if (!autoTrack) {
  //   // fallback to English if the specific language is not found
  //   autoTrack = ytData.automatic_captions?.['en']?.find((t: any) => t.ext === "json3");
  // }

  // if (!autoTrack) {
  //   console.error(`Auto captions (json3) not found for language: ${language} or en`);
  //   return;
  // }

  // const autoCaptionsResponse = await httpClient.get(autoTrack.url);
  // if (!autoCaptionsResponse.ok) {
  //   console.error("Failed to download raw auto captions via HTTP client.");
  //   return;
  // }
  // const autoCaptionsRaw = autoCaptionsResponse.value;

  // 3. Save raw data for debugging
  // mkdirSync("_debug/captions", { recursive: true });
  // writeFileSync(`_debug/captions/${videoId}-raw-auto-v2.json`, JSON.stringify(autoCaptionsRaw, null, 2));
  // writeFileSync(`_debug/captions/${videoId}-raw-manual-v2.json`, JSON.stringify(video.manualCaptions, null, 2));
  // console.log(`Saved raw captions to _debug/captions/${videoId}-raw-*-v2.json`);

  // 4. Process manual captions
  const manualResult = await manualCaptionsValidator.validate(video.manualCaptions);
  if (!manualResult.ok) {
    console.error(`Manual captions processing failed: ${manualResult.error.type}`);
    return;
  }

  // 5. Calculate Similarity
  console.log("\nCalculating Similarity...");
  // const autoCaptions = parseRawAutoCaptions(autoCaptionsRaw);
  const similarityResult = await similarityService.calculateSimilarity({
    manualCaptions: manualResult.value,
    autoCaptions: video.autoCaptions,
  });

  writeFileSync(`_debug/captions/${videoId}-auto-captions.json`, JSON.stringify(video.autoCaptions, null, 2));
  writeFileSync(`_debug/captions/${videoId}-manual-captions.json`, JSON.stringify(manualResult.value, null, 2));
  writeFileSync(`_debug/captions/${videoId}-similarity-result.json`, JSON.stringify(similarityResult, null, 2));

  // 6. Print Results
  console.log("\n======================================================");
  console.log(`Similarity Check Results`);
  console.log(`======================================================`);
  console.log(`Manual Captions Segments (Processed): ${manualResult.value.length}`);
  console.log(`Similarity Score: ${(similarityResult.score * 100).toFixed(2)}%`);
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
