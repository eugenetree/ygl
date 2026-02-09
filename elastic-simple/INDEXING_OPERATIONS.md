# Elasticsearch Indexing Operations Guide

## Quick Reference

| Operation | When to Use | Deletes Data? | Use Case |
|-----------|-------------|---------------|----------|
| `init` / `reindex` | First setup OR schema change | ✅ YES - Deletes entire index | Initial setup, mapping changes |
| `sync` | Regular updates | ❌ NO - Adds/updates only | Daily sync, bulk updates |
| `add-video` | New video added | ❌ NO - Adds one video | Single video processing |
| `delete-video` | Video removed | ✅ YES - Only that video | User deletes video |
| `delete-caption` | Caption removed | ✅ YES - Only that caption | Caption correction |

---

## Commands

### 1. `init` or `reindex` - Full Re-Index (⚠️ Destructive)

**When to use:**
- ✅ First time setup
- ✅ Changed index mappings/schema
- ✅ Data corruption recovery
- ✅ Major cleanup needed

**What it does:**
1. Deletes the entire index
2. Recreates with fresh mappings
3. Indexes all captions from database

**Example:**
```bash
node caption-indexer.js init
# or
node caption-indexer.js reindex
```

**⚠️ Warning:** Deletes everything! Your app will have no search until this completes.

---

### 2. `sync` - Incremental Sync (Safe)

**When to use:**
- ✅ Daily/hourly sync from database
- ✅ After adding multiple videos
- ✅ Regular maintenance
- ✅ When you don't want downtime

**What it does:**
1. Creates index if it doesn't exist
2. Adds new captions (by ID)
3. Updates existing captions if text changed
4. Does NOT delete anything

**Example:**
```bash
node caption-indexer.js sync
```

**Note:** If a caption was deleted from DB, it stays in Elasticsearch. Use `delete-video` to remove.

---

### 3. `add-video` - Index Single Video (Safe)

**When to use:**
- ✅ User uploads a new video
- ✅ Just scraped a video's captions
- ✅ Need to update one video's captions
- ✅ Real-time indexing

**What it does:**
1. Queries database for video's captions
2. Indexes/updates all captions for that video
3. Fast - only processes one video

**Example:**
```bash
node caption-indexer.js add-video "video123"
```

**Programmatic use:**
```javascript
import { indexVideoCaption } from './caption-indexer.js';

// When new video is processed
const count = await indexVideoCaption(videoId);
console.log(`Indexed ${count} captions`);
```

---

### 4. `delete-video` - Remove Video Captions

**When to use:**
- ✅ User deletes a video
- ✅ Video no longer available
- ✅ Need to remove video from search

**What it does:**
1. Deletes all captions with matching video_id
2. Returns count of deleted captions

**Example:**
```bash
node caption-indexer.js delete-video "video123"
```

**Programmatic use:**
```javascript
import { deleteVideoCaptions } from './caption-indexer.js';

// When video is deleted
const deleted = await deleteVideoCaptions(videoId);
console.log(`Removed ${deleted} captions`);
```

---

### 5. `delete-caption` - Remove Single Caption

**When to use:**
- ✅ Caption was incorrect/spam
- ✅ User edited/removed a caption
- ✅ Fine-grained control

**What it does:**
1. Deletes one specific caption by ID
2. Silent if caption doesn't exist

**Example:**
```bash
node caption-indexer.js delete-caption "caption456"
```

---

## Common Workflows

### Initial Setup
```bash
# 1. Start Elasticsearch
docker-compose up -d

# 2. Initialize index
node caption-indexer.js init

# 3. Verify
curl localhost:9200/captions/_count
```

### New Video Processing Pipeline
```javascript
// When scraper finishes processing a video
async function processNewVideo(videoId) {
  // 1. Save captions to database
  await saveCaptionsToDb(videoId, captions);
  
  // 2. Index in Elasticsearch (no wait)
  await indexVideoCaption(videoId);
  
  // 3. Video is now searchable!
}
```

### Daily Sync (Cron Job)
```bash
# Runs daily at 2 AM to sync any missed updates
0 2 * * * cd /app && node caption-indexer.js sync >> /var/log/es-sync.log 2>&1
```

### Schema Change (Mapping Update)
```bash
# 1. Stop app temporarily (or accept search downtime)

# 2. Re-index with new schema
node caption-indexer.js reindex

# 3. Start app again
```

### Video Deletion Flow
```javascript
async function deleteVideo(videoId) {
  // 1. Delete from database
  await db.query('DELETE FROM captions WHERE video_id = $1', [videoId]);
  await db.query('DELETE FROM videos WHERE id = $1', [videoId]);
  
  // 2. Delete from Elasticsearch
  await deleteVideoCaptions(videoId);
  
  // Video removed from search!
}
```

---

## Elasticsearch Index vs Create

The code uses **`index`** operation (not `create`):

```javascript
{ index: { _index: indexName, _id: caption.id } }
```

### What this means:

- **If document exists:** Updates it (upsert)
- **If document doesn't exist:** Creates it
- **Never fails:** Always succeeds

This is perfect for `sync` operations where you don't know what's new vs updated.

### Alternative: `create`
```javascript
{ create: { _index: indexName, _id: caption.id } }
```
- **If document exists:** Fails with error
- **If document doesn't exist:** Creates it
- Use when you want to ensure no overwrites

---

## Performance Tips

### Bulk Operations
The code batches operations (1000 at a time):
```javascript
const batchSize = 1000;
```

**Guidelines:**
- Small datasets (<10k): Keep default
- Large datasets (>100k): Increase to 5000
- Very large (>1M): Increase to 10000 + tune heap size

### Refresh Strategy
```javascript
const bulkResponse = await esClient.bulk({ refresh: false, body });
```

- `refresh: false` - Faster (default), documents searchable within 1 second
- `refresh: true` - Slower, documents immediately searchable
- `refresh: 'wait_for'` - Waits until refresh cycle

After bulk operation:
```javascript
await esClient.indices.refresh({ index: indexName });
```
Forces immediate searchability.

---

## Troubleshooting

### Index doesn't exist
```bash
# Create it
node caption-indexer.js init
```

### Captions not appearing in search
```bash
# Check if indexed
curl localhost:9200/captions/_count

# Refresh index
curl -X POST localhost:9200/captions/_refresh

# Re-sync
node caption-indexer.js sync
```

### Wrong mapping/schema
```bash
# Delete and recreate (loses data!)
node caption-indexer.js reindex
```

### One video out of sync
```bash
# Re-index just that video
node caption-indexer.js add-video "problemVideoId"
```

---

## Summary

**For your daily workflow:**

1. **First time:** `node caption-indexer.js init`
2. **Add new video:** `indexVideoCaption(videoId)` in your code
3. **Delete video:** `deleteVideoCaptions(videoId)` in your code  
4. **Safety sync:** `node caption-indexer.js sync` (cron job)
5. **Schema change:** `node caption-indexer.js reindex` (rare)

**You do NOT need to delete the index for regular operations!**
