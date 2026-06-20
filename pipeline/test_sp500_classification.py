"""
S&P 500 bucket classification for EBITDA and FCF.
Reports A/B1/B2/C counts across all tickers — read-only, no writes.
"""
from __future__ import annotations
import os, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(__file__))

from config import SUPABASE_URL, SUPABASE_KEY
from scoring.utils import project_series, _is_steep_drop
from supabase import create_client

SP500_CAGR = 0.136
_PAGE = 1000   # Supabase row limit per request


def fetch_all_fundamentals(supabase) -> list[dict]:
    """Fetch all rows from stock_fundamentals, paginating past the 1000-row cap."""
    rows, offset = [], 0
    while True:
        batch = (
            supabase.table("stock_fundamentals")
            .select("ticker, fiscal_year, ebitda, free_cash_flow")
            .order("ticker")
            .order("fiscal_year", desc=True)
            .range(offset, offset + _PAGE - 1)
            .execute().data or []
        )
        rows.extend(batch)
        if len(batch) < _PAGE:
            break
        offset += _PAGE
    return rows


def classify(values_newest_first: list[float]) -> str:
    """Return bucket label for a series."""
    window      = [v for v in values_newest_first[:5] if v is not None]
    if len(window) < 2:
        return "insufficient"
    oldest_first = list(reversed(window))
    pj = project_series(oldest_first, SP500_CAGR)
    return pj["bucket"]


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("Fetching fundamentals (paginated)…")
    rows = fetch_all_fundamentals(supabase)
    print(f"  {len(rows)} rows fetched across all tickers.")

    # Group by ticker, newest-first (already ordered)
    by_ticker: dict[str, list[dict]] = {}
    for r in rows:
        by_ticker.setdefault(r["ticker"], []).append(r)

    ebitda_counts: dict[str, int] = defaultdict(int)
    fcf_counts:    dict[str, int] = defaultdict(int)
    ebitda_by_bucket: dict[str, list[str]] = defaultdict(list)
    fcf_by_bucket:    dict[str, list[str]] = defaultdict(list)

    for ticker, fund_rows in sorted(by_ticker.items()):
        # EBITDA — strip leading zeros (D&A unavailable) before classifying
        ebitda_raw = [r.get("ebitda") for r in fund_rows]
        ebitda_vals: list[float] = []
        for v in ebitda_raw:
            try:
                fv = float(v) if v is not None else None
                if fv is not None:
                    ebitda_vals.append(fv)
            except (TypeError, ValueError):
                pass
        while ebitda_vals and ebitda_vals[0] == 0.0:
            ebitda_vals = ebitda_vals[1:]

        eb = classify(ebitda_vals) if len(ebitda_vals) >= 2 else "insufficient"
        ebitda_counts[eb] += 1
        ebitda_by_bucket[eb].append(ticker)

        # FCF — use raw series (no stripping)
        fcf_raw = [r.get("free_cash_flow") for r in fund_rows]
        fcf_vals: list[float] = []
        for v in fcf_raw:
            try:
                fv = float(v) if v is not None else None
                if fv is not None:
                    fcf_vals.append(fv)
            except (TypeError, ValueError):
                pass

        fb = classify(fcf_vals) if len(fcf_vals) >= 2 else "insufficient"
        fcf_counts[fb] += 1
        fcf_by_bucket[fb].append(ticker)

    total = len(by_ticker)
    sep = "─" * 70

    print(f"\n{'═'*70}")
    print(f"  EBITDA (M1) bucket classification — {total} tickers")
    print(f"{'═'*70}")
    for bucket in ["A", "B0", "B1", "B2", "C", "insufficient"]:
        n = ebitda_counts[bucket]
        if n == 0:
            continue
        pct = n / total * 100
        tickers_str = ", ".join(ebitda_by_bucket[bucket][:20])
        if len(ebitda_by_bucket[bucket]) > 20:
            tickers_str += f" … (+{n-20} more)"
        print(f"\n  Bucket {bucket}: {n} tickers ({pct:.1f}%)")
        print(f"    {tickers_str}")

    ebitda_total_classified = sum(ebitda_counts[b] for b in ["A","B0","B1","B2","C"])
    print(f"\n  Classified (A+B0+B1+B2+C): {ebitda_total_classified}  |  "
          f"Insufficient data: {ebitda_counts['insufficient']}  |  "
          f"Grand total: {total}")
    assert ebitda_total_classified + ebitda_counts["insufficient"] == total, "MECE check failed!"
    print("  ✓ MECE: every ticker in exactly one bucket")

    print(f"\n\n{'═'*70}")
    print(f"  FCF (M2) bucket classification — {total} tickers")
    print(f"{'═'*70}")
    for bucket in ["A", "B0", "B1", "B2", "C", "insufficient"]:
        n = fcf_counts[bucket]
        if n == 0:
            continue
        pct = n / total * 100
        tickers_str = ", ".join(fcf_by_bucket[bucket][:20])
        if len(fcf_by_bucket[bucket]) > 20:
            tickers_str += f" … (+{n-20} more)"
        print(f"\n  Bucket {bucket}: {n} tickers ({pct:.1f}%)")
        print(f"    {tickers_str}")

    fcf_total_classified = sum(fcf_counts[b] for b in ["A","B0","B1","B2","C"])
    print(f"\n  Classified (A+B0+B1+B2+C): {fcf_total_classified}  |  "
          f"Insufficient data: {fcf_counts['insufficient']}  |  "
          f"Grand total: {total}")
    assert fcf_total_classified + fcf_counts["insufficient"] == total, "MECE check failed!"
    print("  ✓ MECE: every ticker in exactly one bucket")


if __name__ == "__main__":
    main()
