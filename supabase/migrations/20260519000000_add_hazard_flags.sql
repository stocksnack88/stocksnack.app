ALTER TABLE stock_scores ADD COLUMN IF NOT EXISTS has_anomaly BOOLEAN DEFAULT false;
ALTER TABLE stock_scores ADD COLUMN IF NOT EXISTS anomaly_reasons TEXT;
