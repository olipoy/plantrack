/*
  # Create project reports table

  1. New Tables
    - `project_reports`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `report_url` (text, S3 URL for the PDF)
      - `file_name` (text, generated file name)
      - `file_size` (bigint, size in bytes)
      - `created_at` (timestamptz, timestamp of generation)
      - `created_by` (uuid, foreign key to users)

  2. Security
    - Enable RLS on `project_reports` table
    - Add policy for users to read their own project reports
    - Add policy for users to create reports for their projects
    - Add policy for users to delete their own project reports
*/

CREATE TABLE IF NOT EXISTS project_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_url text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  created_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id)
);

ALTER TABLE project_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reports for their projects"
  ON project_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_reports.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create reports for their projects"
  ON project_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_reports.project_id
      AND projects.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Users can delete their own project reports"
  ON project_reports
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_reports.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_project_reports_project_id ON project_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_project_reports_created_at ON project_reports(created_at DESC);
