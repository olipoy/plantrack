-- Add image_label column to notes table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'image_label'
  ) THEN
    ALTER TABLE notes ADD COLUMN image_label VARCHAR(255);
  END IF;
END $$;