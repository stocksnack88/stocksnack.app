ALTER TABLE stock_scores
    ADD COLUMN IF NOT EXISTS m3_applicable BOOLEAN;
