import "reflect-metadata";

import { Container } from "inversify";
import { readFileSync } from "fs";

import { Logger } from "../_common/logger/logger.js";
import { FindCaptionsUseCase } from "./find-captions.use-case.js";

export const bootstrap = async () => {
  const container = new Container({ autobind: true });

  container.bind(Logger).toDynamicValue(() => {
    return new Logger({
      context: "captions-search",
      category: "find-captions",
    });
  });

  const findCaptionsUseCase = container.get(FindCaptionsUseCase);

  // Get search query from command line arguments
  const query = process.argv.slice(2).join(" ");

  if (!query) {
    console.error("Error: Please provide a search query");
    console.log("Usage: npm run find-captions -- <your search query>");
    process.exit(1);
  }

  console.log(`Searching for: "${query}"`);

  // Log Elasticsearch client version
  try {
    const esPackageJson = JSON.parse(
      readFileSync("node_modules/@elastic/elasticsearch/package.json", "utf-8")
    );
    console.log(`Elasticsearch client version: ${esPackageJson.version}`);
  } catch {
    console.log("Could not determine Elasticsearch client version");
  }
  console.log("");

  const results = await findCaptionsUseCase.execute(query);

  console.log("\n=== Search Results ===\n");
  console.log(`Total hits: ${results.length}\n`);

  results.forEach((hit, index) => {
    console.log(`${index + 1}. Score: ${hit._score}`);
    console.log(`   ID: ${hit._id}`);
    // @ts-expect-error - hit._source is not typed
    const text = hit._source?.text || "N/A";
    // @ts-expect-error - hit._source is not typed
    const videoId = hit._source?.videoId || "N/A";
    console.log(`   Video ID: ${videoId}`);
    console.log(`   Text: ${text}`);
    console.log("");
  });
};

bootstrap();
