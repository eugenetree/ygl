import "reflect-metadata";
import { YoutubeApiGetChannel } from "../../src/modules/youtube-api/yt-api-get-channel.js";
import { httpClient } from "../../src/modules/_common/http/index.js";

async function main() {
  const channelId = process.argv[2] ?? "UCm3FgJ2Hqm7tb70T-GfwXVA";

  const service = new YoutubeApiGetChannel(httpClient);
  console.log(`Calling getChannel(${channelId})...`);
  const result = await service.getChannel(channelId);
  console.log(JSON.stringify(result, null, 2));
}

main();
// $ npx tsx _debug/scripts/debug-get-channel.ts <channelId>
