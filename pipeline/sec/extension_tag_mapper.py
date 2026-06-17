"""
Extension tag mapper for companies that use custom XBRL namespace tags
(e.g. ``pcg:DepreciationAmortizationDecommissioning``) that are invisible
to the SEC EDGAR company_facts API.

Values are extracted by downloading the raw XBRL instance document attached
to each 10-K filing, parsing the XML directly.

Usage
-----
    from extension_tag_mapper import extract_extension_tags
    found = extract_extension_tags("PCG", years=5)

Returns True if at least one extension field was written to extracted_data.csv.
"""
from __future__ import annotations

import csv
import logging
import re
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from pathlib import Path

import requests

log = logging.getLogger(__name__)

_DIR = Path(__file__).parent
_EXTRACTED_CSV   = _DIR / "extracted_data.csv"
_MISSING_LOG_CSV = _DIR / "missing_log.csv"

# ── Extension tag registry ────────────────────────────────────────────────────
# {TICKER: {standardised_name: (namespace_prefix, local_name)}}
# namespace_prefix is the label used in xmlns declarations in the XBRL document
# (e.g. "pcg" maps to the full URI — we match local names without the URI).
_EXTENSION_TAGS: dict[str, dict[str, tuple[str, str]]] = {
    "PCG": {
        "depreciation_amortization": ("pcg", "DepreciationAmortizationDecommissioning"),
    },
}

_SEC_HEADERS = {"User-Agent": "stocksnack mrepsiloned@gmail.com"}
_ANNUAL_DURATION_DAYS = (330, 380)  # inclusive range for ~1-year context periods


# ── XBRL instance document fetching ──────────────────────────────────────────

def _get_cik(ticker: str) -> str | None:
    """Resolve ticker to zero-padded 10-digit CIK via SEC EDGAR."""
    url = "https://efts.sec.gov/LATEST/search-index?q=%22{}%22&dateRange=custom&startdt=2000-01-01&enddt=2030-01-01&forms=10-K".format(ticker)
    # Simpler: use the tickers.json endpoint
    url = "https://www.sec.gov/files/company_tickers.json"
    try:
        resp = requests.get(url, headers=_SEC_HEADERS, timeout=30)
        resp.raise_for_status()
        for entry in resp.json().values():
            if entry.get("ticker", "").upper() == ticker.upper():
                return str(entry["cik_str"]).zfill(10)
    except Exception as exc:
        log.warning("CIK lookup failed for %s: %s", ticker, exc)
    return None


