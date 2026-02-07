/* global console, process */
/* eslint-env node */
// Example usage of the caption search system
import { Client } from "@elastic/elasticsearch";
import { createOverlappingDocuments } from "./transform_captions.js";
import { searchWithSlop, formatSearchResults } from "./search_captions.js";
import elasticsearchMapping from "./elasticsearch_mapping.json" assert { type: "json" };
import { readFileSync } from 'fs';
import path from 'path'; // Added for robust path joining

// Initialize Elasticsearch client
const client = new Client({ node: "http://localhost:9200" });

// 1. Index your caption data
async function indexVideoCaptions(captionsData, videoId, videoTitle) {
  const indexName = "video_captions";

  // Transform captions to documents using overlapping windows
  const documents = createOverlappingDocuments(
    captionsData,
    videoId,
    videoTitle,
    3, // windowSize
  );

  if (documents.length === 0) {
    console.log(`No documents generated for video: ${videoId} - ${videoTitle}. Skipping indexing.`);
    return;
  }

  // Bulk index documents
  const bulkBody = documents.flatMap((doc) => [
    { index: { _index: indexName } },
    doc,
  ]);

  try {
    const response = await client.bulk({ body: bulkBody });
    if (response.errors) {
      console.error(`Error indexing documents for ${videoId}:`, JSON.stringify(response.items.filter(item => item.index?.error), null, 2));
    } else {
      console.log(`Indexed ${documents.length} caption documents for video: ${videoId} - ${videoTitle}`);
    }
    return response;
  } catch (error) {
    console.error(`Failed to bulk index for ${videoId}:`, error);
  }
}

// 2. Search for phrases in captions
async function searchCaptions(searchPhrase) {
  const indexName = "video_captions";
  const searchQuery = searchWithSlop(searchPhrase, 5);
  const response = await client.search({
    index: indexName,
    body: searchQuery,
  });
  const results = formatSearchResults(response, searchPhrase);
  return results;
}

// 3. Get YouTube URL with timestamp
function getYouTubeUrl(videoId, timeInMs) {
  const timeInSeconds = Math.floor(timeInMs / 1000);
  return `https://www.youtube.com/watch?v=${videoId}&t=${timeInSeconds}s`;
}

// 4. Main processing function
async function processAllCaptions() {
  const indexName = "video_captions";

  // Ensure index with mapping exists
  try {
    const indexExists = await client.indices.exists({ index: indexName });
    if (!indexExists) {
      console.log(`Index ${indexName} does not exist. Creating with mapping...`);
      await client.indices.create({
        index: indexName,
        body: elasticsearchMapping
      });
      console.log(`Index ${indexName} created.`);
    } else {
      console.log(`Index ${indexName} already exists.`);
      // Optional: Delete existing documents if you want to re-index fresh each time
      // await client.deleteByQuery({ index: indexName, body: { query: { match_all: {} } } });
      // console.log(`Deleted existing documents from ${indexName}.`);
    }
  } catch (e) {
    // Check if it's a resource_already_exists_exception (less strict than before)
    if (e.meta?.body?.error?.type !== 'resource_already_exists_exception') {
      console.error(`Error ensuring index ${indexName} exists:`, e.meta?.body || e);
      return; // Stop if index cannot be ensured
    }
    console.log(`Index ${indexName} already exists (caught exception).`);
  }

  const captionFilesToProcess = [
    { 
      filePath: '../auto-captions-manual.json', 
      videoId: 'MANUAL_VIDEO_1', 
      videoTitle: 'Manual Captions Video 1' 
    },
    { 
      filePath: '../auto-captions-manual-Z36OznHFIt4.json', 
      videoId: 'Z36OznHFIt4', 
      videoTitle: 'Manual Captions Z36OznHFIt4' 
    },
    // Add more video files here if needed
  ];

  for (const fileInfo of captionFilesToProcess) {
    console.log(`\nProcessing captions from: ${fileInfo.filePath}`);
    try {
      // Construct absolute path if necessary, assuming files are relative to project root
      const absolutePath = path.resolve(process.cwd(), '..', path.basename(fileInfo.filePath)); 
      // Corrected path to be relative to the 'elastic' folder's parent
      const captionsData = JSON.parse(readFileSync(fileInfo.filePath, 'utf8'));
      await indexVideoCaptions(captionsData, fileInfo.videoId, fileInfo.videoTitle);
    } catch (error) {
      console.error(`Could not process file ${fileInfo.filePath}:`, error);
    }
  }

  // Wait for indexing to complete if documents were indexed
  console.log("\nRefreshing index to make documents searchable...");
  await client.indices.refresh({ index: indexName });

  // Example Search
  const searchPhrases = [
    "college football",
    "cutting hair",
    "Hello again, America",
    "CEO of the company"
  ];

  for (const phrase of searchPhrases) {
    console.log(`\n--- Searching for: "${phrase}" ---`);
    try {
      const results = await searchCaptions(phrase);
      if (results.length > 0) {
        results.slice(0, 3).forEach(result => { // Show top 3 results
          const youtubeUrl = getYouTubeUrl(result.videoId, result.exactTime);
          console.log(`  Video: ${result.videoTitle} (${result.videoId})`);
          console.log(`  Best match at: ${youtubeUrl} (Window Start: ${result.startTime}ms)`);
          console.log(`  Text: ${result.text.substring(0, 150)}...`);
          console.log(`  Highlight: ${result.highlight?.[0]?.substring(0,150) || 'N/A'}...`);
          console.log(`  Score: ${result.score}`);
        });
      } else {
        console.log("No results found");
      }
    } catch (error) {
      console.error(`Error searching for "${phrase}":`, error.meta?.body || error.message);
    }
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  processAllCaptions().catch(error => {
    console.error("Critical error in processAllCaptions:", error.meta?.body || error);
  });
}

export { indexVideoCaptions, searchCaptions, getYouTubeUrl, processAllCaptions }; // Export new main function
