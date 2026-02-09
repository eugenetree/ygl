import { writeFile } from "fs/promises";
import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import type { Database } from "./src/db/types.js";

// Database connection
// When running inside Docker, use 'db' as host (the service name)
// When running locally, use 'localhost'
const dialect = new PostgresDialect({
  pool: new pg.Pool({
    database: "saythis",
    host: process.env.DB_HOST || "db",
    user: "admin",
    password: "admin",
    port: 5432,
    max: 10,
  }),
});

const dbClient = new Kysely<Database>({
  dialect,
  plugins: [new CamelCasePlugin()],
});

async function exportCaptions() {
  console.log("Fetching captions from database...");

  try {
    // Fetch all captions
    const captions = await dbClient
      .selectFrom("captions")
      .selectAll()
      .orderBy("createdAt", "asc")
      .execute();

    console.log(`Found ${captions.length} captions`);

    // Convert dates to ISO strings for JSON serialization
    const captionsJSON = captions.map((caption) => ({
      ...caption,
      createdAt: caption.createdAt.toISOString(),
      updatedAt: caption.updatedAt.toISOString(),
    }));

    // Save to JSON file
    await writeFile(
      "captions.json",
      JSON.stringify(captionsJSON, null, 2),
      "utf-8"
    );

    console.log("✅ Captions saved to captions.json");

    // Print some stats
    const totalWords = captions.reduce((sum, caption) => {
      return sum + caption.text.split(/\s+/).filter(Boolean).length;
    }, 0);

    const uniqueVideos = new Set(captions.map((c) => c.videoId)).size;

    console.log("\nStats:");
    console.log(`  Total captions: ${captions.length}`);
    console.log(`  Total words: ${totalWords.toLocaleString()}`);
    console.log(`  Unique videos: ${uniqueVideos}`);
    console.log(`  Avg captions per video: ${(captions.length / uniqueVideos).toFixed(1)}`);
  } catch (error) {
    console.error("❌ Error fetching captions:", error);
    process.exit(1);
  } finally {
    await dbClient.destroy();
  }
}

exportCaptions();
