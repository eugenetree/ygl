
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { CaptionsSimilarityService } from "../../src/modules/scrapers/_legacy/captions-similarity-service.js";
import { Caption } from "../../src/modules/youtube-api/youtube-api.types.js";

// Mock Logger
const mockLogger = {
    warn: console.warn,
    info: console.log,
    error: console.error,
    debug: console.debug,
} as any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const videoId = "aUpCBA13Zpo";

    const manualCaptionsPath = `_debug/captions/${videoId}-processed-manual.json`;
    const autoCaptionsPath = `_debug/captions/${videoId}-processed-auto.json`;

    console.log(`Reading manual captions from: ${manualCaptionsPath}`);
    console.log(`Reading auto captions from: ${autoCaptionsPath}`);

    try {
        const manualContent = await readFile(manualCaptionsPath, "utf-8");
        const autoContent = await readFile(autoCaptionsPath, "utf-8");

        const manualJson = JSON.parse(manualContent);
        const autoJson = JSON.parse(autoContent);

        // Normalize manual captions
        // Expecting array of objects. Map to Caption type.
        const manualCaptions: Caption[] = Array.isArray(manualJson)
            ? manualJson.map((c: any) => ({
                startTime: Number(c.startTime),
                endTime: Number(c.endTime),
                duration: Number(c.duration) || (Number(c.endTime) - Number(c.startTime)),
                text: String(c.text),
            }))
            : [];

        // Normalize auto captions
        const autoCaptions: Caption[] = Array.isArray(autoJson)
            ? autoJson.map((c: any) => ({
                startTime: Number(c.startTime),
                endTime: Number(c.endTime),
                duration: Number(c.duration) || (Number(c.endTime) - Number(c.startTime)),
                text: String(c.text),
            }))
            : [];

        console.log(`Loaded ${manualCaptions.length} manual captions.`);
        console.log(`Loaded ${autoCaptions.length} auto captions.`);

        const service = new CaptionsSimilarityService(mockLogger);

        console.log("Calculating similarity...");
        const result = await service.calculateSimilarity({
            manualCaptions,
            autoCaptions
        });

        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

main();
