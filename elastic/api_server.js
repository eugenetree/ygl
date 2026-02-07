/* global console, process */
import { Client } from "@elastic/elasticsearch";
import express from "express";

import { formatSearchResults, searchWithSlop } from "./search_captions.js";

const app = express();
const port = process.env.PORT || 3000;

// Initialize Elasticsearch client
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
});

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Search endpoint
app.get("/api/search", async (req, res) => {
  try {
    const { q: query, video_id, limit = 20, slop = 5 } = req.query;

    if (!query) {
      return res.status(400).json({ error: "Query parameter is required" });
    }

    // Build search query
    const searchQuery = searchWithSlop(query, parseInt(slop));

    // Add video filter if provided
    if (video_id) {
      searchQuery.query = {
        bool: {
          must: searchQuery.query,
          filter: { term: { video_id: video_id } },
        },
      };
    }

    searchQuery.size = parseInt(limit);

    // Execute search
    const response = await esClient.search({
      index: "video_captions",
      body: searchQuery,
    });

    // Debug: Log the response structure
    console.log("API Server - Response structure:", {
      hasBody: !!response.body,
      hasHits: !!response.hits,
      responseKeys: Object.keys(response),
      bodyKeys: response.body ? Object.keys(response.body) : "no body",
    });

    // Determine the correct response data
    const responseData = response.body || response;

    // Format results
    const results = formatSearchResults(responseData, query);

    // Add YouTube URLs to results
    const resultsWithUrls = results.map((result) => ({
      ...result,
      youtubeUrl: `https://youtube.com/watch?v=${result.videoId}&t=${Math.floor(result.exactTime / 1000)}s`,
      timestampSeconds: result.exactTime / 1000,
    }));

    res.json({
      query,
      total: responseData.hits?.total?.value || 0,
      results: resultsWithUrls,
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get video captions endpoint
app.get("/api/videos/:videoId/captions", async (req, res) => {
  try {
    const { videoId } = req.params;
    const { from = 0, to = null } = req.query;

    const query = {
      bool: {
        filter: [{ term: { video_id: videoId } }],
      },
    };

    // Add time range filter if provided
    if (from || to) {
      const rangeFilter = { range: { "caption.start_time": {} } };
      if (from) rangeFilter.range["caption.start_time"].gte = parseInt(from);
      if (to) rangeFilter.range["caption.start_time"].lte = parseInt(to);
      query.bool.filter.push(rangeFilter);
    }

    const response = await esClient.search({
      index: "video_captions",
      body: {
        query,
        sort: [{ "caption.start_time": "asc" }],
        size: 1000,
      },
    });

    const responseData = response.body || response;
    const captions =
      responseData.hits?.hits?.map((hit) => hit._source.caption) || [];

    res.json({
      videoId,
      captions,
    });
  } catch (error) {
    console.error("Error fetching captions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Autocomplete endpoint
app.get("/api/autocomplete", async (req, res) => {
  try {
    const { q: prefix } = req.query;

    if (!prefix || prefix.length < 2) {
      return res.json({ suggestions: [] });
    }

    const response = await esClient.search({
      index: "video_captions",
      body: {
        suggest: {
          text_suggest: {
            prefix,
            completion: {
              field: "caption.text.completion",
              size: 10,
              skip_duplicates: true,
            },
          },
        },
      },
    });

    const responseData = response.body || response;
    const suggestions =
      responseData.suggest?.text_suggest?.[0]?.options?.map(
        (option) => option.text,
      ) || [];

    res.json({ suggestions });
  } catch (error) {
    console.error("Autocomplete error:", error);
    res.json({ suggestions: [] });
  }
});

// Health check
app.get("/health", async (req, res) => {
  try {
    const esHealth = await esClient.cluster.health();
    const healthData = esHealth.body || esHealth;
    res.json({
      status: "ok",
      elasticsearch: healthData.status,
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(503).json({
      status: "error",
      message: "Elasticsearch connection failed",
    });
  }
});

// Debug endpoint to test ES client behavior
app.get("/debug/es-test", async (req, res) => {
  try {
    // Test 1: Simple search
    const testResponse = await esClient.search({
      index: "video_captions",
      body: {
        query: { match_all: {} },
        size: 1,
      },
    });

    // Test 2: Get client info
    const info = await esClient.info();

    res.json({
      clientVersion: "@elastic/elasticsearch version from package.json",
      elasticsearchVersion: (info.body || info).version,
      responseStructure: {
        hasBody: !!testResponse.body,
        hasDirectHits: !!testResponse.hits,
        responseKeys: Object.keys(testResponse),
        bodyKeys: testResponse.body ? Object.keys(testResponse.body) : null,
      },
      sampleHit:
        testResponse.body?.hits?.hits?.[0] || testResponse.hits?.hits?.[0],
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Caption search API listening at http://localhost:${port}`);
  console.log("Endpoints:");
  console.log("  GET /api/search?q=phrase&video_id=xxx&slop=5");
  console.log("  GET /api/videos/:videoId/captions?from=0&to=10000");
  console.log("  GET /api/autocomplete?q=prefix");
  console.log("  GET /health");
  console.log("  GET /debug/es-test (for debugging)");
});

export default app;
