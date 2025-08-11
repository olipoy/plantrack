/*
  # Fix organization_invites table schema

  1. Schema Changes
    - Add missing `invited_by` column to organization_invites table
    - Ensure all columns match backend expectations

  2. Safety
    - Uses IF NOT EXISTS to prevent errors if column already exists
    - Does not drop or modify existing data
    - Idempotent - safe to run multiple times
*/

-- Add missing invited_by column to organization_invites table
ALTER TABLE organization_invites 
ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create index for better performance on invited_by lookups
CREATE INDEX IF NOT EXISTS idx_organization_invites_invited_by ON organization_invites(invited_by);