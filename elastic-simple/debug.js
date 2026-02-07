/* global console */
import { Client } from "@elastic/elasticsearch";

const client = new Client({ node: "http://localhost:9200" });
const indexName = "captions";

async function debug() {
  try {
    // 1. Check if the index exists and get its mapping
    console.log(`Checking mapping for index "${indexName}"...`);
    const mappingResponse = await client.indices.getMapping({
      index: indexName,
    });
    console.log("Index Mapping:");
    console.log(JSON.stringify(mappingResponse[indexName].mappings, null, 2));

    // 2. Fetch the first 5 documents from the index
    console.log("\\nFetching first 5 documents from the index...");
    const searchResponse = await client.search({
      index: indexName,
      size: 5,
      body: {
        query: {
          match_all: {},
        },
      },
    });

    console.log("\\nDocuments:");
    if (searchResponse.hits.hits.length > 0) {
      searchResponse.hits.hits.forEach((hit, i) => {
        console.log(`\\n--- Document ${i + 1} ---`);
        console.log(JSON.stringify(hit._source, null, 2));
      });
    } else {
      console.log("No documents found in the index.");
    }
  } catch (error) {
    console.error("An error occurred during debugging:", error);
  }
}

debug().catch(console.error);
