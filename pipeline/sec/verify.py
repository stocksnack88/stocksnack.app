"""
StockSnack — Supabase data quality checker.

Reads stock_scores (and stock_prices for current_price) and runs
missing-data, range, staleness, and signal checks on every ticker.
Prints a results table and exits code 1 if any FAIL is found (so
GitHub Actions can catch regressions).

Run:
    python verify.py                 # all tickers
    python verify.py --ticker NVDA   # single ticker (debug)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

_PIPELINE_DIR = Path(__file__).parent.parent
if str(_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_DIR))

from supabase import create_client

try:
    from tabulate import tabulate
    _HAS_TABULATE = True
except ImportError:
    _HAS_TABULATE = False

# ── constants ─────────────────────────────────────────────────────────────────

VALID_SIGNALS        = {"BUY+", "BUY", "HOLD", "SELL"}
STALENESS_DAYS       = 8
_SEGMENT_ROLLUP_NAMES = {"worldwide", "consolidated"}

# ── check helpers ─────────────────────────────────────────────────────────────

def _val(row: dict, key: str):
    return row.get(key)

def _is_null_or_zero(v) -> bool:
    return v is None or v == 0

def _fmt(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, float):
        return f"{v:.4g}"
    return str(v)


def run_checks(row: dict) -> list[tuple[str, str, str]]:
    """
    Returns list of (check_name, value_str, status) tuples.
    status is FAIL, WARN, or PASS.
    """
    results: list[tuple[str, str, str]] = []

    def add(name: str, v, status: str):
        results.append((name, _fmt(v), status))

    # ── MISSING DATA ──────────────────────────────────────────────────────────
    # Actual column names from stock_scores / stock_prices:
    #   growth_quality_score → growth_score
    #   health_checks_passed → health_passes
    #   projected_price_5y   → ppm_blended_price
    #   current_price        → from stock_prices table (merged into row)
    missing_fields = [
        "final_score",
        "growth_score",
        "health_score",
        "m1_ebitda_current",
        "current_price",       # injected from stock_prices before run_checks
        "ppm_blended_price",
    ]
    for field in missing_fields:
        v = _val(row, field)
        add(f"missing:{field}", v, "FAIL" if _is_null_or_zero(v) else "PASS")

    # ppm_score: NULL is always a bug; 0 is expected for SELL signals (floored), bug otherwise
    ppm_v   = _val(row, "ppm_score")
    sig_v   = _val(row, "signal")
    blended = _val(row, "ppm_blended_price")
    cagr_v  = _val(row, "ppm_cagr")
    if ppm_v is None:
        add("missing:ppm_score", ppm_v, "FAIL")
    elif ppm_v == 0:
        if sig_v != "SELL":
            add("ppm_score_zero", f"score is 0 but signal is {sig_v} — scoring bug", "FAIL")
        elif blended is not None:
            cagr_pct = f"{cagr_v * 100:.1f}" if cagr_v is not None else "N/A"
            add("ppm_score_zero", f"severely overvalued, CAGR {cagr_pct}% — score correctly 0", "WARN")
        else:
            add("ppm_score_zero", "all PPM methods failed — check EBITDA/FCF signs", "WARN")
    else:
        add("missing:ppm_score", ppm_v, "PASS")

    # ── RANGE ─────────────────────────────────────────────────────────────────
    score_fields = ["final_score", "ppm_score", "growth_score", "health_score"]
    for field in score_fields:
        v = _val(row, field)
        if v is None:
            add(f"range:{field}", v, "FAIL")
        elif not (0 <= v <= 100):
            add(f"range:{field}", v, "FAIL")
        else:
            add(f"range:{field}", v, "PASS")

    hp = _val(row, "health_passes")
    if hp is None:
        add("range:health_passes", hp, "FAIL")
    elif not (0 <= hp <= 24):
        add("range:health_passes", hp, "FAIL")
    else:
        add("range:health_passes", hp, "PASS")

    proj = _val(row, "ppm_blended_price")
    if proj is not None and proj < 0:
        add("range:ppm_blended_price<0", proj, "FAIL")
    else:
        add("range:ppm_blended_price<0", proj, "PASS")

    cagr = _val(row, "ppm_cagr")
    if cagr is not None:
        if cagr > 2.0:
            add("range:ppm_cagr>200%", f"{cagr*100:.1f}%", "FAIL")
        elif cagr < -1.0:
            add("range:ppm_cagr<-100%", f"{cagr*100:.1f}%", "FAIL")
        else:
            add("range:ppm_cagr", f"{cagr*100:.1f}%", "PASS")
    else:
        add("range:ppm_cagr", cagr, "WARN")

    # ── STALENESS ─────────────────────────────────────────────────────────────
    updated_at = _val(row, "updated_at")
    if updated_at is None:
        add("staleness:updated_at", updated_at, "FAIL")
    else:
        try:
            import re
            # Strip timezone offset, then normalise fractional seconds to 6 digits.
            # Python 3.9 fromisoformat requires exactly 0, 3, or 6 fractional digits
            # and does not handle +HH:MM offsets.
            ts_str = re.sub(r'[+-]\d{2}:\d{2}$', '', updated_at.replace("Z", ""))
            ts_str = re.sub(r'\.(\d+)$', lambda m: '.' + m.group(1).ljust(6, '0')[:6], ts_str)
            ts = datetime.fromisoformat(ts_str).replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            age_days = (now - ts).days
            status = "FAIL" if age_days > STALENESS_DAYS else "PASS"
            add("staleness:updated_at", f"{age_days}d ago", status)
        except Exception:
            add("staleness:updated_at", updated_at, "WARN")

    # ── SIGNAL ────────────────────────────────────────────────────────────────
    sig = _val(row, "signal")
    if sig not in VALID_SIGNALS:
        add("signal", sig, "FAIL")
    else:
        add("signal", sig, "PASS")

    # ── EBITDA NEGATIVE ───────────────────────────────────────────────────────
    ebitda = _val(row, "m1_ebitda_current")
    if ebitda is not None and ebitda < 0:
        add("ebitda:negative", ebitda, "WARN")

    # ── EBITDA DEPTH ──────────────────────────────────────────────────────────
    # TODO: add ebitda_years_count to stock_scores for depth checking

    # ── SEGMENT ROLLUP ────────────────────────────────────────────────────────
    for seg_field in ("geo_segments", "product_segments"):
        raw = _val(row, seg_field)
        if not raw:
            continue
        segments = json.loads(raw) if isinstance(raw, str) else raw
        for seg in (segments if isinstance(segments, list) else []):
            name = (seg.get("name") or "").lower()
            if name.startswith("total") or name in _SEGMENT_ROLLUP_NAMES:
                add(f"segment_rollup:{seg_field}", seg.get("name"), "FAIL")

    # ── SEGMENT COVERAGE ──────────────────────────────────────────────────────
    geo  = _val(row, "geo_segments")
    prod = _val(row, "product_segments")
    if not geo and not prod:
        add("segment_coverage", "both NULL", "WARN")

    return results


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="StockSnack data quality verifier")
    parser.add_argument("--ticker", metavar="TICKER",
                        help="Run checks on a single ticker only")
    args = parser.parse_args()

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        return 1

    client = create_client(url, key)

    scores_query = client.table("stock_scores").select(
        "ticker, final_score, ppm_score, growth_score, health_score, "
        "health_passes, m1_ebitda_current, ppm_blended_price, "
        "ppm_cagr, signal, updated_at, geo_segments, product_segments"
    )
    if args.ticker:
        scores_query = scores_query.eq("ticker", args.ticker.upper())

    scores_resp = scores_query.execute()
    rows = scores_resp.data or []

    if not rows:
        print(f"No rows found{' for ' + args.ticker if args.ticker else ''}.")
        return 1

    # Fetch current prices from stock_prices table and merge
    prices_query = client.table("stock_prices").select("ticker, current_price")
    if args.ticker:
        prices_query = prices_query.eq("ticker", args.ticker.upper())
    prices_resp = prices_query.execute()
    price_map = {p["ticker"]: p["current_price"] for p in (prices_resp.data or [])}
    for row in rows:
        row["current_price"] = price_map.get(row["ticker"])

    # Run checks and collect all results
    table_rows: list[tuple[str, str, str, str]] = []
    fail_count = 0
    warn_count = 0
    clean_tickers: set[str] = set()
    dirty_tickers: set[str] = set()

    for row in sorted(rows, key=lambda r: r["ticker"]):
        ticker   = row["ticker"]
        checks   = run_checks(row)
        has_fail = any(s == "FAIL" for _, _, s in checks)

        for check_name, value, status in checks:
            if status in ("FAIL", "WARN"):
                table_rows.append((ticker, check_name, value, status))
            if status == "FAIL":
                fail_count += 1
            elif status == "WARN":
                warn_count += 1

        if has_fail:
            dirty_tickers.add(ticker)
        else:
            clean_tickers.add(ticker)

    total   = len(rows)
    n_clean = len(clean_tickers - dirty_tickers)

    # Print results
    print()
    if table_rows:
        headers = ["TICKER", "CHECK", "VALUE", "STATUS"]
        if _HAS_TABULATE:
            print(tabulate(table_rows, headers=headers, tablefmt="simple"))
        else:
            col_w = [max(len(h), max((len(r[i]) for r in table_rows), default=0))
                     for i, h in enumerate(headers)]
            fmt = "  ".join(f"{{:<{w}}}" for w in col_w)
            print(fmt.format(*headers))
            print("  ".join("-" * w for w in col_w))
            for r in table_rows:
                print(fmt.format(*r))
    else:
        print("All checks passed.")

    print()
    issues = fail_count + warn_count
    print(f"{n_clean}/{total} tickers clean.  {fail_count} FAIL  {warn_count} WARN  ({issues} issues total)")
    print()

    return 1 if fail_count > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
