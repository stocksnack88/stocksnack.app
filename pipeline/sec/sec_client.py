"""
SEC EDGAR client — ticker→CIK resolution and raw company facts retrieval.

What this does:
  - Loads and caches the SEC ticker→CIK mapping (company_tickers.json)
  - Fetches raw XBRL company facts JSON for a given ticker or CIK
  - Respects SEC fair-use policy: User-Agent header + 100 ms delay between requests

What this does NOT do:
  - Parse, normalise, or map any financial fields (that is field_mapper.py)
  - Write to Supabase or any database
  - Import from fmp_client.py or touch existing scoring layers
  - Perform any scoring calculations
"""
from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

import requests

log = logging.getLogger(__name__)

_HEADERS = {"User-Agent": "StockSnack hello@stocksnack.app"}
_TICKERS_URL     = "https://www.sec.gov/files/company_tickers.json"
_FACTS_URL       = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
_CACHE_PATH      = Path(__file__).parent / "cik_cache.json"
_FILING_FORMS_OF_INTEREST = {"10-K", "10-Q"}


# ── CIK cache ────────────────────────────────────────────────────────────────

def _fetch_cik_map() -> dict[str, str]:
    """Download company_tickers.json from SEC and return {TICKER: zero-padded-CIK}."""
    time.sleep(0.1)
    resp = requests.get(_TICKERS_URL, headers=_HEADERS, timeout=15)
    resp.raise_for_status()
    raw: dict = resp.json()
    # SEC returns {index: {cik_str, ticker, title}} — flatten to {TICKER: CIK10}
    return {
        entry["ticker"].upper(): str(entry["cik_str"]).zfill(10)
        for entry in raw.values()
    }


def load_cik_map(refresh: bool = False) -> dict[str, str]:
    """
    Return {TICKER: zero-padded-CIK} from local cache, fetching if absent or refresh=True.
    Cache is stored at pipeline/sec/cik_cache.json.
    """
    if not refresh and _CACHE_PATH.exists():
        with _CACHE_PATH.open() as f:
            return json.load(f)

    cik_map = _fetch_cik_map()
    with _CACHE_PATH.open("w") as f:
        json.dump(cik_map, f)
    return cik_map


def ticker_to_cik(ticker: str, refresh: bool = False) -> str | None:
    """Return the zero-padded 10-digit CIK for a ticker, or None if not found."""
    return load_cik_map(refresh).get(ticker.upper())


# ── Company facts ─────────────────────────────────────────────────────────────

def fetch_company_facts(cik: str) -> dict:
    """
    Fetch raw XBRL company facts from SEC EDGAR for a zero-padded CIK.
    Returns the full JSON dict — caller is responsible for parsing.
    Raises requests.HTTPError on non-2xx responses.
    """
    time.sleep(0.1)
    url  = _FACTS_URL.format(cik=cik)
    resp = requests.get(url, headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_facts(ticker: str, refresh_cik: bool = False) -> dict:
    """
    Convenience wrapper: resolve ticker → CIK, then fetch company facts.
    Raises ValueError if ticker is not found in the CIK map.
    """
    cik = ticker_to_cik(ticker, refresh=refresh_cik)
    if not cik:
        raise ValueError(f"Ticker '{ticker}' not found in SEC CIK map")
    return fetch_company_facts(cik)


# ── Smart pull ───────────────────────────────────────────────────────────────

def get_latest_filing(cik: str) -> dict | None:
    """
    Return metadata for the most recent 10-K or 10-Q filing:
    {"accession": ..., "form": ..., "filingDate": ...}.

    Cheap — reads the lightweight submissions index (SEC's "recent" filings
    list is already newest-first), no XBRL parsing. Used as a pre-check to
    decide whether a ticker's data actually needs re-extracting this run.

    Returns None on any failure or if no 10-K/10-Q is found — callers should
    treat that as "cannot determine, extract anyway" (fail open, not closed).
    """
    time.sleep(0.1)
    url = _SUBMISSIONS_URL.format(cik=cik)
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        log.warning("Submissions fetch failed for CIK %s: %s", cik, exc)
        return None

    filings     = data.get("filings", {}).get("recent", {})
    forms       = filings.get("form", [])
    accessions  = filings.get("accessionNumber", [])
    filed_dates = filings.get("filingDate", [])

    for form, acc, filed in zip(forms, accessions, filed_dates):
        if form in _FILING_FORMS_OF_INTEREST:
            return {"accession": acc, "form": form, "filingDate": filed}
    return None


# ── CLI ───────────────────────────────────────────────────────────────────────

def _summarise(facts: dict, ticker: str) -> None:
    """Print a human-readable summary of available XBRL facts."""
    entity = facts.get("entityName", "—")
    cik    = facts.get("cik", "—")
    facts_body = facts.get("facts", {})

    namespaces = list(facts_body.keys())          # e.g. ["us-gaap", "dei", "ifrs-full"]
    total_concepts = sum(len(v) for v in facts_body.values())

    print(f"\nSEC EDGAR facts for {ticker} ({entity})")
    print(f"  CIK            : {cik}")
    print(f"  Namespaces     : {', '.join(namespaces)}")
    print(f"  Total concepts : {total_concepts}")

    for ns, concepts in facts_body.items():
        print(f"\n  [{ns}] — {len(concepts)} concepts")
        sample = list(concepts.keys())[:10]
        for name in sample:
            units = list(concepts[name].get("units", {}).keys())
            print(f"    {name:<50} units: {units}")
        if len(concepts) > 10:
            print(f"    … and {len(concepts) - 10} more")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sec_client.py <TICKER> [--refresh-cik]")
        sys.exit(1)

    _ticker      = sys.argv[1].upper()
    _refresh_cik = "--refresh-cik" in sys.argv

    print(f"Resolving CIK for {_ticker}…")
    _cik = ticker_to_cik(_ticker, refresh=_refresh_cik)
    if not _cik:
        print(f"Error: '{_ticker}' not found in SEC CIK map.")
        sys.exit(1)
    print(f"CIK: {_cik}")

    print("Fetching company facts from SEC EDGAR…")
    _facts = fetch_company_facts(_cik)
    _summarise(_facts, _ticker)
