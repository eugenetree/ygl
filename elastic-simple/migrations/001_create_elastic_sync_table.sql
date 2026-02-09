-- Track Elasticsearch sync state
CREATE TABLE IF NOT EXISTS elastic_sync_state (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(50) NOT NULL,  -- 'captions', 'videos', etc.
  last_sync_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'success',  -- 'success', 'failed', 'in_progress'
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB,  -- Store additional info (video_id, etc.)
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX idx_elastic_sync_type ON elastic_sync_state(sync_type);
CREATE INDEX idx_elastic_sync_last_sync ON elastic_sync_state(last_sync_at);

-- Function to get last successful sync time
CREATE OR REPLACE FUNCTION get_last_successful_sync(p_sync_type VARCHAR)
RETURNS TIMESTAMP AS $$
BEGIN
  RETURN (
    SELECT last_sync_at 
    FROM elastic_sync_state 
    WHERE sync_type = p_sync_type 
      AND status = 'success'
    ORDER BY last_sync_at DESC 
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;

-- Insert initial sync record
INSERT INTO elastic_sync_state (sync_type, last_sync_at, status, records_synced)
VALUES ('captions', '1970-01-01 00:00:00', 'success', 0)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE elastic_sync_state IS 'Tracks Elasticsearch synchronization state';
