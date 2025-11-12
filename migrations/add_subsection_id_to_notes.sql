/*
  # Add subsection_id to notes table

  1. Changes
    - Add `subsection_id` (uuid, nullable) to `notes` table as foreign key to `subsections` table
    - Add index for better query performance

  2. Notes
    - Allows notes to be associated with specific subsections (delområden)
    - Notes can have either section_id OR subsection_id, but subsection_id takes precedence for organization
*/

-- Add subsection_id to notes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'subsection_id'
  ) THEN
    ALTER TABLE notes ADD COLUMN subsection_id uuid REFERENCES subsections(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_notes_subsection_id ON notes(subsection_id);
