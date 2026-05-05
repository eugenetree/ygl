import "reflect-metadata";
import * as path from "node:path";
import { YtDlpClient } from "../../src/modules/youtube-api/yt-dlp-client.js";
import { Logger } from "../../src/modules/_common/logger/logger.js";

async function main() {
  const input = process.argv[2] ?? "dJgoTcyrFZ4";

  // Accept either a full URL or a bare video ID
  const url = input.startsWith("http") ? input : `https://www.youtube.com/watch?v=${input}`;

  const outputDir = process.argv[3] ?? "./_debug/downloads";
  const outputTemplate = path.join(outputDir, "%(title)s [%(id)s].%(ext)s");

  const logger = new Logger({ context: "debug", category: "debug" });
  const ytDlpClient = new YtDlpClient(logger);

  console.log(`Downloading audio for: ${url}`);
  console.log(`Output directory: ${outputDir}`);

  const result = await ytDlpClient.exec([
    url,
    "--extract-audio",
    "--audio-format", "mp3",
    "--audio-quality", "0",       // best quality
    "--output", outputTemplate,
    "--no-playlist",
  ]);

  if (result.ok) {
    console.log("Download complete.");
  } else {
    console.error("Download failed:");
    console.error(JSON.stringify(result.error, null, 2));
    process.exit(1);
  }
}

main();
// $ npx tsx _debug/scripts/debug-download-audio.ts [videoId|url] [outputDir]
