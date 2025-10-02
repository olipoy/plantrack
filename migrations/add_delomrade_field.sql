-- Migration: Add delomrade field to notes table
-- Description: Adds a new column to store the inspection sub-area categorization
-- Date: 2025-10-02

-- Add delomrade column to notes table
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS delomrade TEXT;

-- Create index for better performance on delomrade filtering
CREATE INDEX IF NOT EXISTS idx_notes_delomrade ON notes(delomrade);

-- Verify the column was added successfully
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'notes' AND column_name = 'delomrade';
