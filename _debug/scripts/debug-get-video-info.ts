import "reflect-metadata";
import { YoutubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";
import { YtDlpClient } from "../../src/modules/youtube-api/yt-dlp-client.js";
import { Logger } from "../../src/modules/_common/logger/logger.js";

async function main() {
  const videoId = process.argv[2] ?? "xV7WFTe5j7o";

  const logger = new Logger({ context: "debug", category: "debug" });
  const ytDlpClient = new YtDlpClient(logger);
  const service = new YoutubeApiGetVideo(logger, ytDlpClient);

  console.log(`Calling getVideo(${videoId})...`);
  const result = await service.getVideo(videoId);
  if (result.ok) {
    const { autoCaptions, manualCaptions, ...videoData } = result.value as any;
    console.log(JSON.stringify(videoData, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

main();
// $ npx tsx _debug/scripts/debug-get-video-info.ts <videoId>
