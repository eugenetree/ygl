#!/bin/sh
# docker-audio-analysis-entrypoint.sh
set -e

INPUT="${1:-}"

DOWNLOADS_DIR="/app/_debug/downloads"
mkdir -p "$DOWNLOADS_DIR"
mkdir -p "/app/_debug/models"

# If the arg looks like a YouTube video ID or URL, download audio first
if echo "$INPUT" | grep -qE '^(https?://|[A-Za-z0-9_-]{11}$)'; then
    if echo "$INPUT" | grep -q '^https\?://'; then
        URL="$INPUT"
    else
        URL="https://www.youtube.com/watch?v=$INPUT"
    fi

    echo "==> Downloading audio for: $URL"
    yt-dlp \
        --extract-audio \
        --audio-format mp3 \
        --audio-quality 0 \
        --output "$DOWNLOADS_DIR/%(title)s [%(id)s].%(ext)s" \
        --no-playlist \
        "$URL"

    # Run analysis without an explicit path — it auto-picks the latest file
    exec python /app/scripts/debug-audio-analysis.py
fi

# Explicit file path supplied
if [ -n "$INPUT" ]; then
    exec python /app/scripts/debug-audio-analysis.py "$INPUT"
fi

# No argument — auto-pick latest download
exec python /app/scripts/debug-audio-analysis.py
