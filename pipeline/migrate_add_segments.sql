-- Migration: add benchmark and segment columns to stock_scores
ALTER TABLE stock_scores
    ADD COLUMN IF NOT EXISTS sp500_cagr       NUMERIC,
    ADD COLUMN IF NOT EXISTS sp500_5y_return  NUMERIC,
    ADD COLUMN IF NOT EXISTS product_segments JSONB,
    ADD COLUMN IF NOT EXISTS geo_segments     JSONB;
