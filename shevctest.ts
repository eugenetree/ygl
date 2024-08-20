import { youtubeApi } from "./src/modules/youtube-api/youtube-api.client";
import fs from "fs";

const main = async () => {
  const data = await youtubeApi.getChannelInfo("UCM7-8EfoIv0T9cCI4FhHbKQ");
  // fs.writeFileSync(`_debug/${+new Date()}.json`, JSON.stringify(data, null, 2));
};

main();
