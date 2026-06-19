"""
IFRS-full field mapper for foreign private issuers that file 20-F with the SEC.

Mirrors the structure of field_mapper.py but targets the ``ifrs-full`` namespace
instead of ``us-gaap``.  Extracts USD-denominated values where available; falls
back to the dominant currency unit when USD is absent (the caller can apply FX
conversion in that case).

Writes results to the same ``extracted_data.csv`` file used by the US-GAAP path
so that ``normalizer.py`` can read them without modification.

Currently supports: TSM (TSMC) and any other 20-F IFRS filer.
"""
from __future__ import annotations

import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

_DIR = Path(__file__).parent
_EXTRACTED_CSV  = _DIR / "extracted_data.csv"
_MISSING_LOG_CSV = _DIR / "missing_log.csv"

# ── IFRS tag mapping ──────────────────────────────────────────────────────────
# Each entry: (standardised_name, [(ifrs_tag, preferred_unit), ...])
# First entry in the list whose preferred_unit has 20-F FY data wins.
# For fields that need summing (D&A, total_debt), see _IFRS_SUM_FIELDS below.
_IFRS_TAGS: list[tuple[str, list[tuple[str, str]]]] = [
    ("revenue", [
        ("Revenue", "USD"),
    ]),
    ("gross_profit", [
        ("GrossProfit", "USD"),
    ]),
    ("operating_income", [
        ("ProfitLossFromOperatingActivities", "USD"),
    ]),
    ("net_income", [
        ("ProfitLossAttributableToOwnersOfParent", "USD"),
        ("ProfitLoss", "USD"),
    ]),
    ("operating_cash_flow", [
        ("CashFlowsFromUsedInOperatingActivities", "USD"),
    ]),
    ("capital_expenditure", [
        ("PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "USD"),
    ]),
    ("income_tax_expense", [
        ("IncomeTaxExpenseContinuingOperations", "USD"),
    ]),
    ("cash_and_equivalents", [
        ("CashAndCashEquivalents", "USD"),
    ]),
    ("total_assets", [
        ("Assets", "USD"),
    ]),
    ("total_equity", [
        ("EquityAttributableToOwnersOfParent", "USD"),
        ("Equity", "USD"),
    ]),
    ("retained_earnings", [
        ("RetainedEarnings", "USD"),
    ]),
    ("dividends_paid", [
        ("DividendsPaidClassifiedAsFinancingActivities", "USD"),
    ]),
    ("stock_based_compensation", [
        ("AdjustmentsForSharebasedPayments", "USD"),
    ]),
    ("eps_diluted", [
        ("DilutedEarningsLossPerShare", "USD/shares"),
        ("BasicEarningsLossPerShare",  "USD/shares"),
    ]),
    ("shares_outstanding", [
        ("WeightedAverageShares",         "shares"),
        ("AdjustedWeightedAverageShares", "shares"),
    ]),
]

# Fields built by summing multiple IFRS tags (first wins per tag — never double-counts).
# Both components must be in the same unit.
_IFRS_SUM_FIELDS: dict[str, list[tuple[str, str]]] = {
    "depreciation_amortization": [
        ("DepreciationExpense",   "USD"),
        ("AmortisationExpense",   "USD"),
    ],
    "total_debt": [
        ("LongtermBorrowings",                    "USD"),
        ("CurrentPortionOfLongtermBorrowings",     "USD"),
    ],
    # ebitda = operating_income + D&A (same three tags as above, summed together)
    "ebitda": [
        ("ProfitLossFromOperatingActivities", "USD"),
        ("DepreciationExpense",               "USD"),
        ("AmortisationExpense",               "USD"),
    ],
}

# Annual form types for foreign private issuers (20-F = annual; 6-K = interim)
_ANNUAL_FORMS = {"20-F"}


# ── Core extraction ───────────────────────────────────────────────────────────

def _get_ifrs(facts_json: dict) -> dict:
    return facts_json.get("facts", {}).get("ifrs-full", {})


def _extract_ifrs_tag(
    ifrs: dict,
    tag: str,
    preferred_unit: str,
    years: int,
) -> list[dict]:
    """
    Pull 20-F FY annual values for one ifrs-full tag.
    Returns [{"year": int, "value": float}, ...] for up to ``years`` most
    recent periods, or [] if the tag/unit is absent or has no annual data.
    """
    concept = ifrs.get(tag)
    if not concept:
        return []

    units: dict = concept.get("units", {})
    if not units:
        return []

    # Strict unit check — never fall back to a different currency (e.g. TWD instead of USD).
    if preferred_unit not in units:
        return []
    entries = units[preferred_unit]
    if not entries:
        return []

    annual = [
        e for e in entries
        if e.get("form") in _ANNUAL_FORMS
        and e.get("fp") == "FY"
        and e.get("val") is not None
    ]
    if not annual:
        return []

    # Group by end-year, keep the most recently filed entry per period.
    by_year: dict[int, dict] = {}
    for e in annual:
        end = e.get("end", "")
        if not end:
            continue
        try:
            end_year = int(end[:4])
        except ValueError:
            continue
        cur = by_year.get(end_year)
        if cur is None or e.get("filed", "") > cur.get("filed", ""):
            by_year[end_year] = e

    top = sorted(by_year.keys())[-years:]
    return [{"year": yr, "value": float(by_year[yr]["val"])} for yr in top]


def _write_extracted(rows: list[dict]) -> None:
    """Append rows to extracted_data.csv (same schema as field_mapper.py)."""
    fieldnames = [
        "ticker", "fiscal_year", "standardised_name",
        "original_tag", "value", "unit", "source", "pulled_at",
    ]
    write_header = not _EXTRACTED_CSV.exists() or _EXTRACTED_CSV.stat().st_size == 0
    with _EXTRACTED_CSV.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        writer.writerows(rows)


def _log_missing(ticker: str, field: str, note: str) -> None:
    """Append one row to missing_log.csv."""
    fieldnames = ["ticker", "standardised_name", "status", "date", "tag", "note"]
    write_header = not _MISSING_LOG_CSV.exists() or _MISSING_LOG_CSV.stat().st_size == 0
    with _MISSING_LOG_CSV.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        writer.writerow({
            "ticker":            ticker,
            "standardised_name": field,
            "status":            "MISSING",
            "date":              datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "tag":               "",
            "note":              note,
        })


# ── Public entry point ────────────────────────────────────────────────────────

def extract_ifrs_all(ticker: str, facts_json: dict, years: int = 5) -> bool:
    """
    Extract all known IFRS fields for ``ticker`` and write to extracted_data.csv.

    Returns True if at least one field was extracted, False otherwise (meaning
    the ticker has no recognisable IFRS data and should fall back elsewhere).
    """
    ifrs = _get_ifrs(facts_json)
    if not ifrs:
        return False

    pulled_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows_to_write: list[dict] = []
    any_found = False

    # ── Single-tag fields ─────────────────────────────────────────────────────
    for std_name, tag_list in _IFRS_TAGS:
        found = False
        for tag, unit in tag_list:
            series = _extract_ifrs_tag(ifrs, tag, unit, years)
            if series:
                for pt in series:
                    rows_to_write.append({
                        "ticker":            ticker,
                        "fiscal_year":       pt["year"],
                        "standardised_name": std_name,
                        "original_tag":      tag,
                        "value":             pt["value"],
                        "unit":              unit,
                        "source":            "ifrs",
                        "pulled_at":         pulled_at,
                    })
                found = True
                any_found = True
                break  # first matching tag wins
        if not found:
            _log_missing(ticker, std_name, "no IFRS USD annual data found")

    # ── Summed fields (D&A, total_debt) ──────────────────────────────────────
    for std_name, components in _IFRS_SUM_FIELDS.items():
        per_year: dict[int, float] = {}
        tags_used: list[str] = []
        for tag, unit in components:
            series = _extract_ifrs_tag(ifrs, tag, unit, years)
            if series:
                tags_used.append(tag)
                for pt in series:
                    per_year[pt["year"]] = per_year.get(pt["year"], 0.0) + pt["value"]

        if per_year:
            tag_label = "+".join(tags_used)
            for yr in sorted(per_year)[-years:]:
                rows_to_write.append({
                    "ticker":            ticker,
                    "fiscal_year":       yr,
                    "standardised_name": std_name,
                    "original_tag":      tag_label,
                    "value":             per_year[yr],
                    "unit":              "USD",
                    "source":            "ifrs",
                    "pulled_at":         pulled_at,
                })
            any_found = True
        else:
            _log_missing(ticker, std_name, "no IFRS components found")

    # ── Computed fields: FCF = operating_cash_flow − capital_expenditure ────────
    # IFRS capex tag is stored as a positive outflow magnitude (normalizer negates
    # it when writing to DB), so FCF = OCF − capex (both positive in extracted_data).
    _ocf_map   = {r["fiscal_year"]: r["value"] for r in rows_to_write if r["standardised_name"] == "operating_cash_flow"}
    _capex_map = {r["fiscal_year"]: r["value"] for r in rows_to_write if r["standardised_name"] == "capital_expenditure"}
    for yr in sorted(set(_ocf_map) & set(_capex_map)):
        fcf = _ocf_map[yr] - _capex_map[yr]
        rows_to_write.append({
            "ticker":            ticker,
            "fiscal_year":       yr,
            "standardised_name": "free_cash_flow",
            "original_tag":      "computed: operating_cash_flow - capital_expenditure",
            "value":             fcf,
            "unit":              "USD",
            "source":            "ifrs",
            "pulled_at":         pulled_at,
        })
    if _ocf_map and _capex_map:
        any_found = True

    if rows_to_write:
        _write_extracted(rows_to_write)

    return any_found
