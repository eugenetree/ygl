import { readFileSync } from "fs";
import { Logger } from "../../src/modules/_common/logger/logger.js";
import { CaptionCleanUpService } from "../../src/modules/scrapers/video/caption-clean-up.service.js";
import { ProcessManualCaptionsService } from "../../src/modules/scrapers/video/process-manual-captions.service.js";
import { CaptionsSimilarityV2Service } from "../../src/modules/scrapers/video/captions-similarity-v2-service.js";

const main = async () => {
  const videoId = "AzNWmFaOqJI";
  const logger = new Logger({ context: "check-similarity-v2-local", category: "debug" });

  const similarityService = new CaptionsSimilarityV2Service(logger);
  const captionCleanUpService = new CaptionCleanUpService();
  const processManualCaptionsService = new ProcessManualCaptionsService(logger, captionCleanUpService);

  console.log(`Reading local captions for video: ${videoId}`);
  let autoCaptionsRaw, manualCaptionsRaw;

  try {
    // auto.json is in root as per request
    autoCaptionsRaw = JSON.parse(readFileSync(`auto.json`, "utf8"));
    // manual is in _debug/captions
    manualCaptionsRaw = JSON.parse(readFileSync(`_debug/captions/${videoId}-raw-manual.json`, "utf8"));
  } catch (error: any) {
    console.error(`Failed to read local caption files:`, error.message);
    process.exit(1);
  }

  console.log(`Auto Captions (Raw events): ${autoCaptionsRaw.events?.length || 0}`);
  console.log(`Manual Captions (Raw segments): ${manualCaptionsRaw.length}`);

  const manualResult = await processManualCaptionsService.process(manualCaptionsRaw);
  if (!manualResult.ok) {
    console.log(`Manual captions processing failed: ${manualResult.error.type}`);
    return;
  }

  const similarityResult = await similarityService.calculateSimilarityV2({
    manualCaptions: manualResult.value,
    autoCaptionsRaw: autoCaptionsRaw,
  });

  console.log("\n--- Similarity Check (V2) ---");
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
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
