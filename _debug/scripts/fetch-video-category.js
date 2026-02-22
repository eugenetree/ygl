import { writeFileSync } from "fs";

const VIDEO_ID = process.argv[2] ?? "aRrfkiBrgtM";

const main = async () => {
    const response = await fetch("https://www.youtube.com/youtubei/v1/player", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            context: {
                client: {
                    clientName: "WEB",
                    clientVersion: "2.20240101",
                },
            },
            videoId: VIDEO_ID,
        }),
    });

    if (!response.ok) {
        console.error("Failed to fetch video data:", response.status, response.statusText);
        return;
    }

    const json = await response.json();

    const category = json?.microformat?.playerMicroformatRenderer?.category;
    const title = json?.videoDetails?.title;
    const author = json?.videoDetails?.author;

    console.log(`Video ID : ${VIDEO_ID}`);
    console.log(`Title    : ${title}`);
    console.log(`Author   : ${author}`);
    console.log(`Category : ${category ?? "(not found)"}`);
};

main();
