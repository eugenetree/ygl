import { writeFileSync, mkdirSync } from "fs";
import { YoutubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";
import { ProcessAutoCaptionsService } from "../../src/modules/scrapers/video/captions/process-auto-captions.service.js";
import { Logger } from "../../src/modules/_common/logger/logger.js";
import { CaptionCleanUpService } from "../../src/modules/scrapers/video/captions/caption-clean-up.service.js";
import { YtDlpClient } from "../../src/modules/youtube-api/yt-dlp-client.js";

const main = async () => {
  const videoId = process.argv[2] || "TpT37dWYG6I";
  const result = await new YoutubeApiGetVideo(new Logger({ context: "fetch-raw-captions", category: "debug" }), new YtDlpClient(new Logger({ context: "fetch-raw-captions", category: "debug" }))).getVideo(videoId);
  if (!result.ok) {
    console.error("Failed to fetch video:", result.error);
    return;
  }

  const video = result.value;

  console.log("debug: manualCaptions", video.manualCaptions?.length);
  console.log("debug: autoCaptions", video.autoCaptions?.length);

  mkdirSync(`_debug/captions`, { recursive: true });
  writeFileSync(`_debug/captions/${video.id}-raw-manual.json`, JSON.stringify(video.manualCaptions, null, 2));
  writeFileSync(`_debug/captions/${video.id}-raw-auto.json`, JSON.stringify(video.autoCaptions, null, 2));

  const autoCaptionsResult = await new ProcessAutoCaptionsService(new Logger({ context: "fetch-raw-captions" }), new CaptionCleanUpService()).process(video.autoCaptions || []);
  if (autoCaptionsResult.ok) {
    writeFileSync(`_debug/captions/${video.id}-processed-auto.json`, JSON.stringify(autoCaptionsResult.value, null, 2));
  }

  const manualCaptionsResult: any[] = [];
  if (manualCaptionsResult.length > 0) {
    writeFileSync(`_debug/captions/${video.id}-processed-manual.json`, JSON.stringify(manualCaptionsResult, null, 2));
  } else {
    console.log("No manual captions found or processed correctly for this video.");
  }
}

main();