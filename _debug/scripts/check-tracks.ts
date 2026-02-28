
import { channelVideoDetailsExtractor } from "../../src/modules/youtube-api/extractors/channel-video.exctractor.js";
import { httpClient } from "../../src/modules/_common/http/index.js";

const main = async () => {
    const videoId = "6EfrNmX0RCA";
    const url = encodeURI(`https://youtube.com/watch?v=${videoId}`);
    const watchPageResponseResult = await httpClient.get(url);

    if (!watchPageResponseResult.ok) {
        console.log("err");
        return;
    }

    const innerTubeApiKeyResult =
        channelVideoDetailsExtractor.extractInnerTubeApiKey(
            watchPageResponseResult.value,
        );

    if (!innerTubeApiKeyResult.ok) {
        console.log("err");
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
        console.log("err");
        return;
    }

    const videoDetailsResult =
        channelVideoDetailsExtractor.extractFromInnerTubeJson(
            innerTubeResult.value,
        );

    if (!videoDetailsResult.ok) {
        console.log("err");
        return;
    }

    const videoDetails = videoDetailsResult.value;
    const tracks = videoDetails.captionTracksUrls;

    console.log("Keys:", Object.keys(tracks));
    console.log("Tracks en:", tracks['en']);
    for (const [lang, track] of Object.entries(tracks)) {
        if (track.manual) {
            console.log(`Manual track found for lang:`, lang);
        }
        if (track.auto) {
            console.log(`Auto track found for lang:`, lang);
        }
    }
}

main();
