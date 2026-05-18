"""
SEC EDGAR normalizer — maps extracted_data.csv fields to FMP-compatible dicts.

What this does:
  - load_extracted_data(): reads extracted_data.csv for a ticker
  - normalise(): runs extract_all then maps internal names → FMP field names,
    applies sign conventions, returns list newest-first
  - normalise_for_price(): returns latest year dict only

What this does NOT do:
  - Fetch any data from the internet (that is sec_client.py)
  - Touch any existing scoring layers or fmp_client.py
  - Raise exceptions — missing fields default to 0
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path
from typing import Any

_DIR = Path(__file__).parent
_EXTRACTED_CSV = _DIR / "extracted_data.csv"

# Internal name → FMP field name
_FIELD_MAP: list[tuple[str, str]] = [
    ("revenue",                   "revenue"),
    ("gross_profit",              "grossProfit"),
    ("operating_income",          "operatingIncome"),
    ("net_income",                "netIncome"),
    ("eps_diluted",               "epsdiluted"),
    ("sga_expense",               "sellingGeneralAndAdministrativeExpenses"),
    ("rd_expense",                "researchAndDevelopmentExpenses"),
    ("interest_expense",          "interestExpense"),
    ("income_tax_expense",        "incomeTaxExpense"),
    ("ebitda",                    "ebitda"),
    ("operating_cash_flow",       "operatingCashFlow"),
    ("capital_expenditure",       "capitalExpenditure"),
    ("free_cash_flow",            "freeCashFlow"),
    ("stock_based_compensation",  "stockBasedCompensation"),
    ("dividends_paid",            "netDividendsPaid"),
    ("common_stock_repurchased",  "commonStockRepurchased"),
    ("depreciation_amortization", "depreciationAndAmortization"),
    ("cash_and_equivalents",      "cashAndCashEquivalents"),
    ("total_debt",                "totalDebt"),
    ("total_equity",              "totalStockholdersEquity"),
    ("total_assets",              "totalAssets"),
    ("total_liabilities",         "totalLiabilities"),
    ("retained_earnings",         "retainedEarnings"),
    ("preferred_stock",           "preferredStock"),
    ("goodwill_and_intangibles",  "goodwillAndIntangibleAssets"),
    ("shares_outstanding",        "weightedAverageShsOutDil"),
]

# SEC stores these as positive outflows; FMP expects negative
_NEGATE = {"capitalExpenditure", "netDividendsPaid", "commonStockRepurchased"}

# Fields that legitimately default to 0 when absent (no warning)
_SILENT_DEFAULTS = {"preferredStock", "goodwillAndIntangibleAssets"}


# ── Data loader ───────────────────────────────────────────────────────────────

def load_extracted_data(ticker: str, years: int = 5) -> dict[int, dict[str, float]]:
    """
    Read extracted_data.csv for a ticker.

    Each field independently selects its own most recent N years of data.
    The returned dict covers the union of all years that appear across all
    fields (newest N only). Fields with no data for a given year are absent
    from that year's sub-dict (callers default to 0).

    Returns {fiscal_year: {internal_name: value}}.
    """
    if not _EXTRACTED_CSV.exists():
        return {}

    # Group all rows by field name → {name: [(year, value), ...]}
    by_field: dict[str, list[tuple[int, float]]] = {}
    with _EXTRACTED_CSV.open(newline="") as f:
        for row in csv.DictReader(f):
            if row.get("ticker", "").upper() != ticker.upper():
                continue
            try:
                yr    = int(row["fiscal_year"])
                name  = row["standardised_name"]
                value = float(row["value"])
            except (KeyError, ValueError):
                continue
            by_field.setdefault(name, []).append((yr, value))

    if not by_field:
        return {}

    # For each field, keep only its most recent N years.
    # Multiple original_tags for the same standardised_name can each contribute
    # a row for the same fiscal year (audit trail design). Deduplicate by year
    # first — keeping the highest value — so duplicate tag rows don't consume
    # extra slots in the top-N window and push out older genuine years.
    result: dict[int, dict[str, float]] = {}
    for name, pairs in by_field.items():
        by_yr: dict[int, float] = {}
        for yr, value in pairs:
            if yr not in by_yr or value > by_yr[yr]:
                by_yr[yr] = value
        deduped = sorted(by_yr.items(), key=lambda p: p[0], reverse=True)[:years]
        for yr, value in deduped:
            result.setdefault(yr, {})[name] = value

    # Return only the newest N years across all fields
    top_years = sorted(result.keys(), reverse=True)[:years]
    return {yr: result[yr] for yr in top_years}


# ── Normaliser ────────────────────────────────────────────────────────────────

def normalise(ticker: str, years: int = 5) -> list[dict[str, Any]]:
    """
    Pull fresh data via extract_all, then map to FMP-compatible dicts.
    Returns list sorted newest to oldest. Missing fields default to 0.
    """
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    from field_mapper import extract_all

    extract_all(ticker, years=years)
    by_year = load_extracted_data(ticker, years=years)

    if not by_year:
        print(f"[normalizer] {ticker}: no data in extracted_data.csv", file=sys.stderr)
        return []

    sorted_years = sorted(by_year.keys(), reverse=True)
    records: list[dict[str, Any]] = []

    for yr in sorted_years:
        year_data = by_year[yr]
        rec: dict[str, Any] = {
            "symbol": ticker.upper(),
            "date":   f"{yr}-12-31",
        }
        for internal, fmp in _FIELD_MAP:
            raw = year_data.get(internal)
            if raw is None:
                value: float = 0.0
            else:
                value = float(raw)
                if fmp in _NEGATE and value > 0:
                    value = -value
            rec[fmp] = value
        records.append(rec)

    return records


def normalise_for_price(ticker: str) -> dict[str, Any]:
    """Return only the latest year dict — used by layer1 for current metrics."""
    records = normalise(ticker, years=1)
    return records[0] if records else {}


# ── CLI ───────────────────────────────────────────────────────────────────────

def _fmt_value(v: Any) -> str:
    if isinstance(v, float) and abs(v) >= 1:
        return f"{v:>22,.0f}"
    if isinstance(v, float):
        return f"{v:>22.4f}"
    return str(v)


if __name__ == "__main__":
    import os
    sys.path.insert(0, os.path.dirname(__file__))

    if len(sys.argv) < 2:
        print("Usage:")
        print("  python normalizer.py <TICKER>")
        print("  python normalizer.py <TICKER> compare")
        sys.exit(1)

    _ticker  = sys.argv[1].upper()
    _compare = len(sys.argv) > 2 and sys.argv[2].lower() == "compare"

    print(f"[normalizer] running extract_all for {_ticker}…", file=sys.stderr)
    _records = normalise(_ticker)

    if not _records:
        print(f"No data returned for {_ticker}.")
        sys.exit(1)

    if _compare:
        # Side-by-side: internal name vs FMP name for latest year
        latest = _records[0]
        print(f"\n{'─'*72}")
        print(f"  {_ticker}  FY{latest['date'][:4]}  —  internal name → FMP name mapping")
        print(f"{'─'*72}")
        print(f"  {'INTERNAL NAME':<32} {'FMP NAME':<38} VALUE")
        print(f"  {'─'*32} {'─'*38} {'─'*22}")
        for internal, fmp in _FIELD_MAP:
            v = latest.get(fmp, 0)
            neg_marker = " ◀ negated" if fmp in _NEGATE else ""
            print(f"  {internal:<32} {fmp:<38} {_fmt_value(v)}{neg_marker}")
        print(f"{'─'*72}")
        sys.exit(0)

    # Standard output: one block per year
    print(f"\n{'─'*60}")
    print(f"  {_ticker}  —  normalised SEC data  ({len(_records)} years)")
    print(f"{'─'*60}")

    zero_warnings: list[tuple[str, str, str]] = []  # (year, fmp_name, internal_name)

    for rec in _records:
        yr = rec["date"][:4]
        print(f"\n  FY{yr}  ({rec['date']})")
        for internal, fmp in _FIELD_MAP:
            v = rec.get(fmp, 0)
            neg_marker = " ◀" if fmp in _NEGATE else ""
            print(f"    {fmp:<44} {_fmt_value(v)}{neg_marker}")
            if v == 0 and fmp not in _SILENT_DEFAULTS:
                zero_warnings.append((yr, fmp, internal))

    print(f"\n{'─'*60}")

    if zero_warnings:
        print(f"\n  ⚠  Fields that defaulted to 0 (may need tag_mapping update):")
        for yr, fmp, internal in zero_warnings:
            print(f"     FY{yr}  {fmp}  (internal: {internal})")
    else:
        print(f"\n  ✓  No unexpected zero defaults.")
