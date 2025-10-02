/*
  # Add file_key column for S3 storage

  1. Schema Changes
    - Add `file_key` column to notes table for storing S3 object keys
    - This enables switching from local file storage to S3

  2. Safety
    - Uses IF NOT EXISTS to prevent errors if column already exists
    - Does not drop or modify existing data
    - Backwards compatible with existing file storage
*/

-- Add file_key column to notes table for S3 object key storage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'file_key'
  ) THEN
    ALTER TABLE notes ADD COLUMN file_key TEXT;
  END IF;
END $$;

-- Create index for better performance on file_key lookups
CREATE INDEX IF NOT EXISTS idx_notes_file_key ON notes(file_key);