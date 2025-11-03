/*
  # Add section support for template-based projects

  1. New Tables
    - `template_sections`
      - `id` (uuid, primary key)
      - `template_id` (text) - matches template ID from frontend (e.g., 'besiktningsprotokoll')
      - `name` (text) - section name (e.g., 'Fastighetsuppgifter')
      - `order_index` (integer) - display order
      - `allow_subsections` (boolean) - whether this section can have subsections
      - `created_at` (timestamp)

    - `sections`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `template_section_id` (uuid, foreign key to template_sections) - nullable for custom subsections
      - `name` (text) - section/subsection name
      - `parent_section_id` (uuid, foreign key to sections) - nullable, for subsections
      - `order_index` (integer) - display order within parent
      - `created_at` (timestamp)

  2. Changes to Existing Tables
    - Add `section_id` (uuid, nullable) to `notes` table
    - Add `section_id` (uuid, nullable) to `media` table

  3. Security
    - Enable RLS on new tables
    - Add policies for authenticated users to manage their project sections

  4. Initial Data
    - Insert template sections for 'besiktningsprotokoll' template
*/

-- Create template_sections table
CREATE TABLE IF NOT EXISTS template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id text NOT NULL,
  name text NOT NULL,
  order_index integer NOT NULL,
  allow_subsections boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create sections table
CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_section_id uuid REFERENCES template_sections(id) ON DELETE SET NULL,
  name text NOT NULL,
  parent_section_id uuid REFERENCES sections(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Add section_id to notes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'section_id'
  ) THEN
    ALTER TABLE notes ADD COLUMN section_id uuid REFERENCES sections(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add section_id to media table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media' AND column_name = 'section_id'
  ) THEN
    ALTER TABLE media ADD COLUMN section_id uuid REFERENCES sections(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Enable RLS on template_sections
ALTER TABLE template_sections ENABLE ROW LEVEL SECURITY;

-- Enable RLS on sections
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for template_sections (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view template sections"
  ON template_sections FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for sections (users can manage sections for their own projects)
CREATE POLICY "Users can view sections for their projects"
  ON sections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sections.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create sections for their projects"
  ON sections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sections.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update sections for their projects"
  ON sections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sections.project_id
      AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sections.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete sections for their projects"
  ON sections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sections.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Insert template sections for Besiktningsprotokoll
INSERT INTO template_sections (template_id, name, order_index, allow_subsections)
VALUES
  ('besiktningsprotokoll', 'Fastighetsuppgifter', 1, false),
  ('besiktningsprotokoll', 'Byggnadsbeskrivning', 2, false),
  ('besiktningsprotokoll', 'Besiktningsutlåtande', 3, false),
  ('besiktningsprotokoll', 'Utvändigt', 4, true),
  ('besiktningsprotokoll', 'Entréplan', 5, true),
  ('besiktningsprotokoll', 'Övre plan', 6, true),
  ('besiktningsprotokoll', 'Källarplan', 7, true)
ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_template_sections_template_id ON template_sections(template_id);
CREATE INDEX IF NOT EXISTS idx_sections_project_id ON sections(project_id);
CREATE INDEX IF NOT EXISTS idx_sections_parent_section_id ON sections(parent_section_id);
CREATE INDEX IF NOT EXISTS idx_notes_section_id ON notes(section_id);
CREATE INDEX IF NOT EXISTS idx_media_section_id ON media(section_id);
