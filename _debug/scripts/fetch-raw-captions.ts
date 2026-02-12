import { writeFileSync } from "fs";
import { youtubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";

const main = async () => {
  const result = await youtubeApiGetVideo.getVideo("bnhB3I7-ebo");
  if (!result.ok) {
    console.error("Failed to fetch video:", result.error);
    return;
  }

  const video = result.value;

  writeFileSync(`_debug/captions/${video.id}-raw-manual.json`, JSON.stringify(video.manualCaptions, null, 2));
  writeFileSync(`_debug/captions/${video.id}-raw-auto.json`, JSON.stringify(video.autoCaptions, null, 2));
}

main();