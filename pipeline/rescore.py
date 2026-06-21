"""
StockSnack — Rescore from local Supabase data.

Reads stock_fundamentals (already stored) and re-runs the scoring layers
without any FMP, SEC EDGAR, or yfinance calls.

Use for: recalculating derived score fields after changing scoring logic,
         without needing to re-fetch the underlying financial data.

This is the correct tool for any "recalculate without re-fetching" task.
Run run.py (FMP) or sec/run_sec.py (SEC EDGAR) to refresh the raw data first.

Run:
    python rescore.py --tickers AMZN NVDA AAPL        # rescore and write to DB
    python rescore.py --tickers AMZN --dry-run        # print scores only, no DB write
    python rescore.py --tickers AMZN --compare        # print old vs new side-by-side
"""
from __future__ import annotations

import argparse
import logging
import sys

from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY
from local_data import build_data_dict_from_supabase
from supabase_writer import SupabaseWriter
from scoring.layer1_ppm    import score_ppm
from scoring.layer2_growth import score_growth
from scoring.layer3_health import score_health
from scoring.layer4_final  import score_final

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def _get_spy(client) -> tuple[float, float | None]:
    """Read the most recently stored sp500_cagr / sp500_5y_return from stock_scores."""
    try:
        resp = (
            client.table("stock_scores")
            .select("sp500_cagr, sp500_5y_return")
            .order("updated_at", desc=True)
            .limit(10)
            .execute()
        )
        for row in (resp.data or []):
            cagr = row.get("sp500_cagr")
            if cagr is not None:
                return float(cagr), row.get("sp500_5y_return")
    except Exception as exc:
        log.warning("sp500_cagr lookup failed (%s) — using default 0.136", exc)
    return 0.136, None


def _read_preserved(ticker: str, client) -> dict:
    """Read fields that rescore doesn't regenerate so they can be passed through."""
    try:
        resp = (
            client.table("stock_scores")
            .select("product_segments, geo_segments, sector_override, has_anomaly, anomaly_reasons")
            .eq("ticker", ticker)
            .maybe_single()
            .execute()
        )
        return resp.data or {}
    except Exception as exc:
        log.warning("[%s] Could not read preserved fields (%s)", ticker, exc)
        return {}


def _read_stored_scores(ticker: str, client) -> dict:
    """Read current scores for before/after comparison."""
    try:
        resp = (
            client.table("stock_scores")
            .select("ppm_score, growth_score, health_score, final_score, signal, "
                    "fcf_cagr_5y, net_income_cagr_5y, revenue_cagr_5y")
            .eq("ticker", ticker)
            .maybe_single()
            .execute()
        )
        return resp.data or {}
    except Exception:
        return {}


def process(
    ticker: str,
    client,
    writer: SupabaseWriter,
    sp500_cagr: float,
    sp500_5y_return: float | None,
    dry_run: bool = False,
    compare: bool = False,
) -> bool:
    try:
        data = build_data_dict_from_supabase(ticker, client)
    except ValueError as exc:
        log.warning("%s", exc)
        return False
    except Exception as exc:
        log.error("[%s] build_data_dict_from_supabase failed: %s", ticker, exc, exc_info=True)
        return False

    try:
        ppm    = score_ppm(data,    ticker=ticker, sp500_cagr=sp500_cagr)
        growth = score_growth(data, ticker=ticker, sp500_cagr=sp500_cagr)
        health = score_health(data)
        final  = score_final(ppm, growth, health, sp500_cagr)
    except Exception as exc:
        log.error("[%s] Scoring failed: %s", ticker, exc, exc_info=True)
        return False

    if compare:
        old = _read_stored_scores(ticker, client)
        print(f"\n{'─'*62}")
        print(f"  {ticker}")
        print(f"{'─'*62}")
        print(f"  {'Metric':<24}  {'Before':>10}  {'After':>10}")
        print(f"  {'─'*24}  {'─'*10}  {'─'*10}")
        for label, old_key, new_val in [
            ("PPM",         "ppm_score",           ppm["score"]),
            ("Growth",      "growth_score",         growth["score"]),
            ("Health",      "health_score",         health["score"]),
            ("Final",       "final_score",          final["score"]),
            ("Signal",      "signal",               final["signal"]),
            ("FCF CAGR 5y", "fcf_cagr_5y",          growth.get("fcf_cagr_5y")),
            ("NI CAGR 5y",  "net_income_cagr_5y",   growth.get("net_income_cagr_5y")),
            ("Rev CAGR 5y", "revenue_cagr_5y",       growth.get("revenue_cagr_5y")),
        ]:
            old_v = old.get(old_key, "—")
            new_v = new_val if new_val is not None else "—"
            if isinstance(old_v, float):
                old_v = f"{old_v:.4f}"
            if isinstance(new_v, float):
                new_v = f"{new_v:.4f}"
            changed = "  ◀" if str(old_v) != str(new_v) else ""
            print(f"  {label:<24}  {str(old_v):>10}  {str(new_v):>10}{changed}")
    else:
        log.info(
            "%-6s  PPM=%5.1f  Growth=%5.1f  Health=%5.1f  Final=%5.1f  [%s]",
            ticker, ppm["score"], growth["score"], health["score"],
            final["score"], final["signal"],
        )

    if dry_run:
        return True

    preserved = _read_preserved(ticker, client)
    spy = {"sp500_cagr": sp500_cagr, "sp500_5y_return": sp500_5y_return}
    segments  = {
        "product_segments": preserved.get("product_segments"),
        "geo_segments":     preserved.get("geo_segments"),
    }
    anomaly_raw = preserved.get("anomaly_reasons") or ""
    hazard = {
        "has_anomaly": preserved.get("has_anomaly", False),
        "reasons": [r for r in anomaly_raw.split(", ") if r] if anomaly_raw else [],
    }

    try:
        writer.upsert_scores(
            ticker, ppm, growth, health, final, spy, segments,
            hazard=hazard,
            sector_override=preserved.get("sector_override"),
        )
    except Exception as exc:
        log.error("[%s] DB write failed: %s", ticker, exc, exc_info=True)
        return False

    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Rescore tickers from local Supabase data")
    parser.add_argument("--tickers", nargs="+", required=True, metavar="TICKER")
    parser.add_argument("--dry-run", action="store_true",
                        help="Score only — do not write to database")
    parser.add_argument("--compare", action="store_true",
                        help="Print before/after table for each ticker (implies --dry-run)")
    args = parser.parse_args()

    tickers  = [t.upper() for t in args.tickers]
    dry_run  = args.dry_run or args.compare
    compare  = args.compare

    log.info("Rescore — %d ticker(s)%s", len(tickers), " [dry-run]" if dry_run else "")

    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    writer = SupabaseWriter(SUPABASE_URL, SUPABASE_KEY)

    sp500_cagr, sp500_5y_return = _get_spy(client)
    log.info("SPY benchmark: cagr=%.4f", sp500_cagr)

    processed, failed = [], []
    for ticker in tickers:
        ok = process(ticker, client, writer, sp500_cagr, sp500_5y_return,
                     dry_run=dry_run, compare=compare)
        (processed if ok else failed).append(ticker)

    print()
    log.info("Done — processed: %d  failed: %d", len(processed), len(failed))
    if failed:
        log.warning("Failed: %s", ", ".join(failed))

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
