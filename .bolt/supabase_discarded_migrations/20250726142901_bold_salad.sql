/*
  # Add Individual Item Reporting Support

  1. Schema Changes
    - Add `submitted` boolean column to notes table
    - Add `submitted_at` timestamp column to notes table
    - Add `individual_report` text column to store item-specific reports

  2. Indexes
    - Add index on submitted status for efficient filtering
*/

-- Add columns to support individual item reporting
DO $$
BEGIN
  -- Add submitted status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'submitted'
  ) THEN
    ALTER TABLE notes ADD COLUMN submitted BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add submitted timestamp column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE notes ADD COLUMN submitted_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add individual report content column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'individual_report'
  ) THEN
    ALTER TABLE notes ADD COLUMN individual_report TEXT;
  END IF;
END $$;

-- Create index for efficient filtering of submitted/unsubmitted items
CREATE INDEX IF NOT EXISTS idx_notes_submitted ON notes(submitted);
CREATE INDEX IF NOT EXISTS idx_notes_submitted_at ON notes(submitted_at);

-- Update the update trigger to handle the new columns
CREATE OR REPLACE FUNCTION update_notes_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update submitted_at when submitted status changes from false to true
    IF OLD.submitted = FALSE AND NEW.submitted = TRUE THEN
        NEW.submitted_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for notes table if it doesn't exist
DROP TRIGGER IF EXISTS update_notes_submitted_at ON notes;
CREATE TRIGGER update_notes_submitted_at 
    BEFORE UPDATE ON notes
    FOR EACH ROW 
    EXECUTE FUNCTION update_notes_updated_at_column();