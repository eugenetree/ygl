import { dbClient } from "./db";
import { youtubeApiClient } from "./modules/youtube-api";
import { youtubeScraper } from "./modules/youtube-scraper";
import fs from "fs";

const main = async () => {
  // fs.writeFileSync(
  //   "test.json",
  //   JSON.stringify(await youtubeApi.searchVideos("dota 2"), null, 2)
  //   // JSON.stringify(await youtubeScraper.getSearchResults("javascript"), null, 2)
  // );

  let i = 0;

  // while (true) {
  // console.log(`iteration: ${i}, sending request`);
  const result = await youtubeApiClient.getChannelInfo(
    "UCM7-8EfoIv0T9cCI4FhHbKQ"
  );
  if (!result.ok) {
    console.log("channel not received");
    return;
  }

  const channel = result.value;
  const vidResult = await youtubeApiClient.getChannelVideos(channel.id);
  if (vidResult.ok) {
    console.log("yes");
    console.log(vidResult.value);
  } else {
    console.log("no");
    console.log(vidResult.error);
  }

  // const c = await youtubeApiClient.getChannelVideos("UCM7-8EfoIv0T9cCI4FhHbKQ");
  // fs.writeFileSync(
  //   `_debug/getChannelVideos-UCM7-8EfoIv0T9cCI4FhHbKQ-${+new Date()}.json`,
  //   JSON.stringify(c, null, 2)
  // );

  // console.log(`iteration: ${i}, received response`, c);
  // i++;
  // }
};

main();
