import { youtubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";

const main = async () => {
    // k5UmYDkN6Dk has CC1 and DTVCC1 tracks
    const result = await youtubeApiGetVideo.getVideo("k5UmYDkN6Dk");

    if (!result.ok) {
        console.error("Failed to get video:", result.error);
        return;
    }

    console.log("Caption Status:", result.value.captionStatus);
    console.log("Manual Captions Count:", result.value.manualCaptions?.length ?? 0);
    console.log("Auto Captions Count:", result.value.autoCaptions?.length ?? 0);
}

main();
