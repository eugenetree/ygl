/* global console, process */
import { Client } from "@elastic/elasticsearch";

const client = new Client({ node: "http://localhost:9200" });
const indexName = "captions";

async function search(query, slop = 0) {
  if (!query) {
    console.error("Please provide a search query.");
    process.exit(1);
  }

  console.log(
    `Searching for "${query}" (boosting phrases with slop=${slop})...`,
  );

  try {
    const response = await client.search({
      index: indexName,
      body: {
        query: {
          bool: {
            must: {
              match: {
                "textSegments.utf8": {
                  query: query,
                  operator: "and",
                },
              },
            },
            should: {
              match_phrase: {
                "textSegments.utf8": {
                  query: query,
                  slop: slop,
                },
              },
            },
          },
        },
      },
    });

    console.log("Search results:");
    if (response.hits.hits.length > 0) {
      response.hits.hits.forEach((hit) => {
        console.log({
          video_id: hit._source.video_id,
          startTime: hit._source.startTime,
          text: hit._source.textSegments.map((s) => s.utf8).join("\\n"),
          score: hit._score,
        });
      });
    } else {
      console.log("No results found.");
    }
  } catch (error) {
    console.error("An error occurred during the search:", error);
  }
}

const query = process.argv[2];
const slop = parseInt(process.argv[3] || "0", 10);
search(query, slop).catch(console.error);
