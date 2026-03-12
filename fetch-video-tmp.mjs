import { YtDlp } from 'ytdlp-nodejs';

const ytdlp = new YtDlp();
const url = 'https://www.youtube.com/watch?v=Sk5x9KZvPBU';

const builder = ytdlp
  .execBuilder(url)
  .addArgs('--dump-json', '--no-download', '--skip-download', '--no-warnings');

builder.debugPrint(false);
const result = await builder.exec();

if (result.exitCode !== 0) {
  console.error('Error:', result.stderr);
  process.exit(1);
}

const data = JSON.parse(result.output.trim());

// Fields to skip (large arrays/objects)
const SKIP = new Set(['formats', 'subtitles', 'automatic_captions', 'thumbnails', 'requested_formats', 'requested_subtitles', 'heatmap']);

// Fields we currently extract in ygl
const CURRENTLY_EXTRACTED = new Set([
  'id', 'title', 'duration', 'tags', 'channel_id', 'view_count',
  'thumbnail', 'language', 'asr', 'abr', 'acodec', 'audio_channels',
  'audio_quality', 'is_drc', 'categories', 'track', 'artist', 'album', 'creator'
]);

// Fields of interest we want to check
const FIELDS_OF_INTEREST = [
  'id', 'title', 'duration', 'tags', 'channel_id', 'view_count',
  'thumbnail', 'language', 'asr', 'abr', 'acodec', 'audio_channels',
  'audio_quality', 'is_drc', 'categories', 'track', 'artist', 'album', 'creator',
  // New fields to check
  'like_count', 'comment_count', 'channel', 'channel_follower_count', 'channel_is_verified',
  'uploader', 'uploader_id', 'uploader_url',
  'upload_date', 'timestamp', 'availability',
  'is_live', 'was_live', 'live_status',
  'age_limit', 'playable_in_embed',
  'chapters', 'license', 'release_date', 'release_timestamp', 'media_type',
  'heatmap', 'description'
];

console.log('\n=== TOP-LEVEL KEYS IN JSON (excluding large arrays) ===\n');
for (const [k, v] of Object.entries(data)) {
  if (!SKIP.has(k)) {
    const display = JSON.stringify(v);
    console.log(`  ${k}: ${display?.slice(0, 100)}`);
  }
}

console.log('\n=== FIELDS OF INTEREST ===\n');
for (const field of FIELDS_OF_INTEREST) {
  const present = field in data;
  const value = data[field];
  const isExtracted = CURRENTLY_EXTRACTED.has(field);
  const status = !present ? '❌ ABSENT' : isExtracted ? '✅ EXTRACTED' : '⚡ AVAILABLE (not extracted)';
  const displayVal = field === 'description' ? (JSON.stringify(value)?.slice(0, 80) + '...') : JSON.stringify(value)?.slice(0, 100);
  console.log(`  ${status.padEnd(30)} ${field.padEnd(30)} = ${displayVal}`);
}

// Check heatmap separately
const hasHeatmap = 'heatmap' in data && Array.isArray(data.heatmap);
console.log(`\n  ${(hasHeatmap ? '⚡ AVAILABLE (not extracted)' : '❌ ABSENT').padEnd(30)} ${'heatmap'.padEnd(30)} = ${hasHeatmap ? `Array with ${data.heatmap.length} entries` : 'null/missing'}`);
