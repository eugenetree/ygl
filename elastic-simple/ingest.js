/* global console, process */
import { Client } from "@elastic/elasticsearch";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({ node: "http://localhost:9200" });
const captionsFilePath = path.join(__dirname, "..", "captions.json");
const indexName = "captions";

async function main() {
  try {
    console.log("Connecting to Elasticsearch...");
    await client.ping();
    console.log("Connected to Elasticsearch.");
  } catch (error) {
    console.error("Elasticsearch cluster is down!", error);
    process.exit(1);
  }

  try {
    console.log(`Checking if index "${indexName}" exists...`);
    const indexExists = await client.indices.exists({
      index: indexName,
    });

    if (indexExists) {
      console.log(`Index "${indexName}" already exists. Deleting...`);
      await client.indices.delete({ index: indexName });
    }

    console.log(`Creating index "${indexName}"...`);
    await client.indices.create({
      index: indexName,
      body: {
        mappings: {
          properties: {
            video_id: { type: "keyword" },
            startTime: { type: "long" },
            endTime: { type: "long" },
            duration: { type: "long" },
            textSegments: {
              properties: {
                utf8: { type: "text" },
                offsetTime: { type: "long" },
              },
            },
          },
        },
      },
    });

    console.log("Reading captions data...");
    const captionsData = await fs.readFile(captionsFilePath, "utf8");
    const fullCaptionsData = JSON.parse(captionsData);
    const captions = fullCaptionsData.captions;
    const videoId = fullCaptionsData.id;

    console.log("Preparing data for bulk ingestion...");
    const body = captions.flatMap((doc) => [
      { index: { _index: indexName } },
      { ...doc, video_id: videoId },
    ]);

    console.log("Bulk ingesting data...");
    const bulkResponse = await client.bulk({ refresh: true, body });

    if (bulkResponse.errors) {
      const erroredDocuments = [];
      bulkResponse.items.forEach((action, i) => {
        const operation = Object.keys(action)[0];
        if (action[operation].error) {
          erroredDocuments.push({
            status: action[operation].status,
            error: action[operation].error,
            operation: body[i * 2],
            document: body[i * 2 + 1],
          });
        }
      });
      console.log("Errored documents:", erroredDocuments);
    }

    const count = await client.count({ index: indexName });
    console.log(`Successfully indexed ${count.count} documents.`);
  } catch (err) {
    console.error("An error occurred:", err);
  }
}

main().catch(console.error);
