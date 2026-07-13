-- Migration: add index/universe and characteristic tagging columns to stocks
-- Additive only — safe to run without affecting any existing pipeline logic.
-- Not yet applied to production; review and run manually in the Supabase SQL editor.
ALTER TABLE stocks
    ADD COLUMN IF NOT EXISTS index_tags          TEXT[],
    ADD COLUMN IF NOT EXISTS characteristic_tags  TEXT[];

-- Backfill existing universe as S&P 500 members.
UPDATE stocks
SET index_tags = ARRAY['SP500']
WHERE index_tags IS NULL;
