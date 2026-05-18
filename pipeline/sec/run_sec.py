"""
StockSnack — SEC EDGAR parallel pipeline.

Mirrors pipeline/run.py exactly but sources data from SEC EDGAR + yfinance
instead of FMP. Does NOT touch run.py, fmp_client.py, or any scoring files.

Run:
    python run_sec.py                          # all tickers from config.py
    python run_sec.py --tickers AAPL MSFT      # specific tickers
    python run_sec.py --tickers AAPL --dry-run # score only, no Supabase writes
"""
from __future__ import annotations

import argparse
import csv
import logging
import sys
import time
from pathlib import Path

# Allow imports from pipeline/ (scoring, supabase_writer, config)
_PIPELINE_DIR = Path(__file__).parent.parent
_SEC_DIR      = Path(__file__).parent
for _p in [str(_PIPELINE_DIR), str(_SEC_DIR)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from normalizer        import normalise
from yf_client         import get_profile, get_market_cap, get_historical_market_cap
from sec_client        import ticker_to_cik
from segment_extractor import get_segments

from scoring.layer1_ppm    import score_ppm
from scoring.layer2_growth import score_growth
from scoring.layer3_health import score_health
from scoring.layer4_final  import score_final
from scoring.spy_benchmark import compute_spy_benchmark

from supabase_writer import SupabaseWriter
from config import TICKERS, SUPABASE_URL, SUPABASE_KEY

BANK_TICKERS = ["JPM", "BAC"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_period_of_report(ticker: str) -> dict[int, str]:
    """Read {fiscal_year: period_of_report} from extracted_data.csv."""
    csv_path = _SEC_DIR / "extracted_data.csv"
    result: dict[int, str] = {}
    if not csv_path.exists():
        return result
    with csv_path.open(newline="") as f:
        for row in csv.DictReader(f):
            if row.get("ticker", "").upper() != ticker.upper():
                continue
            por = row.get("period_of_report", "").strip()
            if not por:
                continue
            try:
                fy = int(row["fiscal_year"])
                if fy not in result:
                    result[fy] = por
            except (KeyError, ValueError):
                pass
    return result


# ── Data dict builder ─────────────────────────────────────────────────────────

_INCOME_FIELDS = {
    "symbol", "date",
    "revenue", "grossProfit", "operatingIncome", "netIncome", "epsdiluted",
    "sellingGeneralAndAdministrativeExpenses", "researchAndDevelopmentExpenses",
    "interestExpense", "incomeTaxExpense", "ebitda", "depreciationAndAmortization",
}

_BALANCE_FIELDS = {
    "symbol", "date",
    "cashAndCashEquivalents", "totalDebt", "totalStockholdersEquity",
    "totalAssets", "totalLiabilities", "retainedEarnings",
    "preferredStock", "goodwillAndIntangibleAssets", "weightedAverageShsOutDil",
}

_CASHFLOW_FIELDS = {
    "symbol", "date",
    "operatingCashFlow", "capitalExpenditure", "freeCashFlow",
    "stockBasedCompensation", "netDividendsPaid", "commonStockRepurchased",
}


def _safe(v, default=0.0) -> float:
    try:
        f = float(v)
        return f if f == f else default  # NaN check
    except (TypeError, ValueError):
        return default


def build_data_dict(ticker: str, years: int = 5) -> dict:
    """
    Fetch SEC + yfinance data and assemble the exact data dict the scoring
    layers expect, mirroring the structure that fmp.fetch_all() produces.
    """
    log.info("[%s] Fetching SEC data…", ticker)
    flat_years = normalise(ticker, years=years)  # newest first

    if not flat_years:
        raise ValueError(f"No SEC data returned for {ticker}")

    log.info("[%s] Fetching profile from yfinance…", ticker)
    profile    = get_profile(ticker)
    market_cap = _safe(profile.get("marketCap"))

    # ── Split flat year dicts into statement sub-lists ────────────────────────
    income_list:   list[dict] = []
    balance_list:  list[dict] = []
    cashflow_list: list[dict] = []

    for yr in flat_years:
        # --- income ---
        inc = {k: yr[k] for k in _INCOME_FIELDS if k in yr}
        # Aliases layer3 needs
        inc["eps"]            = yr.get("epsdiluted", 0.0)
        net_inc               = _safe(yr.get("netIncome"))
        tax                   = _safe(yr.get("incomeTaxExpense"))
        inc["incomeBeforeTax"] = net_inc + tax
        income_list.append(inc)

        # --- balance ---
        bal = {k: yr[k] for k in _BALANCE_FIELDS if k in yr}
        # Aliases layer1/layer3 need
        bal["totalEquity"]     = yr.get("totalStockholdersEquity", 0.0)
        bal["intangibleAssets"] = yr.get("goodwillAndIntangibleAssets", 0.0)
        cash_  = _safe(yr.get("cashAndCashEquivalents"))
        debt_  = _safe(yr.get("totalDebt"))
        bal["netDebt"] = debt_ - cash_
        balance_list.append(bal)

        # --- cashflow ---
        cf = {k: yr[k] for k in _CASHFLOW_FIELDS if k in yr}
        # Layer1 M3 reads "dividendsPaid" (FMP name); our SEC name is "netDividendsPaid"
        cf["dividendsPaid"] = yr.get("netDividendsPaid", 0.0)
        cashflow_list.append(cf)

    # ── Metrics list (one per year, using historical market cap) ─────────────
    fiscal_year_ints = [int(yr["date"][:4]) for yr in flat_years]

    # Per-year shares from SEC extracted_data — fixes buyback distortion
    shares_by_year = {
        int(yr["date"][:4]): _safe(yr.get("weightedAverageShsOutDil"))
        for yr in flat_years
        if _safe(yr.get("weightedAverageShsOutDil")) > 0
    }

    # Build period_of_report-aligned date windows for market cap calculation
    fiscal_year_dates = _load_period_of_report(ticker)
    for fy in fiscal_year_ints:
        if fy not in fiscal_year_dates:
            fiscal_year_dates[fy] = f"{fy}-12-31"
            log.warning("[%s] No period_of_report for FY%d — using %d-12-31", ticker, fy, fy)

    log.info("[%s] Fetching historical market caps for %s…", ticker, fiscal_year_ints)
    hist_mktcap = get_historical_market_cap(ticker, fiscal_year_dates, shares_by_year=shares_by_year)

    metrics_list: list[dict] = []
    for yr, bal, cf in zip(flat_years, balance_list, cashflow_list):
        fy       = int(yr["date"][:4])
        mktcap   = hist_mktcap.get(fy) or market_cap  # fall back to current if missing
        ebitda_  = _safe(yr.get("ebitda"))
        fcf_     = _safe(yr.get("freeCashFlow"))
        net_div_ = abs(_safe(yr.get("netDividendsPaid")))
        cash__   = _safe(yr.get("cashAndCashEquivalents"))
        debt__   = _safe(yr.get("totalDebt"))

        ev = (mktcap + debt__ - cash__) if mktcap and mktcap > 0 else None

        ev_ebitda = (ev / ebitda_)  if ev and ebitda_  > 0 else None
        p_fcf     = (mktcap / fcf_) if mktcap and mktcap > 0 and fcf_ > 0 else None
        div_yield = (net_div_ / mktcap) if mktcap and mktcap > 0 and net_div_ > 0 else None

        # Banks: EV/EBITDA is meaningless; use P/E (market_cap / net_income) instead
        if ticker.upper() in BANK_TICKERS:
            net_inc_  = _safe(yr.get("netIncome"))
            ev_ebitda = (mktcap / net_inc_) if mktcap and mktcap > 0 and net_inc_ > 0 else None

        metrics_list.append({
            "evToEBITDA":                ev_ebitda,
            "priceToFreeCashFlowsRatio": p_fcf,
            "dividendYield":             div_yield,
            "marketCap":                 mktcap if mktcap and mktcap > 0 else None,
        })

    # Banks: M1 uses net_income as EBITDA proxy and P/E as the multiple.
    # Subtracting net_debt (hundreds of billions in bank liabilities) from the
    # projected equity destroys the calculation — bank "debt" is deposits/funding,
    # not corporate financing. P/E valuation never subtracts debt; zero it out.
    # Override in-memory only — does NOT write back to extracted_data.csv.
    if ticker.upper() in BANK_TICKERS:
        for inc in income_list:
            inc["ebitda"] = inc.get("netIncome", 0)
        for bal in balance_list:
            bal["netDebt"] = 0.0

    log.info("[%s] Building data dict…", ticker)
    return {
        "profile":           profile,
        "income":            income_list,
        "balance":           balance_list,
        "cashflow":          cashflow_list,
        "metrics":           metrics_list,
        "product_segments":  [],
        "geo_segments":      [],
        "reported_currency": "USD",
    }


# ── Per-ticker processor ──────────────────────────────────────────────────────

def process(ticker: str, writer: SupabaseWriter | None, spy: dict, dry_run: bool) -> bool:
    try:
        data = build_data_dict(ticker)

        if not data["profile"].get("price"):
            log.warning("[%s] No price from yfinance — skipped", ticker)
            return False

        log.info("[%s] Running scoring layers…", ticker)
        ppm    = score_ppm(data,   ticker=ticker, sp500_cagr=spy.get("sp500_cagr"))
        growth = score_growth(data, sp500_cagr=spy.get("sp500_cagr"), ticker=ticker)
        health = score_health(data)
        final  = score_final(ppm, growth, health, spy.get("sp500_cagr"))

        log.info(
            "[%s] Score: %-5s | PPM: %5.1f | Growth: %5.1f | Health: %d/24",
            ticker,
            final.get("signal", "?"),
            ppm.get("score", 0),
            growth.get("score", 0),
            health.get("passes", 0),
        )

        log.info("[%s] Fetching segments...", ticker)
        cik      = ticker_to_cik(ticker)
        segments = get_segments(ticker, cik) if cik else {"product_segments": None, "geo_segments": None}
        prod     = segments.get("product_segments")
        geo      = segments.get("geo_segments")
        if prod is not None or geo is not None:
            log.info("[%s] Product segments: %d found", ticker, len(prod) if prod else 0)
            log.info("[%s] Geo segments: %d found",     ticker, len(geo)  if geo  else 0)
        else:
            log.info("[%s] Segments: not available", ticker)

        if dry_run:
            log.info("[%s] --dry-run: skipping Supabase write", ticker)
        else:
            writer.upsert_scores(ticker, ppm, growth, health, final, spy, segments)

        log.info("[%s] ✓ Done", ticker)
        return True, len(prod) if prod else None, len(geo) if geo else None

    except Exception as exc:
        log.error("[%s] FAILED: %s", ticker, exc, exc_info=True)
        return False, None, None


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="StockSnack SEC EDGAR pipeline")
    parser.add_argument(
        "--tickers", nargs="+", default=TICKERS,
        metavar="TICKER", help="Override the default ticker list",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Run scoring but do NOT write to Supabase",
    )
    args = parser.parse_args()
    tickers: list[str] = [t.upper() for t in args.tickers]
    dry_run: bool = args.dry_run

    log.info("Starting SEC pipeline — %d tickers%s",
             len(tickers), "  [DRY RUN]" if dry_run else "")

    writer = None if dry_run else SupabaseWriter(SUPABASE_URL, SUPABASE_KEY)

    log.info("Fetching S&P 500 benchmark…")
    spy = compute_spy_benchmark({}, [])
    log.info("SPY benchmark: cagr=%.4f", spy.get("sp500_cagr") or 0)

    processed:       list[str]          = []
    failed:          list[str]          = []
    segment_results: dict[str, tuple]   = {}  # ticker -> (prod_count, geo_count)

    for ticker in tickers:
        ok, prod_cnt, geo_cnt = process(ticker, writer, spy, dry_run)
        (processed if ok else failed).append(ticker)
        segment_results[ticker] = (prod_cnt, geo_cnt)
        if len(tickers) > 1:
            time.sleep(1)

    log.info("Done — processed: %d  failed: %d", len(processed), len(failed))
    if failed:
        log.warning("Failed: %s", ", ".join(failed))

    log.info("─" * 52)
    log.info("SEGMENT COVERAGE SUMMARY")
    log.info("%-8s  %-14s  %-10s", "Ticker", "Product segs", "Geo segs")
    log.info("%-8s  %-14s  %-10s", "──────", "────────────", "────────")
    for t in tickers:
        pc, gc = segment_results.get(t, (None, None))
        log.info("%-8s  %-14s  %-10s",
                 t,
                 str(pc) if pc is not None else "—",
                 str(gc) if gc is not None else "—")

    sys.exit(1 if len(failed) > 2 else 0)


if __name__ == "__main__":
    main()
