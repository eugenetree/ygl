// @ts-nocheck

import { readFileSync } from "fs";
import { Logger } from "../../src/modules/_common/logger/logger.js";
import { CaptionCleanUpService } from "../../src/modules/scraping/video/captions/caption-clean-up.service.js";
import { ManualCaptionsValidator } from "../../src/modules/scraping/video/captions/manual-captions.validator.js";
import { CaptionsSimilarityV2Service } from "../../src/modules/scraping/video/captions/captions-similarity-v2.service.js";

const main = async () => {
  const videoId = process.argv[2] || "AzNWmFaOqJI";
  const logger = new Logger({ context: "check-similarity-v2-local", category: "debug" });

  const captionCleanUpService = new CaptionCleanUpService();
  const similarityService = new CaptionsSimilarityV2Service(logger, captionCleanUpService);
  const manualCaptionsValidator = new ManualCaptionsValidator(logger, captionCleanUpService);

  console.log(`Reading local captions for video: ${videoId}`);
  let autoCaptionsRaw, manualCaptionsRaw;

  try {
    // Correct paths for the local files provided in metadata
    autoCaptionsRaw = JSON.parse(readFileSync(`_debug/captions/${videoId}-raw-auto-v2.json`, "utf8"));
    manualCaptionsRaw = JSON.parse(readFileSync(`_debug/captions/${videoId}-raw-manual-v2.json`, "utf8"));
  } catch (error: any) {
    console.error(`Failed to read local caption files:`, error.message);
    process.exit(1);
  }

  console.log(`Auto Captions (Raw events): ${autoCaptionsRaw.events?.length || 0}`);
  console.log(`Manual Captions (Raw segments): ${manualCaptionsRaw.length}`);

  const manualResult = await manualCaptionsValidator.validate(manualCaptionsRaw);
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
