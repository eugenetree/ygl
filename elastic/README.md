# YouTube Caption Search System (YouGlish Clone)

A search system for finding specific phrases in video captions/subtitles using Elasticsearch. This allows users to search for phrases and jump directly to the moment in the video where those words are spoken.

## Quick Start with Docker

```bash
# 1. Navigate to the elastic folder
cd elastic

# 2. Install dependencies (for local development)
npm install

# 3. Start Elasticsearch, Kibana, and API server
npm run docker:up

# 4. Wait for Elasticsearch to be ready (check logs)
npm run docker:logs

# 5. Initialize the Elasticsearch index
npm run init-index

# 6. Index your captions
npm run index

# The API will be available at http://localhost:3000
# Kibana will be available at http://localhost:5601
# Elasticsearch will be available at http://localhost:9200
```

## Docker Commands

```bash
# Start all services
npm run docker:up

# Stop all services
npm run docker:down

# View logs
npm run docker:logs

# Rebuild containers
npm run docker:build

# Reset everything (removes all data)
npm run docker:reset
```

## Key Features

- **Phrase Search with Slop**: Find phrases even when words have other words between them
- **Exact Timestamp Detection**: Returns the precise moment when the phrase starts
- **Context Windows**: Indexes overlapping caption segments for better search results
- **Highlighting**: Shows matched phrases with context
- **Score-based Ranking**: Better matches appear first

## How It Works

### 1. Data Structure

The system transforms YouTube caption data into Elasticsearch documents with:

- **Full text** for phrase matching
- **Individual words** with positions and timestamps
- **Overlapping windows** for better context

### 2. Search Strategy

When searching for "developer for go":

1. **Exact phrase match** (highest score) - finds "developer for go" exactly
2. **Phrase with slop** - finds "developer [relations] for go"
3. **All words present** - finds all words in any order
4. **Shingle matching** - uses n-grams for better phrase detection

### 3. Elasticsearch Mapping

```json
{
  "caption.text": {
    "type": "text",
    "analyzer": "standard"
  },
  "caption.words": {
    "type": "nested",
    "properties": {
      "text": "developer",
      "position": 5,
      "absolute_time": 12639
    }
  }
}
```

## Installation (Without Docker)

```bash
# Install dependencies
npm install

# Start Elasticsearch manually
docker run -p 9200:9200 -e "discovery.type=single-node" -e "xpack.security.enabled=false" elasticsearch:8.11.0

# Initialize index
npm run init-index

# Start API server
npm start
```

## Usage

```javascript
import { indexCaptions, searchCaptions } from "./example_usage.js";

// Index your captions
const captionsData = // ... your caption JSON
  await indexCaptions(captionsData, "videoId", "Video Title");

// Search for phrases
const results = await searchCaptions("developer for go");

// Results include:
// - exactTime: 12639 (milliseconds)
// - text: "developer relations for Go"
// - highlight: ["<mark>developer</mark> relations <mark>for Go</mark>"]
```

## API Endpoints

```javascript
// Search endpoint
GET http://localhost:3000/api/search?q=developer+for+go&video_id=abc123

// Response
{
  "results": [{
    "videoId": "abc123",
    "timestamp": 12.639,
    "youtubeUrl": "https://youtube.com/watch?v=abc123&t=12s",
    "text": "developer relations for Go",
    "highlight": "...<mark>developer</mark> relations <mark>for Go</mark>..."
  }]
}

// Get video captions
GET http://localhost:3000/api/videos/:videoId/captions?from=0&to=10000

// Autocomplete
GET http://localhost:3000/api/autocomplete?q=devel

// Health check
GET http://localhost:3000/health
```

## Search Examples

1. **Exact phrases**: `"open source project"`
2. **Phrases with gaps**: `"developer for go"` finds "developer relations for go"
3. **Multiple words**: `"cloud infrastructure kubernetes"`

## Project Structure

```
elastic/
├── docker-compose.yml      # Docker configuration
├── Dockerfile             # API server container
├── package.json           # Node.js dependencies
├── api_server.js          # Express API server
├── elasticsearch_mapping.json  # ES index mapping
├── transform_captions.js  # Caption data transformer
├── search_captions.js     # Search query builders
├── example_usage.js       # Usage examples
├── init-index.js         # Index initialization
└── README.md             # This file
```

## Database Design Considerations

### 1. Document Granularity

- **Option A**: One document per caption segment (2-5 seconds)
- **Option B**: Overlapping windows (3-5 caption segments)
- **Option C**: One document per sentence

Recommendation: Use overlapping windows for better context.

### 2. Performance Optimization

- Index only lowercase text for searches
- Store original case for display
- Use nested documents for word-level precision
- Consider using completion suggester for autocomplete

### 3. Scaling Considerations

- Shard by video ID for horizontal scaling
- Use time-based indices for large datasets
- Consider using Elasticsearch's percolator for real-time matching

## Troubleshooting

### Elasticsearch not starting

- Check if port 9200 is already in use
- Ensure Docker has enough memory allocated (at least 2GB)
- Check logs: `docker-compose logs elasticsearch`

### Index initialization fails

- Wait for Elasticsearch to be fully ready (green status)
- Check connection: `curl http://localhost:9200/_cluster/health`

### Search returns no results

- Verify data was indexed: Check in Kibana or use `curl http://localhost:9200/video_captions/_count`
- Check your search query format
- Ensure caption data is in the correct format

## Similar to YouGlish

This system provides the core functionality of YouGlish:

- Search for phrases in video transcripts
- Jump to exact moments where phrases are spoken
- Find real-world usage examples of phrases

The main difference is that YouGlish focuses on pronunciation examples across many videos, while this system can be used for any video content with captions.
