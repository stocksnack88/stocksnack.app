-- Migration: add ev_ebitda_current to stock_scores
-- Additive only — safe to run without affecting any existing pipeline logic.
-- pe_ratios.py already computes this value per ticker but was never writing
-- it to Supabase (bug found 2026-07-27 while wiring EV/EBITDA into the
-- ticker page's Market Comparison section — see CLAUDE.md).
-- Not yet applied to production; review and run manually in the Supabase SQL editor.
ALTER TABLE stock_scores
    ADD COLUMN IF NOT EXISTS ev_ebitda_current NUMERIC;
