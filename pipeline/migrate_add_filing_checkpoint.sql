-- Migration: add smart-pull filing checkpoint columns to stocks
-- Additive only — safe to run without affecting any existing pipeline logic.
-- Not yet applied to production; review and run manually in the Supabase SQL editor.
ALTER TABLE stocks
    ADD COLUMN IF NOT EXISTS last_filing_accession   TEXT,
    ADD COLUMN IF NOT EXISTS last_filing_checked_at   TIMESTAMPTZ;
