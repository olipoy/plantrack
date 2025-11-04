-- Migration: Disable RLS on sections table
-- Description: Railway PostgreSQL doesn't have Supabase auth functions (auth.uid()),
--              so RLS policies block all server-side inserts. The backend already
--              handles authorization at the application layer through JWT tokens.
-- Date: 2025-11-04

-- Disable RLS on sections table
ALTER TABLE sections DISABLE ROW LEVEL SECURITY;

-- Drop existing RLS policies that use auth.uid()
DROP POLICY IF EXISTS "Users can view sections for their projects" ON sections;
DROP POLICY IF EXISTS "Users can create sections for their projects" ON sections;
DROP POLICY IF EXISTS "Users can update sections for their projects" ON sections;
DROP POLICY IF EXISTS "Users can delete sections for their projects" ON sections;

-- Note: Authorization is now fully handled at the application layer in server/index.mjs
-- All section endpoints verify project ownership before allowing operations
