import "reflect-metadata";
import { YoutubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";
import { YtDlpClient } from "../../src/modules/youtube-api/yt-dlp-client.js";
import { Logger } from "../../src/modules/_common/logger/logger.js";

async function main() {

  const videoId = process.argv[2] ?? "M0pev5yBy-c";

  const logger = new Logger({ context: "debug", category: "debug" });
  const ytDlpClient = new YtDlpClient(logger);

  // Print raw yt-dlp fields relevant to caption detection
  const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);
  const rawResult = await ytDlpClient.execJson<any>([url, "--dump-json", "--no-download", "--skip-download", "--no-warnings"]);
  if (rawResult.ok && rawResult.value[0]) {
    const raw = rawResult.value[0];
    console.log("=== RAW YT-DLP CAPTION FIELDS ===");
    console.log("language:", raw.language);
    console.log("automatic_captions keys:", JSON.stringify(Object.keys(raw.automatic_captions ?? {})));
    console.log("subtitles keys:", Object.keys(raw.subtitles ?? {}));
    console.log("=================================\n");

    console.log("debug: sbuttitles", JSON.stringify(raw.subtitles, null, 2));
  }

  const service = new YoutubeApiGetVideo(logger, ytDlpClient);
  console.log(`Calling getVideo(${videoId})...`);
  const result = await service.getVideo(videoId);
  // console.log(JSON.stringify(result, null, 2));
}

main();
// $ npx tsx debug-get-video.mts 