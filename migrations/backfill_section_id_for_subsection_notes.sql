/*
  # Backfill section_id for subsection notes

  1. Changes
    - Update all notes that have subsection_id but no section_id
    - Set section_id to the parent section of the subsection

  2. Purpose
    - Ensures accurate note counting in section headers
    - Fixes existing notes that were created before auto-setting parent section_id
*/

-- Update notes with subsection_id but no section_id
UPDATE notes
SET section_id = subsections.section_id
FROM subsections
WHERE notes.subsection_id = subsections.id
  AND notes.section_id IS NULL
  AND notes.subsection_id IS NOT NULL;
