import { writeFileSync } from "fs";
import { youtubeApiGetVideo } from "../src/modules/youtube-api/yt-api-get-video.js";

const VIDEO_ID = "fStLnjrZF_c";

async function fetchVideoCaptions() {
  console.log(`Fetching video data for: ${VIDEO_ID}`);

  const videoResult = await youtubeApiGetVideo.getVideo(VIDEO_ID);

  if (!videoResult.ok) {
    console.error("Failed to fetch video:", videoResult.error);
    process.exit(1);
  }

  const video = videoResult.value;

  console.log("\n=== Video Info ===");
  console.log(`Title: ${video.title}`);
  console.log(`Duration: ${video.duration}s`);
  console.log(`Language: ${video.languageCode}`);
  console.log(`Channel ID: ${video.channelId}`);
  console.log(`Keywords: ${video.keywords?.join(", ") || "none"}`);

  // Save full video data
  const fullDataPath = `_debug/video-${VIDEO_ID}-full.json`;
  writeFileSync(fullDataPath, JSON.stringify(video, null, 2));
  console.log(`\n✅ Full video data saved to: ${fullDataPath}`);

  // Save auto captions
  if (video.autoCaptions) {
    const autoCaptionsPath = `_debug/video-${VIDEO_ID}-auto-captions.json`;
    writeFileSync(
      autoCaptionsPath,
      JSON.stringify(video.autoCaptions, null, 2),
    );
    console.log(
      `✅ Auto captions saved to: ${autoCaptionsPath} (${video.autoCaptions.length} segments)`,
    );
  } else {
    console.log("❌ No auto captions available");
  }

  // Save manual captions
  if (video.manualCaptions) {
    const manualCaptionsPath = `_debug/video-${VIDEO_ID}-manual-captions.json`;
    writeFileSync(
      manualCaptionsPath,
      JSON.stringify(video.manualCaptions, null, 2),
    );
    console.log(
      `✅ Manual captions saved to: ${manualCaptionsPath} (${video.manualCaptions.length} segments)`,
    );
  } else {
    console.log("⚠️  No manual captions available");
  }

  // Save caption comparison
  if (video.autoCaptions && video.manualCaptions) {
    const comparison = {
      videoId: VIDEO_ID,
      title: video.title,
      languageCode: video.languageCode,
      autoCaptionsCount: video.autoCaptions.length,
      manualCaptionsCount: video.manualCaptions.length,
      autoCaptionsText: video.autoCaptions.map((c) => c.text).join(" "),
      manualCaptionsText: video.manualCaptions.map((c) => c.text).join(" "),
    };

    const comparisonPath = `_debug/video-${VIDEO_ID}-comparison.json`;
    writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));
    console.log(`\n✅ Comparison saved to: ${comparisonPath}`);
  }

  console.log("\n✨ Done!");
}

fetchVideoCaptions().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