def _get_recent_10k_accessions(cik: str, n: int = 3) -> list[dict]:
    """
    Return up to ``n`` most recent 10-K filing metadata dicts from submissions.
    Each dict has keys: accession, filingDate, reportDate.
    """
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    try:
        resp = requests.get(url, headers=_SEC_HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        log.warning("Submissions fetch failed for CIK %s: %s", cik, exc)
        return []

    filings = data.get("filings", {}).get("recent", {})
    forms        = filings.get("form", [])
    accessions   = filings.get("accessionNumber", [])
    filing_dates = filings.get("filingDate", [])
    report_dates = filings.get("reportDate", [])

    results = []
    for form, acc, filed, report in zip(forms, accessions, filing_dates, report_dates):
        if form == "10-K":
            results.append({
                "accession":  acc.replace("-", ""),
                "filingDate": filed,
                "reportDate": report,
            })
        if len(results) >= n:
            break
    return results


def _get_xbrl_instance_url(cik: str, accession: str) -> str | None:
    """
    Find the primary XBRL instance document (_htm.xml file) in a 10-K filing
    index and return its URL.
    """
    acc_dash = f"{accession[:10]}-{accession[10:12]}-{accession[12:]}"
    index_url = (
        f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/"
        f"{accession}/{acc_dash}-index.htm"
    )
    try:
        resp = requests.get(index_url, headers=_SEC_HEADERS, timeout=30)
        resp.raise_for_status()
        # Find htm.xml file link in the index page
        match = re.search(r'href="(/Archives/edgar/data/[^"]+_htm\.xml)"', resp.text)
        if match:
            return "https://www.sec.gov" + match.group(1)
    except Exception as exc:
        log.warning("XBRL index fetch failed for accession %s: %s", accession, exc)
    return None


# ── XML parsing ───────────────────────────────────────────────────────────────

def _parse_annual_contexts(root: ET.Element) -> dict[str, int]:
    """
    Parse <context> elements and return {context_id: fiscal_year} for all
    annual contexts (~350–380 day durations) without a segment/entity breakdown.
    """
    ns_map: dict[str, str] = {}
    for key, val in root.attrib.items():
        if key.startswith("{") or ":" not in key:
            continue
        # Collect xmlns:prefix="uri" attributes (available as attrib in lxml but
        # not in stdlib ET; use regex fallback below instead)
        pass

    # ElementTree exposes namespaces via the tag strings like {uri}localName.
    # We can extract the xbrli context URI from the first <context> tag we find.
    contexts: dict[str, int] = {}
    for elem in root:
        local = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        if local != "context":
            continue

        ctx_id = elem.attrib.get("id", "")

        # Skip contexts with a <segment> child (dimension breakdowns)
        has_segment = any(
            (c.tag.split("}")[-1] if "}" in c.tag else c.tag) == "segment"
            for child in elem
            for c in [child]
        )
        # Also check nested entity > segment
        entity_elem = next(
            (c for c in elem if (c.tag.split("}")[-1] if "}" in c.tag else c.tag) == "entity"),
            None,
        )
        if entity_elem is not None:
            has_segment = any(
                (c.tag.split("}")[-1] if "}" in c.tag else c.tag) == "segment"
                for c in entity_elem
            )
        if has_segment:
            continue

        period_elem = next(
            (c for c in elem if (c.tag.split("}")[-1] if "}" in c.tag else c.tag) == "period"),
            None,
        )
        if period_elem is None:
            continue

        start_elem = next(
            (c for c in period_elem if (c.tag.split("}")[-1] if "}" in c.tag else c.tag) == "startDate"),
            None,
        )
        end_elem = next(
            (c for c in period_elem if (c.tag.split("}")[-1] if "}" in c.tag else c.tag) == "endDate"),
            None,
        )
        if start_elem is None or end_elem is None:
            continue

        try:
            start_date = date.fromisoformat(start_elem.text.strip())
            end_date   = date.fromisoformat(end_elem.text.strip())
        except (ValueError, AttributeError):
            continue

        duration = (end_date - start_date).days
        lo, hi = _ANNUAL_DURATION_DAYS
        if lo <= duration <= hi:
            contexts[ctx_id] = end_date.year

    return contexts


def _extract_extension_values(
    xml_text: str,
    namespace_prefix: str,
    local_name: str,
    annual_contexts: dict[str, int],
) -> dict[int, float]:
    """
    Extract values for one extension tag from raw XBRL XML text.
    Returns {fiscal_year: value}.  When multiple contexts map to the same year,
    uses the value from the context with the latest end date (parsed from ctx ID).
    """
    # Find the namespace URI for the prefix (e.g. xmlns:pcg="http://...pcg...")
    ns_uri = None
    for m in re.finditer(r'xmlns:' + re.escape(namespace_prefix) + r'\s*=\s*"([^"]+)"', xml_text):
        ns_uri = m.group(1)
        break

    if ns_uri:
        tag_pattern = "{" + ns_uri + "}" + local_name
    else:
        # Fall back to matching local name only
        tag_pattern = None

    results: dict[int, float] = {}

    # Regex approach: find all elements matching the tag in the raw text
    # (avoids namespace resolution complexity in stdlib ET)
    pattern = re.compile(
        r'<(?:' + re.escape(namespace_prefix) + r':)?' + re.escape(local_name)
        + r'\s[^>]*contextRef="([^"]+)"[^>]*>([^<]+)<',
        re.MULTILINE,
    )
    for m in pattern.finditer(xml_text):
        ctx_ref = m.group(1)
        raw_val = m.group(2).strip()
        if ctx_ref not in annual_contexts:
            continue
        try:
            val = float(raw_val)
        except ValueError:
            continue
        yr = annual_contexts[ctx_ref]
        # Keep value from latest-filed context for this year (take abs if negative)
        if yr not in results:
            results[yr] = val
        # If the same year appears twice, prefer larger absolute value (more complete)
        elif abs(val) > abs(results[yr]):
            results[yr] = val

    return results


# ── CSV writers (mirror field_mapper.py) ─────────────────────────────────────

def _load_extracted_keys() -> set[tuple[str, int, str, str]]:
    keys: set[tuple[str, int, str, str]] = set()
    if not _EXTRACTED_CSV.exists():
        return keys
    with _EXTRACTED_CSV.open(newline="") as f:
        for row in csv.DictReader(f):
            try:
                keys.add((
                    row["ticker"],
                    int(row["fiscal_year"]),
                    row["standardised_name"],
                    row.get("original_tag", ""),
                ))
            except (KeyError, ValueError):
                pass
    return keys


def _append_extracted(rows: list[dict]) -> None:
    if not rows:
        return
    existing = _load_extracted_keys()
    new_rows = [
        r for r in rows
        if (r["ticker"], int(r["fiscal_year"]), r["standardised_name"], r.get("original_tag", ""))
        not in existing
    ]
    if not new_rows:
        return
    write_header = not _EXTRACTED_CSV.exists() or _EXTRACTED_CSV.stat().st_size == 0
    with _EXTRACTED_CSV.open("a", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["ticker", "fiscal_year", "standardised_name",
                        "original_tag", "value", "unit", "pulled_at", "period_of_report"],
            extrasaction="ignore",
        )
        if write_header:
            writer.writeheader()
        writer.writerows(new_rows)


def _log_missing(ticker: str, field: str, note: str) -> None:
    fieldnames = ["ticker", "standardised_name", "status", "detected_at", "resolved_at", "notes"]
    write_header = not _MISSING_LOG_CSV.exists() or _MISSING_LOG_CSV.stat().st_size == 0
    with _MISSING_LOG_CSV.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        writer.writerow({
            "ticker":            ticker,
            "standardised_name": field,
            "status":            "MISSING",
            "detected_at":       datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "resolved_at":       "",
            "notes":             note,
        })


# ── Public entry point ────────────────────────────────────────────────────────

def extract_extension_tags(ticker: str, years: int = 5) -> bool:
    """
    Extract extension-namespace XBRL tags for ``ticker`` (if registered in
    ``_EXTENSION_TAGS``) and write results to extracted_data.csv.

    Returns True if at least one field was extracted, False otherwise.
    """
    ext_fields = _EXTENSION_TAGS.get(ticker.upper())
    if not ext_fields:
        return False

    cik = _get_cik(ticker)
    if not cik:
        log.error("[%s] extension_tag_mapper: could not resolve CIK", ticker)
        return False

    # Each 10-K covers 3 years of comparatives; adjacent filings overlap by 2 years,
    # so each additional filing adds 1 new year: need (years - 2) extra filings.
    n_filings = max(2, years - 2)
    filings = _get_recent_10k_accessions(cik, n=n_filings)
    if not filings:
        log.error("[%s] extension_tag_mapper: no 10-K filings found", ticker)
        return False

    pulled_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    any_found = False

    for std_name, (ns_prefix, local_name) in ext_fields.items():
        combined: dict[int, float] = {}

        for filing in filings:
            acc = filing["accession"]
            xbrl_url = _get_xbrl_instance_url(cik, acc)
            if not xbrl_url:
                log.warning("[%s] extension_tag_mapper: no XBRL URL for accession %s", ticker, acc)
                continue

            try:
                resp = requests.get(xbrl_url, headers=_SEC_HEADERS, timeout=60)
                resp.raise_for_status()
                xml_text = resp.text
            except Exception as exc:
                log.warning("[%s] extension_tag_mapper: XBRL fetch failed %s: %s", ticker, xbrl_url, exc)
                continue

            try:
                root = ET.fromstring(xml_text.encode("utf-8"))
            except ET.ParseError as exc:
                log.warning("[%s] extension_tag_mapper: XML parse error for %s: %s", ticker, acc, exc)
                continue

            annual_contexts = _parse_annual_contexts(root)
            year_vals = _extract_extension_values(xml_text, ns_prefix, local_name, annual_contexts)

            for yr, val in year_vals.items():
                if yr not in combined:
                    combined[yr] = val

        if not combined:
            log.warning("[%s] extension_tag_mapper: no data found for %s:%s", ticker, ns_prefix, local_name)
            _log_missing(ticker, std_name, f"extension tag {ns_prefix}:{local_name} not found in XBRL")
            continue

        top_years = sorted(combined)[-years:]
        tag_label = f"{ns_prefix}:{local_name}"
        rows = []
        for yr in top_years:
            val = combined[yr]
            log.info("[%s] %s %d: tag=%s value=%.0f", ticker, std_name, yr, tag_label, val)
            rows.append({
                "ticker":            ticker,
                "fiscal_year":       yr,
                "standardised_name": std_name,
                "original_tag":      tag_label,
                "value":             val,
                "unit":              "USD",
                "pulled_at":         pulled_at,
                "period_of_report":  f"{yr}-12-31",
            })

        _append_extracted(rows)
        any_found = True
        print(
            f"[extension_tag_mapper] {ticker} {std_name}: extracted {len(rows)} years "
            f"via {tag_label}",
            flush=True,
        )

    return any_found
