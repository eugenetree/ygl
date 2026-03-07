import { readFileSync } from "fs";
import { Logger } from "../../src/modules/_common/logger/logger.js";
import { CaptionsSimilarityService } from "../../src/modules/scrapers/video/captions-similarity-service.js";
import { CaptionCleanUpService } from "../../src/modules/scrapers/video/caption-clean-up.service.js";
import { ProcessAutoCaptionsService } from "../../src/modules/scrapers/video/process-auto-captions.service.js";
import { ProcessManualCaptionsService } from "../../src/modules/scrapers/video/process-manual-captions.service.js";

const main = async () => {
  const videoId = process.argv[2];

  if (!videoId) {
    console.error("Please provide a video ID as the first argument.");
    console.log("Usage: npx tsx _debug/scripts/check-captions-similarity-local.ts <VIDEO_ID>");
    process.exit(1);
  }

  const logger = new Logger({ context: "check-similarity-local", category: "debug" });
  const captionCleanUpService = new CaptionCleanUpService();
  const similarityService = new CaptionsSimilarityService(logger, captionCleanUpService);
  const processAutoCaptionsService = new ProcessAutoCaptionsService(logger, captionCleanUpService);
  const processManualCaptionsService = new ProcessManualCaptionsService(logger, captionCleanUpService);

  console.log(`Reading local captions for video: ${videoId}`);
  let rawAuto, rawManual;

  try {
    rawAuto = JSON.parse(readFileSync(`_debug/captions/${videoId}-raw-auto.json`, "utf8"));
    rawManual = JSON.parse(readFileSync(`_debug/captions/${videoId}-raw-manual.json`, "utf8"));
  } catch (error: any) {
    console.error(`Failed to read local caption files for ${videoId}:`, error.message);
    return;
  }

  console.log(`Auto Captions: ${rawAuto.length} segments`);
  console.log(`Manual Captions: ${rawManual.length} segments`);

  const autoResult = await processAutoCaptionsService.process(rawAuto);
  if (!autoResult.ok) {
    console.log(`Auto captions processing failed: ${autoResult.error.type}`);
    return;
  }

  const manualResult = await processManualCaptionsService.process(rawManual);
  if (!manualResult.ok) {
    console.log(`Manual captions processing failed: ${manualResult.error.type}`);
    return;
  }

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
  console.log(`Similarity Score: ${similarityResult.score} | ${(similarityResult.score * 100).toFixed(2)}%`);

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
