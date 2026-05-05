#!/bin/sh
# docker-accent-entrypoint.sh
#
# Usage inside the container (driven by docker-compose or `docker run`):
#
#   No args   → classify the latest file already in /app/_debug/downloads/
#   <videoId> → download audio from YouTube first, then classify
#   <url>     → same but with a full URL
#   <file>    → classify an explicit file path (must be inside the container)
# ---------------------------------------------------------------------------
set -e

INPUT="${1:-}"

DOWNLOADS_DIR="/app/_debug/downloads"
mkdir -p "$DOWNLOADS_DIR"
mkdir -p "/app/_debug/models"

if echo "$INPUT" | grep -qE '^(https?://|[A-Za-z0-9_-]{11}$)'; then
    if echo "$INPUT" | grep -q '^https\?://'; then
        URL="$INPUT"
        VIDEO_ID=$(echo "$INPUT" | sed -E 's/.*(v=|youtu\.be\/)([^&]+).*/\2/')
    else
        URL="https://www.youtube.com/watch?v=$INPUT"
        VIDEO_ID="$INPUT"
    fi

    echo "==> Downloading audio for: $URL"
    yt-dlp \
        --extract-audio \
        --audio-format mp3 \
        --audio-quality 0 \
        --output "$DOWNLOADS_DIR/%(title)s [%(id)s].%(ext)s" \
        --no-playlist \
        "$URL"

    # Find the specific file for this video ID instead of auto-picking the latest,
    # because if yt-dlp skips downloading, the mtime won't be the latest.
    MATCHING_FILE=$(ls "$DOWNLOADS_DIR"/*"[$VIDEO_ID]"* 2>/dev/null | head -n 1)
    
    if [ -n "$MATCHING_FILE" ]; then
        exec python /app/scripts/debug-accent-recognition.py "$MATCHING_FILE"
    else
        exec python /app/scripts/debug-accent-recognition.py
    fi
fi

# Explicit file path supplied
if [ -n "$INPUT" ]; then
    exec python /app/scripts/debug-accent-recognition.py "$INPUT"
fi

# No argument — auto-pick latest download
exec python /app/scripts/debug-accent-recognition.py
