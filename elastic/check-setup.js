/* global console, process */
import { Client } from "@elastic/elasticsearch";

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
});

async function checkSetup() {
  console.log("Checking Elasticsearch setup...\n");

  try {
    // 1. Check cluster health
    const health = await client.cluster.health();
    console.log("✓ Elasticsearch is running");
    console.log(`  Status: ${health.status}`);
    console.log(`  Nodes: ${health.number_of_nodes}`);

    // 2. Check if index exists
    const indexName = "video_captions";
    const exists = await client.indices.exists({ index: indexName });

    if (exists) {
      console.log(`✓ Index '${indexName}' exists`);

      // Get index info
      const indexInfo = await client.indices.get({ index: indexName });
      const mapping = indexInfo[indexName].mappings;
      console.log("  Mapping properties:", Object.keys(mapping.properties));

      // Get document count
      const count = await client.count({ index: indexName });
      console.log(`  Documents: ${count.count}`);
    } else {
      console.log(`✗ Index '${indexName}' does not exist`);
      console.log("  Run: npm run init-index");
    }

    // 3. Test connection from API perspective
    console.log("\n✓ Setup check complete!");
  } catch (error) {
    console.error("✗ Error connecting to Elasticsearch:");
    console.error(`  ${error.message}`);
    console.error("\nMake sure Elasticsearch is running:");
    console.error("  npm run docker:up");
    process.exit(1);
  }
}

checkSetup().catch(console.error);
