import { Container } from "inversify";
import { YoutubeApiSearchChannelsViaVideos } from "../src/modules/youtube-api/yt-api-search-channels-via-videos.js";
import { Logger } from "../src/modules/_common/logger/logger.js";
import { httpClient, HttpClient } from "../src/modules/_common/http/index.js";
import { writeFileSync } from "fs";

const container = new Container({ autobind: true });

const main = async () => {
  container.bind(Logger).toDynamicValue(() => {
    return new Logger({
      context: "search",
      category: "search",
    });
  });

  container.bind(HttpClient).toConstantValue(httpClient);
  const service = container.get(YoutubeApiSearchChannelsViaVideos);
  console.log("debug: service", service);
  const generator = service.searchChannels({ query: "test" });
  let i = 0;
  for await (const result of generator) {
    writeFileSync(`search-${i}.json`, JSON.stringify(result, null, 2));
    i++;
    console.log("debug: result", result);
  }
}

main();
console.log("debug: done");