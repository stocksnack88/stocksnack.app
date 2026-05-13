"""
StockSnack Screener — Data Pipeline

Setup (first time only):
    1. Paste create_tables.sql into Supabase SQL Editor and run it.
    2. cd pipeline && pip install -r requirements.txt

Run:
    python run.py                          # all 20 tickers
    python run.py --tickers NVDA AAPL MSFT # subset
"""
from __future__ import annotations

import sys
import time
import logging
import argparse

from config import TICKERS, SUPABASE_URL, SUPABASE_KEY
from fmp_client import FMPClient
from supabase_writer import SupabaseWriter
from scoring.layer1_ppm       import score_ppm
from scoring.layer2_growth    import score_growth
from scoring.layer3_health    import score_health
from scoring.layer4_final     import score_final
from scoring.spy_benchmark    import compute_spy_benchmark
from scoring.segment_analysis import compute_segments

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def process(ticker: str, fmp: FMPClient, writer: SupabaseWriter, spy: dict) -> bool:
    try:
        data = fmp.fetch_all(ticker)

        if not data["profile"]:
            log.warning("%s  no profile data — skipped", ticker)
            return False

        writer.upsert_stock(ticker, data)

        ppm      = score_ppm(data)
        growth   = score_growth(data)
        health   = score_health(data)
        final    = score_final(ppm, growth, health, spy.get("sp500_cagr"))
        segments = compute_segments(data.get("product_segments", []), data.get("geo_segments", []))

        writer.upsert_scores(ticker, ppm, growth, health, final, spy, segments)

        log.info(
            "%-6s  PPM=%5.1f  Growth=%5.1f  Health=%5.1f  Final=%5.1f  [%s]",
            ticker,
            ppm["score"],
            growth["score"],
            health["score"],
            final["score"],
            final["signal"],
        )
        return True

    except Exception as exc:
        log.error("%s  FAILED: %s", ticker, exc, exc_info=True)
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="StockSnack data pipeline")
    parser.add_argument(
        "--tickers", nargs="+", default=TICKERS,
        metavar="TICKER", help="Override the default ticker list",
    )
    args = parser.parse_args()
    tickers: list[str] = [t.upper() for t in args.tickers]

    log.info("Starting pipeline — %d tickers", len(tickers))

    fmp    = FMPClient()
    writer = SupabaseWriter(SUPABASE_URL, SUPABASE_KEY)

    log.info("Fetching SPY benchmark data")
    spy = compute_spy_benchmark(fmp.get_spy_quote(), fmp.get_spy_dividends())
    log.info("SPY benchmark: cagr=%.4f  5y_return=%.4f",
             spy["sp500_cagr"] or 0, spy["sp500_5y_return"] or 0)

    run_id = writer.start_pipeline_run(tickers)

    processed: list[str] = []
    failed:    list[str] = []

    for ticker in tickers:
        ok = process(ticker, fmp, writer, spy)
        (processed if ok else failed).append(ticker)
        time.sleep(2)

    writer.complete_pipeline_run(run_id, processed, failed)

    log.info("Done — processed: %d  failed: %d", len(processed), len(failed))
    if failed:
        log.warning("Failed: %s", ", ".join(failed))

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
