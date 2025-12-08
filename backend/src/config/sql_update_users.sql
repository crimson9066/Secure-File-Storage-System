-- Migration: add token_version and password_changed_at to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;

-- Optional: set password_changed_at to created_at for existing rows
UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL;
