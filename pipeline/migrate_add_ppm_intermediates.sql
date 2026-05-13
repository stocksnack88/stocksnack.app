-- Migration: add Layer 1 PPM intermediate columns to stock_scores
ALTER TABLE stock_scores
    ADD COLUMN IF NOT EXISTS m1_ebitda_current    NUMERIC,
    ADD COLUMN IF NOT EXISTS m1_ebitda_projected  NUMERIC,
    ADD COLUMN IF NOT EXISTS m1_growth_rate       NUMERIC,
    ADD COLUMN IF NOT EXISTS m1_ev_ebitda_multiple NUMERIC,
    ADD COLUMN IF NOT EXISTS m1_net_debt          NUMERIC,
    ADD COLUMN IF NOT EXISTS m1_shares            NUMERIC,
    ADD COLUMN IF NOT EXISTS m2_fcf_current       NUMERIC,
    ADD COLUMN IF NOT EXISTS m2_fcf_projected     NUMERIC,
    ADD COLUMN IF NOT EXISTS m2_growth_rate       NUMERIC,
    ADD COLUMN IF NOT EXISTS m2_fcf_yield         NUMERIC,
    ADD COLUMN IF NOT EXISTS m3_div_yield         NUMERIC,
    ADD COLUMN IF NOT EXISTS m3_buyback_yield     NUMERIC,
    ADD COLUMN IF NOT EXISTS m3_shareholder_yield NUMERIC,
    ADD COLUMN IF NOT EXISTS m3_growth_rate       NUMERIC;
