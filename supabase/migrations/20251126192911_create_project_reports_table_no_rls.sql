/*
  # Create project reports table
  
  1. New Tables
    - `project_reports`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `report_url` (text, S3 URL or local path for the PDF)
      - `file_name` (text, generated file name)
      - `file_size` (bigint, size in bytes)
      - `created_at` (timestamptz, timestamp of generation)
      - `created_by` (uuid, foreign key to users)
  
  2. Note
    - RLS is not enabled as the app uses custom JWT authentication
    - Access control is handled at the application layer
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

CREATE INDEX IF NOT EXISTS idx_project_reports_project_id ON project_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_project_reports_created_at ON project_reports(created_at DESC);