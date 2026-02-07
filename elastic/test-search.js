/* global console, process */
import { Client } from "@elastic/elasticsearch";

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
});

async function testSearch() {
  const indexName = "video_captions";

  try {
    // 1. Check if index exists and has documents
    const count = await client.count({ index: indexName });
    console.log(`Total documents in index: ${count.count}`);

    if (count.count === 0) {
      console.log("No documents found. Please run: npm run index");
      return;
    }

    // 2. Do a simple match_all query to see document structure
    console.log("\n--- Sample Document ---");
    const sampleResponse = await client.search({
      index: indexName,
      body: {
        query: { match_all: {} },
        size: 1,
      },
    });

    console.log(
      "Sample document:",
      JSON.stringify(sampleResponse.hits.hits[0], null, 2),
    );

    // 3. Test phrase search
    console.log("\n--- Testing Phrase Search ---");
    const testPhrase = "developer for go";
    const searchResponse = await client.search({
      index: indexName,
      body: {
        query: {
          match_phrase: {
            "caption.text": {
              query: testPhrase,
              slop: 5,
            },
          },
        },
        highlight: {
          fields: {
            "caption.text": {},
          },
        },
        size: 5,
      },
    });

    console.log(
      `Found ${searchResponse.hits.total.value} results for "${testPhrase}"`,
    );

    searchResponse.hits.hits.forEach((hit, index) => {
      console.log(`\nResult ${index + 1}:`);
      console.log(`  Score: ${hit._score}`);
      console.log(`  Text: ${hit._source.caption.text}`);
      console.log(`  Start time: ${hit._source.caption.start_time}ms`);
      if (hit.highlight) {
        console.log(`  Highlight: ${hit.highlight["caption.text"]}`);
      }
    });
  } catch (error) {
    console.error("Error during search test:", error);
  }
}

testSearch().catch(console.error);
