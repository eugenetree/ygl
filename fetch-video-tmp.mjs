/**
 * yt-dlp video inspector
 * Usage:  node fetch-video-tmp.mjs [youtube-url-or-video-id]
 * Output: prints all top-level metadata fields + saves full JSON to _debug/
 *
 * Examples:
 *   node fetch-video-tmp.mjs
 *   node fetch-video-tmp.mjs https://www.youtube.com/watch?v=iGeXGdYE7UE
 *   node fetch-video-tmp.mjs dQw4w9WgXcQ
 */

import { YtDlp } from 'ytdlp-nodejs';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_URL = 'https://www.youtube.com/watch?v=iGeXGdYE7UE';
const input = process.argv[2] ?? DEFAULT_URL;

// Accept bare video ID (11 chars) or full URL
const url = input.startsWith('http') ? input : `https://www.youtube.com/watch?v=${input}`;

console.log(`\nFetching: ${url}\n`);

const ytdlp = new YtDlp();
const builder = ytdlp
  .execBuilder(url)
  .addArgs('--dump-json', '--no-download', '--skip-download', '--no-warnings');

builder.debugPrint(false);

const result = await builder.exec();

if (result.exitCode !== 0) {
  console.error('yt-dlp error:', result.stderr);
  process.exit(1);
}

const data = JSON.parse(result.output.trim());

// Save full raw dump
const debugDir = resolve('./_debug');
mkdirSync(debugDir, { recursive: true });
const outPath = resolve(debugDir, `yt-dlp-dump-${data.id}.json`);
writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Full JSON saved to: ${outPath}\n`);

// ─── Pretty-print all top-level fields ───────────────────────────────────────
const LARGE_ARRAYS = new Set(['formats', 'subtitles', 'automatic_captions', 'thumbnails', 'requested_formats', 'requested_subtitles', 'heatmap', '_format_sort_fields', 'http_headers']);

// Fields ygl currently extracts
const EXTRACTED = new Set([
  'id', 'title', 'duration', 'tags', 'channel_id', 'view_count',
  'thumbnail', 'language', 'asr', 'abr', 'acodec', 'audio_channels',
  'audio_quality', 'is_drc', 'categories', 'track', 'artist', 'album', 'creator',
]);

// Fields available but not yet extracted
const AVAILABLE_NEW = new Set([
  'upload_date', 'timestamp', 'description', 'like_count', 'comment_count',
  'channel', 'channel_follower_count', 'channel_is_verified',
  'uploader_id', 'uploader_url', 'availability', 'age_limit',
  'live_status', 'media_type', 'is_live', 'was_live',
  'playable_in_embed', 'chapters', 'release_timestamp', 'release_date',
  'license', 'heatmap',
]);

console.log('═'.repeat(90));
console.log('  STATUS                          FIELD                          VALUE');
console.log('═'.repeat(90));

for (const [k, v] of Object.entries(data)) {
  if (LARGE_ARRAYS.has(k)) {
    const len = Array.isArray(v) ? v.length : (v ? Object.keys(v).length : 0);
    const status = AVAILABLE_NEW.has(k) ? '⚡ available (not extracted)' : '── (skipped)';
    console.log(`  ${status.padEnd(32)} ${k.padEnd(30)} [${len} entries]`);
    continue;
  }

  let status;
  if (EXTRACTED.has(k))          status = '✅ extracted';
  else if (AVAILABLE_NEW.has(k)) status = '⚡ available (not extracted)';
  else                           status = '── internal/other';

  const display = JSON.stringify(v);
  const trimmed = display && display.length > 60 ? display.slice(0, 57) + '...' : display;
  console.log(`  ${status.padEnd(32)} ${k.padEnd(30)} ${trimmed}`);
}

console.log('═'.repeat(90));
console.log(`\nVideo: "${data.title}" (${data.id})`);
console.log(`Channel: ${data.channel} (${data.uploader_id})`);
console.log(`Uploaded: ${data.upload_date} (timestamp: ${data.timestamp} = ${new Date(data.timestamp * 1000).toISOString()})`);
console.log(`Duration: ${data.duration}s  |  Views: ${data.view_count?.toLocaleString()}  |  Likes: ${data.like_count?.toLocaleString()}  |  Comments: ${data.comment_count?.toLocaleString()}`);
console.log(`Availability: ${data.availability}  |  Age limit: ${data.age_limit}  |  Status: ${data.live_status}`);
