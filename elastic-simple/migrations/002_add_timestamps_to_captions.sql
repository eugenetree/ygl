-- Add timestamp columns to captions table (if they don't exist)
-- This allows incremental syncing based on when captions were added/updated

-- Add created_at column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'captions' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE captions ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'captions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE captions ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Create index for efficient incremental queries
CREATE INDEX IF NOT EXISTS idx_captions_updated_at ON captions(updated_at);
CREATE INDEX IF NOT EXISTS idx_captions_created_at ON captions(created_at);

-- Create trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_captions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_captions_updated_at ON captions;
CREATE TRIGGER trigger_captions_updated_at
  BEFORE UPDATE ON captions
  FOR EACH ROW
  EXECUTE FUNCTION update_captions_updated_at();

COMMENT ON COLUMN captions.created_at IS 'When caption was first inserted';
COMMENT ON COLUMN captions.updated_at IS 'When caption was last modified (auto-updated)';
