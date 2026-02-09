#!/bin/bash

# Setup script for Elasticsearch sync tracking
# Run this once to set up the sync tracking infrastructure

set -e

# Database connection (override with environment variables)
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-saythis}
DB_USER=${DB_USER:-admin}

echo "🔧 Setting up Elasticsearch sync tracking..."
echo "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql is not installed"
    echo "Install PostgreSQL client tools first"
    exit 1
fi

# Run migration 1: Create sync state table
echo "📋 Creating elastic_sync_state table..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
    -f migrations/001_create_elastic_sync_table.sql

if [ $? -eq 0 ]; then
    echo "✅ Sync state table created"
else
    echo "❌ Failed to create sync state table"
    exit 1
fi

echo ""

# Run migration 2: Add timestamps to captions
echo "📋 Adding timestamp columns to captions table..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
    -f migrations/002_add_timestamps_to_captions.sql

if [ $? -eq 0 ]; then
    echo "✅ Timestamp columns added"
else
    echo "❌ Failed to add timestamp columns"
    exit 1
fi

echo ""

# Verify setup
echo "🔍 Verifying setup..."

PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME \
    -c "SELECT COUNT(*) as sync_records FROM elastic_sync_state;" \
    -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'captions' AND column_name IN ('created_at', 'updated_at');"

echo ""
echo "✅ Sync tracking setup complete!"
echo ""
echo "Next steps:"
echo "  1. Initialize Elasticsearch index:"
echo "     node caption-indexer.js init"
echo ""
echo "  2. Set up cron job for incremental sync:"
echo "     15 * * * * cd /app && node caption-indexer.js sync-incremental"
echo ""
echo "  3. Test incremental sync:"
echo "     node caption-indexer.js sync-incremental"
echo ""
