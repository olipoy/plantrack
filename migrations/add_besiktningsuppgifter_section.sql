/*
  # Add Besiktningsuppgifter section and fix column names

  1. Changes to template_sections table
    - Add `template_id` column (if not exists) as alias for template_name
    - Add `order_index` column (if not exists) as alias for display_order
    - Insert new "Besiktningsuppgifter" section between Fastighetsuppgifter (1) and Byggnadsbeskrivning (2)
    - Update order_index for existing sections to accommodate new section

  2. New Section
    - Besiktningsuppgifter (order_index: 2, between Fastighetsuppgifter and Byggnadsbeskrivning)

  Note: This migration maintains backward compatibility by keeping both column names
*/

-- Add template_id column if it doesn't exist (as alias for template_name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'template_sections' AND column_name = 'template_id'
  ) THEN
    ALTER TABLE template_sections ADD COLUMN template_id text;
    -- Copy data from template_name to template_id
    UPDATE template_sections SET template_id = template_name WHERE template_id IS NULL;
  END IF;
END $$;

-- Add order_index column if it doesn't exist (as alias for display_order)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'template_sections' AND column_name = 'order_index'
  ) THEN
    ALTER TABLE template_sections ADD COLUMN order_index integer;
    -- Copy data from display_order to order_index
    UPDATE template_sections SET order_index = display_order WHERE order_index IS NULL;
  END IF;
END $$;

-- Update order_index for sections after Fastighetsuppgifter to make room for Besiktningsuppgifter
-- Move Byggnadsbeskrivning from 2 to 3, Besiktningsutlåtande from 3 to 4, etc.
UPDATE template_sections
SET order_index = order_index + 1
WHERE template_id = 'besiktningsprotokoll'
  AND order_index >= 2;

-- Also update display_order to keep them in sync
UPDATE template_sections
SET display_order = display_order + 1
WHERE template_name = 'besiktningsprotokoll'
  AND display_order >= 2;

-- Insert Besiktningsuppgifter section (order_index: 2)
INSERT INTO template_sections (template_id, template_name, name, icon, order_index, display_order, allow_subsections)
VALUES ('besiktningsprotokoll', 'besiktningsprotokoll', 'Besiktningsuppgifter', 'ClipboardList', 2, 2, false)
ON CONFLICT DO NOTHING;

-- Ensure order_index is synchronized with display_order for all sections
UPDATE template_sections
SET order_index = display_order
WHERE order_index IS NULL OR order_index != display_order;

-- Add the template_section_id column to sections table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sections' AND column_name = 'template_section_id'
  ) THEN
    ALTER TABLE sections ADD COLUMN template_section_id uuid REFERENCES template_sections(id);
  END IF;
END $$;

-- Add order_index column to sections table if it doesn't exist (as alias for display_order)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sections' AND column_name = 'order_index'
  ) THEN
    ALTER TABLE sections ADD COLUMN order_index integer DEFAULT 0;
    -- Copy data from display_order to order_index
    UPDATE sections SET order_index = display_order WHERE order_index IS NULL OR order_index = 0;
  END IF;
END $$;
