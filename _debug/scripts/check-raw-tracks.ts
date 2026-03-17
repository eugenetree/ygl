// @ts-nocheck

import { youtubeApiGetVideo } from "../../src/modules/youtube-api/yt-api-get-video.js";
import { channelVideoDetailsExtractor } from "../../src/modules/youtube-api/extractors/channel-video.exctractor.js";
import { httpClient } from "../../src/modules/_common/http/index.js";

const main = async () => {
    const videoId = "k_GIh-HpFSs";
    const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);
    const watchPageResponseResult = await httpClient.get(url);

    if (!watchPageResponseResult.ok) {
        console.log("err", watchPageResponseResult.error);
        return;
    }

    const innerTubeApiKeyResult =
        channelVideoDetailsExtractor.extractInnerTubeApiKey(
            watchPageResponseResult.value,
        );

    if (!innerTubeApiKeyResult.ok) {
        console.log("err api key");
        return;
    }

    const innerTubeApiKey = innerTubeApiKeyResult.value;

    const innerTubeResult = await httpClient.post(
        `https://www.youtube.com/youtubei/v1/player?key=${innerTubeApiKey}`,
        {
            body: {
                context: {
                    client: { clientName: "ANDROID", clientVersion: "20.10.38" },
                },
                videoId: videoId,
            },
        },
    );

    if (!innerTubeResult.ok) {
        console.log("err post");
        return;
    }

    const captionsData = innerTubeResult.value.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (captionsData) {
        console.log("Raw Caption Tracks from YouTube:");
        console.log(JSON.stringify(captionsData, null, 2));
    } else {
        console.log("No captionTracks found in the response.");
    }
}

main();
