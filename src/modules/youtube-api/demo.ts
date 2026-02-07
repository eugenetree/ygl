import { YoutubeApiGetChannelVideos } from "./yt-api-get-channel-videos.js";

async function main() {
  const channelVideosGenerator =
    new YoutubeApiGetChannelVideos().getChannelVideos(
      "UCQdpAQtq4GasafYt5ap9oaQ",
    );

  for await (const channelVideoResult of channelVideosGenerator) {
    if (!channelVideoResult.ok) {
      console.log(channelVideoResult.error);

      return;
    }

    console.log(channelVideoResult.value);

    if (channelVideoResult.value.status === "done") {
      console.log("Done");

      return;
    }

    if (channelVideoResult.value.status === "found") {
      console.log(channelVideoResult.value.video);
    }
  }
}

main();
