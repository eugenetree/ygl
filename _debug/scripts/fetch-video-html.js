import { writeFileSync } from "fs";

const VIDEO_ID = "dXE4qZmKRW0";

const main = async () => {
    const url = `https://www.youtube.com/youtubei/v1/player`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
            "X-YouTube-Client-Name": "3",
            "X-YouTube-Client-Version": "20.10.38",
        },
        body: JSON.stringify({
            context: {
                client: {
                    clientName: "ANDROID",
                    clientVersion: "20.10.38",
                    androidSdkVersion: 30,
                },
            },
            videoId: VIDEO_ID,
        }),
    });

    if (!response.ok) {
        console.error("Failed to fetch video data:", response.status, response.statusText);
        return;
    }

    const json = await response.text();
    writeFileSync(`_debug/html/${VIDEO_ID}.json`, json);
    console.log(`Saved JSON (${json.length} bytes) to _debug/html/${VIDEO_ID}.json`);
};

main();
