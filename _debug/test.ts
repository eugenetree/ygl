import { youtubeApiGetVideo } from "../src/modules/youtube-api/yt-api-get-video.js";
import { ProcessAutoCaptionsService } from "../src/modules/scrapers/_legacy/process-auto-captions.service.js";
import { Logger } from "../src/modules/_common/logger/logger.js";
import { readFileSync, writeFileSync } from "fs";
import { CaptionCleanUpService } from "../src/modules/scrapers/_legacy/caption-clean-up.service.js";

const main = async () => {
  const videoIdDefault = "51KUocErpj0";
  const videoIdMarkiplier = "jS2ykSmI9FA";
  const videoId = videoIdMarkiplier;
  console.log(`\n=== Fetching video: ${videoId} ===\n`);

  const result = await youtubeApiGetVideo.getVideo(videoId);

  if (!result.ok) {
    console.error("Failed to fetch video:", result.error);
    return;
  }

  const video = result.value;
  console.log(`✓ Video fetched: "${video.title}"`);
  console.log(`  Duration: ${(video.duration / 1000).toFixed(0)}s`);
  console.log(`  Language: ${video.languageCode || "none"}`);

  if (!video.autoCaptions || video.autoCaptions.length === 0) {
    console.log("\n✗ No auto captions available for this video");
    return;
  }

  console.log(`  Auto captions: ${video.autoCaptions.length} segments`);

  // Process auto captions
  console.log(`\n=== Processing Auto Captions ===\n`);

  const logger = new Logger({ context: "test", category: "test" });
  const processor = new ProcessAutoCaptionsService(logger, new CaptionCleanUpService());

  const processedCaptions = await processor.process(video.autoCaptions);
  if (!processedCaptions.ok) {
    console.error("Failed to process auto captions:", processedCaptions.error);
    return;
  }

  console.log(`\n=== Calculating Density Metrics ===\n`);

  writeFileSync("processed-captions2.json", JSON.stringify(processedCaptions, null, 2));

  // Show sample of processed captions
  console.log(`\n=== Sample Processed Captions (first 5) ===\n`);
  processedCaptions.value.slice(0, 5).forEach((caption: any, index: number) => {
    const start = (caption.startTime / 1000).toFixed(1);
    const end = (caption.endTime / 1000).toFixed(1);
    console.log(`${index + 1}. [${start}s - ${end}s] "${caption.text}"`);
  });
}

main()
  .then(() => console.log("\n✓ Done"))
  .catch(err => console.error("\n✗ Error:", err));