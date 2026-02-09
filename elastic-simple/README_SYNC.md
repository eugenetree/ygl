# Elasticsearch Sync Tracking - Quick Start

## TL;DR - How to Track Your Index

**Answer:** Store sync metadata in your **PostgreSQL database** using the `elastic_sync_state` table.

### Why Database?
- ✅ Persistent and reliable
- ✅ Easy to query and monitor
- ✅ Transaction support
- ✅ Audit trail included
- ✅ Works even if Elasticsearch is down

---

## Setup (One-Time)

### 1. Run Migrations

```bash
# Option A: Use setup script (recommended)
cd elastic-simple
./setup-sync-tracking.sh

# Option B: Manual
psql -U admin -d saythis -f migrations/001_create_elastic_sync_table.sql
psql -U admin -d saythis -f migrations/002_add_timestamps_to_captions.sql
```

This creates:
- `elastic_sync_state` table - tracks when syncs happen
- `captions.created_at` column - when caption was added
- `captions.updated_at` column - when caption was last modified
- Trigger to auto-update `updated_at`

### 2. Initialize Elasticsearch

```bash
node caption-indexer.js init
```

This:
- Creates Elasticsearch index
- Indexes all existing captions
- Records initial sync in `elastic_sync_state`

---

## Daily Usage

### Option 1: Cron Job (Recommended)

Add to your crontab:

```bash
# Incremental sync every hour
15 * * * * cd /path/to/project && node elastic-simple/caption-indexer.js sync-incremental >> /var/log/es-sync.log 2>&1

# Full verification weekly
0 3 * * 0 cd /path/to/project && node elastic-simple/caption-indexer.js sync >> /var/log/es-full-sync.log 2>&1
```

### Option 2: Application Code

```javascript
import { indexVideoCaption } from './elastic-simple/caption-indexer.js';

// When user uploads video
async function onVideoUploaded(videoId) {
  // 1. Save to database
  await db.saveCaptions(videoId, captions);
  
  // 2. Index in Elasticsearch (real-time!)
  await indexVideoCaption(videoId);
  
  // Done! Video is searchable immediately
}
```

---

## Commands Reference

| Command | When to Use | Speed | Safe? |
|---------|-------------|-------|-------|
| `init` | First time / schema change | Slow | ❌ Deletes index |
| `sync-incremental` | Regular updates | ⚡ Fast | ✅ Yes |
| `sync` | Verification / recovery | 🐌 Slow | ✅ Yes |
| `add-video <id>` | Single video | ⚡ Fast | ✅ Yes |

### Examples

```bash
# First time setup
node caption-indexer.js init

# Daily incremental sync (only changed data)
node caption-indexer.js sync-incremental

# Manual: add one video
node caption-indexer.js add-video "abc123"

# Manual: remove video
node caption-indexer.js delete-video "abc123"

# Recovery: full re-sync
node caption-indexer.js sync
```

---

## How Incremental Sync Works

```
1. Get last sync time from database
   → SELECT last_sync_at FROM elastic_sync_state
   → Result: 2024-01-15 10:00:00

2. Find captions updated since then
   → SELECT * FROM captions WHERE updated_at > '2024-01-15 10:00:00'
   → Result: 47 captions

3. Index only those 47 captions
   → Bulk upsert to Elasticsearch

4. Record new sync time
   → INSERT INTO elastic_sync_state ... NOW()
```

**Benefits:**
- Only syncs what changed (fast!)
- Safe to run frequently (every hour)
- Low database/ES load
- Tracks history automatically

---

## Monitoring

### Check Last Sync

```sql
SELECT 
  sync_type,
  last_sync_at,
  records_synced,
  status
FROM elastic_sync_state
WHERE sync_type = 'captions'
ORDER BY last_sync_at DESC
LIMIT 5;
```

Example output:
```
sync_type | last_sync_at        | records_synced | status
----------+---------------------+----------------+---------
captions  | 2024-01-15 14:15:00 | 47             | success
captions  | 2024-01-15 13:15:00 | 23             | success
captions  | 2024-01-15 12:15:00 | 0              | success
```

### Check for Failures

```sql
SELECT *
FROM elastic_sync_state
WHERE status = 'failed'
ORDER BY last_sync_at DESC
LIMIT 10;
```

### Check Sync Lag

```sql
SELECT 
  NOW() - last_sync_at AS time_since_last_sync
FROM elastic_sync_state
WHERE sync_type = 'captions'
  AND status = 'success'
ORDER BY last_sync_at DESC
LIMIT 1;
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   PostgreSQL                        │
│                                                     │
│  ┌────────────────┐         ┌──────────────────┐  │
│  │    captions    │         │ elastic_sync_    │  │
│  │                │         │      state       │  │
│  │ • id           │         │                  │  │
│  │ • text         │         │ • sync_type      │  │
│  │ • video_id     │         │ • last_sync_at   │  │
│  │ • created_at   │◄────────┤ • status         │  │
│  │ • updated_at   │  tracks │ • records_synced │  │
│  └────────────────┘         └──────────────────┘  │
│         │                            │             │
└─────────┼────────────────────────────┼─────────────┘
          │                            │
          │ 1. Query changed records   │
          │    WHERE updated_at >      │
          │    last_sync_at            │
          │                            │
          ▼                            │
┌─────────────────────────────────────┐│
│       caption-indexer.js            ││
│                                     ││
│  • fetchCaptionsSince()             ││
│  • bulkIndexCaptions()              ││
│  • getLastSyncTime()                ││
│  • recordSyncState()                ││
└─────────────────────────────────────┘│
          │                            │
          │ 2. Bulk index              │
          ▼                            │
┌─────────────────────────────────────┐│
│         Elasticsearch               ││
│                                     ││
│  Index: captions                    ││
│  • One doc per caption              ││
│  • No overlap                       ││
│  • Searchable in real-time          ││
└─────────────────────────────────────┘│
                                       │
                                       │ 3. Record sync
                                       ▼
                            Back to elastic_sync_state
```

---

## Files Created

| File | Purpose |
|------|---------|
| `migrations/001_create_elastic_sync_table.sql` | Create sync tracking table |
| `migrations/002_add_timestamps_to_captions.sql` | Add timestamps to captions |
| `setup-sync-tracking.sh` | One-command setup script |
| `caption-indexer.js` (updated) | Sync functions added |
| `SYNC_TRACKING.md` | Detailed documentation |
| `INDEXING_OPERATIONS.md` | Command reference |

---

## FAQ

### Q: Do I need to delete the index when adding new videos?
**A:** No! Use `add-video <id>` or `sync-incremental`.

### Q: How often should I run sync-incremental?
**A:** Every hour is good. You can run every 15 minutes if needed.

### Q: What if I change caption text in the database?
**A:** The `updated_at` trigger will mark it as changed, and next sync will update Elasticsearch.

### Q: Can I run sync while my app is running?
**A:** Yes! `sync-incremental` and `add-video` are safe to run anytime.

### Q: What if sync fails?
**A:** It's recorded in `elastic_sync_state`. Next sync will retry from last successful timestamp.

### Q: Do I need the cron job if I use `indexVideoCaption()` in my code?
**A:** Cron is a safety net. Use both: real-time indexing + periodic sync to catch anything missed.

---

## Next Steps

1. ✅ Run setup: `./setup-sync-tracking.sh`
2. ✅ Initialize: `node caption-indexer.js init`
3. ✅ Add cron job for `sync-incremental`
4. ✅ Update your app to call `indexVideoCaption()` for new videos
5. ✅ Monitor with SQL queries

**You're all set!** Your Elasticsearch index will stay in sync automatically. 🎉
