import { writeFileSync } from "fs";
import { youtubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";
import { ProcessAutoCaptionsService } from "../../src/modules/scrapers/channel-videos/initial-scan/process-auto-captions.service.js";
import { Logger } from "../../src/modules/_common/logger/logger.js";
import { CaptionCleanUpService } from "../../src/modules/scrapers/channel-videos/initial-scan/caption-clean-up.service.js";
import { ProcessManualCaptionsService } from "../../src/modules/scrapers/channel-videos/initial-scan/process-manual-captions.service.js";

const main = async () => {
  const result = await youtubeApiGetVideo.getVideo("xrkPe-9rM1Q");
  if (!result.ok) {
    console.error("Failed to fetch video:", result.error);
    return;
  }

  const video = result.value;

  console.log("debug: manualCaptions", video.manualCaptions?.length);
  console.log("debug: autoCaptions", video.autoCaptions?.length);

  writeFileSync(`_debug/captions/${video.id}-raw-manual.json`, JSON.stringify(video.manualCaptions, null, 2));
  writeFileSync(`_debug/captions/${video.id}-raw-auto.json`, JSON.stringify(video.autoCaptions, null, 2));

  const autoCaptionsResult = await new ProcessAutoCaptionsService(new Logger({ context: "fetch-raw-captions" }), new CaptionCleanUpService()).process(video.autoCaptions || []);
  if (autoCaptionsResult.ok) {
    writeFileSync(`_debug/captions/${video.id}-processed-auto.json`, JSON.stringify(autoCaptionsResult.value, null, 2));
  }

  const manualCaptionsResult = await new ProcessManualCaptionsService(new Logger({ context: "fetch-raw-captions" }), new CaptionCleanUpService()).process(video.manualCaptions || []);
  if (manualCaptionsResult.ok) {
    writeFileSync(`_debug/captions/${video.id}-processed-manual.json`, JSON.stringify(manualCaptionsResult.value, null, 2));
  } else {
    console.error("Failed to process manual captions:", manualCaptionsResult.error);
  }
}

main();