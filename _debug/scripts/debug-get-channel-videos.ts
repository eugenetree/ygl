import "reflect-metadata";
import { YoutubeApiGetChannelVideoEntries } from "../../src/modules/youtube-api/yt-api-get-channel-video-entries.js";
import { YtDlpClient } from "../../src/modules/youtube-api/yt-dlp-client.js";
import { Logger } from "../../src/modules/_common/logger/logger.js";

async function main() {
  const channelId = process.argv[2] ?? "UCXdjQR0BLGlXQU4tqTrpWAw";
  const limit = parseInt(process.argv[3] ?? "20", 10);

  const logger = new Logger({ context: "debug", category: "debug" });
  const ytDlpClient = new YtDlpClient(logger);
  const service = new YoutubeApiGetChannelVideoEntries(logger, ytDlpClient);

  console.log(`Getting first ${limit} videos for channel ${channelId}...`);

  const entries: unknown[] = [];

  for await (const result of service.getChannelVideoEntries({ channelId })) {
    if (!result.ok) {
      console.error("Error:", JSON.stringify(result.error, null, 2));
      break;
    }

    if (result.value.status === "done") break;

    for (const entry of result.value.chunk) {
      entries.push(entry);
      if (entries.length >= limit) break;
    }

    if (entries.length >= limit) break;
  }

  console.log(JSON.stringify(entries, null, 2));
  console.log(`\nTotal: ${entries.length} entries`);
}

main();
// $ npx tsx _debug/scripts/debug-get-channel-videos.ts <channelId> <limit>
