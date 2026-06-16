"""
SEC EDGAR segment extractor — product and geographic revenue breakdown.

Fetches the XBRL instance document from the most recent 10-K filing and
extracts dimensional revenue facts (product segments and geographic segments).

Does NOT use edgartools or any third-party XBRL library.
Does NOT modify any other pipeline files.

CLI usage:
    python segment_extractor.py AAPL
    python segment_extractor.py MSFT AMZN
"""
from __future__ import annotations

import logging
import math
import re
import sys
import time
from itertools import combinations
from xml.etree import ElementTree as ET

import requests

log = logging.getLogger(__name__)

_HEADERS   = {"User-Agent": "StockSnack hello@stocksnack.app"}
_DELAY     = 0.1   # seconds between SEC HTTP calls

# Revenue tag preference order (most → least preferred)
_REVENUE_TAGS = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "RevenuesNetOfInterestExpense",   # banks (JPM, BAC, WFC)
    "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
]

# Axes that indicate product segments
_PRODUCT_AXES = {
    "srt:ProductOrServiceAxis",
    "us-gaap:ProductOrServiceAxis",
}

# Axes that indicate geographic segments
_GEO_AXES = {
    "srt:StatementGeographicalAxis",
    "us-gaap:StatementGeographicalAxis",
    "us-gaap:GeographicAreasRevenuesFromExternalCustomersAbstract",
}

# Axes that indicate operating/reportable segments (geo-style for companies
# whose reportable segments ARE geographic regions, e.g. AAPL)
_BIZ_SEGMENT_AXES = {
    "us-gaap:StatementBusinessSegmentsAxis",
}

_NULL_RESULT = {"product_segments": None, "geo_segments": None}

# Segment names that are roll-up rows, not real segments.
# Lowercased exact matches — anything starting with "total" is also excluded.
_NAME_ROLLUPS = {"worldwide", "consolidated"}

# Regex used to truncate verbose segment names (e.g. BKNG stores full SEC
# paragraph text as XBRL labels).  Split at first verb/preposition.
_SPLIT_RE = re.compile(
    r'\b(are|is|were|from|derived|based|include)\b', re.IGNORECASE
)


def _shorten(name: str, max_len: int = 40) -> str:
    """Truncate a verbose segment name at the first verb/preposition, max 40 chars."""
    if len(name) <= max_len:
        return name
    m = _SPLIT_RE.search(name)
    if m:
        short = name[:m.start()].strip().rstrip('.,;:')
        if short:
            if len(short) <= max_len:
                return short
            # split point was itself past max_len — word-boundary cap
            clipped = short[:max_len]
            last_space = clipped.rfind(' ')
            return (clipped[:last_space] if last_space > 0 else clipped).strip()
    # no verb/preposition match — word-boundary hard cap
    truncated = name[:max_len]
    last_space = truncated.rfind(' ')
    return (truncated[:last_space] if last_space > 0 else truncated).strip()


# ── HTTP helper ───────────────────────────────────────────────────────────────

def _get(url: str, timeout: int = 30) -> requests.Response:
    time.sleep(_DELAY)
    resp = requests.get(url, headers=_HEADERS, timeout=timeout)
    resp.raise_for_status()
    return resp


# ── STEP 1: Locate XBRL files ─────────────────────────────────────────────────

def get_xbrl_files(cik: str, ticker: str = "") -> dict[str, str] | None:
    """
    Find the XBRL instance document and label linkbase URLs for the most
    recent 10-K filing.

    Returns {"instance_url": "...", "label_url": "..."} or None on failure.
    """
    # Normalise CIK to 10 digits
    cik_padded = str(cik).lstrip("0").zfill(10)

    # 1. Get submission metadata
    sub_url = f"https://data.sec.gov/submissions/CIK{cik_padded}.json"
    try:
        sub = _get(sub_url).json()
    except Exception as exc:
        log.warning("[%s] Failed to fetch submissions: %s", ticker, exc)
        return None

    # 2. Find most recent 10-K accession number
    recent  = sub.get("filings", {}).get("recent", {})
    forms   = recent.get("form", [])
    accns   = recent.get("accessionNumber", [])
    accn    = next((a for f, a in zip(forms, accns) if f == "10-K"), None)
    if not accn:
        log.warning("[%s] No 10-K found in recent filings", ticker)
        return None

    accn_clean = accn.replace("-", "")
    cik_raw    = str(int(cik_padded))  # no leading zeros for path

    # 3. Fetch filing index HTML
    index_url = f"https://www.sec.gov/Archives/edgar/data/{cik_raw}/{accn_clean}/"
    try:
        html = _get(index_url).text
    except Exception as exc:
        log.warning("[%s] Failed to fetch filing index %s: %s", ticker, index_url, exc)
        return None

    # 4. Extract file names from href links
    hrefs = re.findall(r'href="([^"]+)"', html)
    files = [h.split("/")[-1] for h in hrefs if "." in h.split("/")[-1]]

    def find_file(patterns: list[str]) -> str | None:
        for pat in patterns:
            for f in files:
                if re.search(pat, f, re.IGNORECASE):
                    return f"{index_url}{f}"
        return None

    instance_url = find_file([r"_htm\.xml$", r"_htmx\.xml$"])
    label_url    = find_file([r"_lab\.xml$"])

    if not instance_url:
        log.warning("[%s] No XBRL instance file found in filing %s", ticker, accn)
        return None
    if not label_url:
        log.warning("[%s] No label linkbase found in filing %s", ticker, accn)

    log.info("[%s] XBRL instance: %s", ticker, instance_url)
    log.info("[%s] Label file:    %s", ticker, label_url or "—")

    return {"instance_url": instance_url, "label_url": label_url}


# ── STEP 2: Parse label file ──────────────────────────────────────────────────

def parse_labels(lab_xml_url: str) -> dict[str, str]:
    """
    Parse _lab.xml and return {prefixed_element_name: human_readable_label}.

    Example:
        {"aapl:IPhoneMember": "iPhone",
         "aapl:AmericasSegmentMember": "Americas"}
    """
    labels: dict[str, str] = {}
    if not lab_xml_url:
        return labels
    try:
        xml_bytes = _get(lab_xml_url, timeout=60).content
        root      = ET.fromstring(xml_bytes)
    except Exception as exc:
        log.warning("Failed to fetch/parse label file: %s", exc)
        return labels

    # XML namespaces used in label linkbases
    ns = {
        "link":  "http://www.xbrl.org/2003/linkbase",
        "xlink": "http://www.w3.org/1999/xlink",
        "xbrll": "http://xbrl.org/2008/label",
    }

    # Build arc map: labelArc from→to, then collect labels keyed by "to"
    label_arcs: dict[str, str] = {}   # to_id → element_href
    label_text: dict[str, tuple[str, str]] = {}  # label_id → (role, text)

    for lb in root.iter("{http://www.xbrl.org/2003/linkbase}labelLink"):
        # Collect all label elements
        for lbl in lb.iter("{http://www.xbrl.org/2003/linkbase}label"):
            lid  = lbl.get("{http://www.w3.org/1999/xlink}label", "")
            role = lbl.get("{http://www.w3.org/1999/xlink}role", "")
            text = (lbl.text or "").strip()
            if lid and text:
                label_text[lid] = (role, text)

        # Collect arcs: from=element locator, to=label locator
        locators: dict[str, str] = {}   # label_attr → href
        for loc in lb.iter("{http://www.xbrl.org/2003/linkbase}loc"):
            lattr = loc.get("{http://www.w3.org/1999/xlink}label", "")
            href  = loc.get("{http://www.w3.org/1999/xlink}href",  "")
            if lattr and href:
                locators[lattr] = href

        for arc in lb.iter("{http://www.xbrl.org/2003/linkbase}labelArc"):
            frm = arc.get("{http://www.w3.org/1999/xlink}from", "")
            to  = arc.get("{http://www.w3.org/1999/xlink}to",   "")
            if frm in locators:
                label_arcs[to] = locators[frm]

    # Match label_arc entries to label texts, pick best label per element
    PREFERRED_ROLE = "http://www.xbrl.org/2003/role/terseLabel"
    STD_ROLE       = "http://www.xbrl.org/2003/role/label"

    # Group label texts by the element href they belong to
    href_labels: dict[str, dict[str, str]] = {}  # href → {role: text}
    for lid, (role, text) in label_text.items():
        href = label_arcs.get(lid)
        if href:
            href_labels.setdefault(href, {})[role] = text

    for href, role_map in href_labels.items():
        # Pick terseLabel > label > first available
        text = (role_map.get(PREFERRED_ROLE)
                or role_map.get(STD_ROLE)
                or next(iter(role_map.values())))
        # href is like "aapl-20250927.xsd#aapl_IPhoneMember" or
        # "../../../us-gaap/2024/elts/us-gaap-2024.xsd#us-gaap_ProductMember"
        # Extract the fragment and convert underscore to colon prefix form
        fragment = href.split("#")[-1] if "#" in href else ""
        if "_" in fragment:
            # Convert first underscore to colon: aapl_IPhoneMember → aapl:IPhoneMember
            parts = fragment.split("_", 1)
            key   = f"{parts[0]}:{parts[1]}"
            labels[key] = text

    log.info("Loaded %d labels from label file", len(labels))
    return labels


# ── STEP 3: Parse XBRL instance ───────────────────────────────────────────────

def _clean_member_name(member: str, labels: dict[str, str]) -> str:
    """
    Convert a prefixed member code to a human-readable name.
    Priority: labels lookup → strip prefix+"Member" → camelCase split.
    """
    if member in labels:
        name = labels[member]
        name = re.sub(r"\s*\[Member\]\.?$", "", name).strip()
        name = re.sub(r"\s+Segment$", "", name).strip()
        return _shorten(name)

    # Strip namespace prefix
    local = member.split(":")[-1] if ":" in member else member

    # Strip trailing "Member"
    if local.endswith("Member"):
        local = local[:-6]
    # Strip trailing "Segment"
    if local.endswith("Segment"):
        local = local[:-7]

    # Split camelCase into words
    words = re.sub(r"([A-Z][a-z])", r" \1", local).strip()
    words = re.sub(r"([a-z])([A-Z])", r"\1 \2", words)
    # Collapse multiple spaces
    words = re.sub(r"\s+", " ", words).strip()

    # Number word sequences (multi-word first)
    words = re.sub(r"\bThree Six Five\b", "365", words, flags=re.IGNORECASE)
    words = re.sub(r"\bThree\b", "3", words, flags=re.IGNORECASE)
    words = re.sub(r"\bSix\b", "6", words, flags=re.IGNORECASE)
    words = re.sub(r"\bFive\b", "5", words, flags=re.IGNORECASE)

    # Multi-word acronyms first
    words = re.sub(r"\bNon Us\b",   "Non-US",   words, flags=re.IGNORECASE)
    words = re.sub(r"\bNon Gaap\b", "Non-GAAP", words, flags=re.IGNORECASE)

    # Single-word acronyms
    for old, new in [("Us", "US"), ("Uk", "UK"), ("Eu", "EU"),
                     ("Apac", "APAC"), ("Emea", "EMEA")]:
        words = re.sub(rf"\b{old}\b", new, words, flags=re.IGNORECASE)

    return _shorten(words)


def _parse_contexts(root: ET.Element) -> dict[str, dict]:
    """
    Parse all <context> elements and return:
    {context_id: {"axis": str, "member": str, "period_end": str}}

    Only returns contexts that have exactly one xbrldi:explicitMember
    with a dimension that we care about (product / geo / biz segment).
    """
    ctx_map: dict[str, dict] = {}
    XBRLI = "http://www.xbrl.org/2003/instance"
    XBRLDI = "http://xbrl.org/2006/xbrldi"

    for ctx in root.iter(f"{{{XBRLI}}}context"):
        cid = ctx.get("id", "")

        # Extract period end date
        period_end = ""
        for pe in ctx.iter(f"{{{XBRLI}}}endDate"):
            period_end = (pe.text or "").strip()
            break
        if not period_end:
            for inst in ctx.iter(f"{{{XBRLI}}}instant"):
                period_end = (inst.text or "").strip()
                break
        if not period_end:
            continue

        # Extract explicit members
        members = ctx.findall(f".//{{{XBRLDI}}}explicitMember")

        source = "1dim"
        if len(members) == 1:
            m      = members[0]
            axis   = m.get("dimension", "")
            member = (m.text or "").strip()
        elif len(members) == 2:
            dims = {m.get("dimension", ""): (m.text or "").strip() for m in members}

            # Pattern 1: AMD/JPM style — ConsolidationItemsAxis=OperatingSegmentsMember
            if dims.get("srt:ConsolidationItemsAxis") == "us-gaap:OperatingSegmentsMember":
                other = [k for k in dims if k != "srt:ConsolidationItemsAxis"]
                if len(other) != 1:
                    continue
                axis   = other[0]
                member = dims[axis]

            # Pattern 2: NFLX/single-product style — ProductOrService + Geo.
            # Companies that have one product line report geo breakdowns as 2-dim
            # contexts (e.g. ProductOrServiceAxis=StreamingMember +
            # GeographicalAxis=EMEAMember). Extract the geo dimension.
            elif (any(k in (_PRODUCT_AXES | _BIZ_SEGMENT_AXES) for k in dims) and
                  any(k in _GEO_AXES for k in dims)):
                geo_keys = [k for k in dims if k in _GEO_AXES]
                if len(geo_keys) != 1:
                    continue
                axis   = geo_keys[0]
                member = dims[axis]
                source = "2dim_geo"

            else:
                continue
        else:
            continue

        if not axis or not member:
            continue

        # Only keep axes we care about
        all_relevant = _PRODUCT_AXES | _GEO_AXES | _BIZ_SEGMENT_AXES
        if axis not in all_relevant:
            continue

        ctx_map[cid] = {
            "axis":       axis,
            "member":     member,
            "period_end": period_end,
            "source":     source,
        }

    return ctx_map


def _extract_revenue_facts(
    root: ET.Element,
    ctx_map: dict[str, dict],
    ns_map: dict[str, str],
) -> list[dict]:
    """
    Find all revenue facts whose contextRef is in ctx_map.
    Returns list of {axis, member, period_end, value, tag}.
    """
    facts: list[dict] = []
    USGAAP_NS = "http://fasb.org/us-gaap/"
    # FASB namespace varies by year — search all known variants
    usgaap_variants = [
        "http://fasb.org/us-gaap/",
        "http://fasb.org/us-gaap/2023",
        "http://fasb.org/us-gaap/2024",
        "http://fasb.org/us-gaap/2025",
    ]

    # Dynamically find the actual us-gaap namespace used in this document
    found_ns: set[str] = set()
    for elem in root.iter():
        tag = elem.tag
        if tag.startswith("{") and "us-gaap" in tag:
            ns_uri = tag[1:tag.index("}")]
            found_ns.add(ns_uri)

    # Try each revenue tag
    seen_ctx: set[tuple[str, str]] = set()  # (tag, context_id) dedup

    for rev_tag in _REVENUE_TAGS:
        for ns_uri in found_ns:
            full_tag = f"{{{ns_uri}}}{rev_tag}"
            for elem in root.iter(full_tag):
                ctx_ref = elem.get("contextRef", "")
                if ctx_ref not in ctx_map:
                    continue
                val_str = (elem.text or "").strip()
                try:
                    val = float(val_str)
                except ValueError:
                    continue
                key = (rev_tag, ctx_ref)
                if key in seen_ctx:
                    continue
                seen_ctx.add(key)
                ctx = ctx_map[ctx_ref]
                facts.append({
                    "tag":        rev_tag,
                    "axis":       ctx["axis"],
                    "member":     ctx["member"],
                    "period_end": ctx["period_end"],
                    "value":      val,
                    "source":     ctx.get("source", "1dim"),
                })

    return facts


def _drop_rollups(segments: list[dict]) -> list[dict]:
    """
    Remove parent-aggregate rows using a prefix-guided subset-sum check.

    Standard taxonomy members (us-gaap: / srt:) are rollup candidates.
    Company-specific members (aapl:, amzn:, msft:, …) are always kept.

    A candidate is dropped when its value ≈ sum of any subset of the
    company-specific rows in the group (±2% of the candidate's value).
    Because we check against the fixed set of company rows, one pass suffices.
    """
    if len(segments) <= 1:
        return segments

    def _is_std(s: dict) -> bool:
        m = s.get("member", "")
        return m.startswith("us-gaap:") or m.startswith("srt:")

    company_rows = [s for s in segments if not _is_std(s)]
    std_rows     = [s for s in segments if _is_std(s)]

    if not std_rows:
        return segments  # no rollup candidates

    cv = [s["value"] for s in company_rows]
    n  = len(cv)

    to_drop: set[int] = set()

    for idx, s in enumerate(std_rows):
        v   = s["value"]
        tol = v * 0.02

        if n == 0:
            continue

        # Fast path: v ≈ sum of all company rows
        if abs(v - sum(cv)) <= tol:
            to_drop.add(idx)
            continue

        # Subset search
        check_sizes = range(2, n + 1) if n <= 7 else range(2, 4)
        found = False
        for size in check_sizes:
            for combo in combinations(range(n), size):
                if abs(v - sum(cv[k] for k in combo)) <= tol:
                    found = True
                    break
            if found:
                break
        if found:
            to_drop.add(idx)

    dropped_ids = {id(std_rows[i]) for i in to_drop}
    kept = [s for s in segments if id(s) not in dropped_ids]
    return kept if kept else segments


def _build_segments(
    facts: list[dict],
    axes: set[str],
    labels: dict[str, str],
) -> list[dict] | None:
    """
    From a list of revenue facts, keep only those matching the given axes.
    Compute pct and CAGR across the 3 most recent fiscal years.
    Returns sorted list of segment dicts, or None if no data found.
    """
    # Filter to relevant axes
    relevant = [f for f in facts if f["axis"] in axes]
    if not relevant:
        return None

    # When some facts came from 2-dim Product+Geo contexts (e.g. NFLX reports
    # geo revenue as ProductOrServiceAxis + GeographicalAxis), prefer those over
    # any 1-dim geo facts (e.g. country:US) that may also be in the filing.
    # The 1-dim facts are typically a finer-grained or overlapping subset and
    # would produce incorrect totals if mixed with the 2-dim regional breakdown.
    if any(f.get("source") == "2dim_geo" for f in relevant):
        relevant = [f for f in relevant if f.get("source") == "2dim_geo"]

    # Group by period_end year — pick the year from the date string
    def year_of(period_end: str) -> int:
        return int(period_end[:4]) if period_end else 0

    # Get distinct years, sorted desc, take top 3
    years = sorted({year_of(f["period_end"]) for f in relevant}, reverse=True)[:3]
    if not years:
        return None

    most_recent_year = years[0]

    # For CAGR we need oldest and newest year in the set
    oldest_year  = years[-1]
    n_years      = most_recent_year - oldest_year  # 0 if only 1 year

    # Build {member: {year: value}} — for each member keep most preferred tag
    # (earlier tag in _REVENUE_TAGS list is more preferred)
    member_year_val: dict[str, dict[int, float]] = {}
    tag_priority = {t: i for i, t in enumerate(_REVENUE_TAGS)}

    member_tag: dict[str, str] = {}  # track which tag each member used

    for f in relevant:
        y = year_of(f["period_end"])
        if y not in years:
            continue
        m = f["member"]
        # Only store if this tag is better (lower priority index) than current
        cur_tag = member_tag.get(m)
        if cur_tag is None or tag_priority.get(f["tag"], 99) < tag_priority.get(cur_tag, 99):
            member_year_val.setdefault(m, {})[y] = f["value"]
            member_tag[m] = f["tag"]
        elif f["tag"] == cur_tag:
            member_year_val.setdefault(m, {})[y] = f["value"]

    # Only keep members that have a value in the most recent year
    members_with_recent = {
        m for m, yvals in member_year_val.items()
        if most_recent_year in yvals and yvals[most_recent_year] > 0
    }
    if not members_with_recent:
        return None

    # Total revenue for most recent year (sum across members)
    total_recent = sum(
        member_year_val[m][most_recent_year]
        for m in members_with_recent
    )
    if total_recent <= 0:
        return None

    segments: list[dict] = []
    for m in members_with_recent:
        yvals      = member_year_val[m]
        recent_val = yvals[most_recent_year]

        # CAGR across available years
        cagr: float | None = None
        if n_years >= 1 and oldest_year in yvals and yvals[oldest_year] > 0:
            ratio = recent_val / yvals[oldest_year]
            try:
                cagr = round(math.pow(ratio, 1.0 / n_years) - 1, 4)
            except (ValueError, ZeroDivisionError):
                cagr = None

        name = _clean_member_name(m, labels)
        segments.append({
            "name":   name,
            "value":  round(recent_val),
            "pct":    round(recent_val / total_recent * 100, 1),
            "cagr":   cagr,
            "member": m,   # kept for rollup detection; stripped before return
        })

    # Sort by value descending
    segments.sort(key=lambda s: s["value"], reverse=True)
    segments = _drop_rollups(segments)

    # Drop name-based rollup markers: anything starting with "total",
    # or exact matches for "worldwide" / "consolidated".
    segments = [
        s for s in segments
        if not s["name"].lower().startswith("total")
        and s["name"].lower() not in _NAME_ROLLUPS
    ]

    # Recalculate pct against the post-rollup total and strip internal key
    real_total = sum(s["value"] for s in segments)
    for s in segments:
        s["pct"] = round(s["value"] / real_total * 100, 1) if real_total > 0 else 0.0
        s.pop("member", None)

    return segments if segments else None


def parse_segments(
    instance_xml_url: str,
    labels: dict[str, str],
    ticker: str = "",
) -> dict[str, list[dict] | None]:
    """
    Parse the XBRL instance document and return:
    {"product_segments": [...] | None, "geo_segments": [...] | None}
    """
    try:
        log.info("[%s] Fetching XBRL instance (%s)…", ticker, instance_xml_url)
        xml_bytes = _get(instance_xml_url, timeout=120).content
        root      = ET.fromstring(xml_bytes)
    except Exception as exc:
        log.warning("[%s] Failed to fetch/parse XBRL instance: %s", ticker, exc)
        return _NULL_RESULT

    # Parse contexts
    ctx_map = _parse_contexts(root)
    log.info("[%s] Parsed %d relevant dimensional contexts", ticker, len(ctx_map))

    # Extract all revenue facts that reference dimensional contexts
    facts = _extract_revenue_facts(root, ctx_map, {})
    log.info("[%s] Found %d dimensional revenue facts", ticker, len(facts))

    if not facts:
        log.warning("[%s] No dimensional revenue facts found", ticker)
        return _NULL_RESULT

    # Build product segments — try ProductOrService axis first, fall back to
    # StatementBusinessSegmentsAxis when the product axis returns nothing or only
    # one segment (e.g. GOOGL, META, JPM, AMD all report divisions on BizSegments).
    product         = _build_segments(facts, _PRODUCT_AXES, labels)
    product_used_biz = False
    if product is None or len(product) < 2:
        biz_product = _build_segments(facts, _BIZ_SEGMENT_AXES, labels)
        if biz_product and len(biz_product) >= 2:
            product          = biz_product
            product_used_biz = True
            log.info("[%s] Product segments sourced from StatementBusinessSegmentsAxis", ticker)

    # Build geo segments — try pure geo axes first, fall back to business segment axes
    # (many companies like AAPL report geographic revenue under StatementBusinessSegmentsAxis).
    # Skip the BizSegments fallback if it was already consumed for product above.
    geo = _build_segments(facts, _GEO_AXES, labels)
    if geo is None and not product_used_biz:
        geo = _build_segments(facts, _BIZ_SEGMENT_AXES, labels)
        if geo:
            log.info("[%s] Geo segments sourced from StatementBusinessSegmentsAxis", ticker)

    return {"product_segments": product, "geo_segments": geo}


# ── STEP 4: Public API ─────────────────────────────────────────────────────────

def get_segments(ticker: str, cik: str) -> dict[str, list[dict] | None]:
    """
    Full pipeline: locate XBRL files → parse labels → parse segments.
    Never raises. Returns {"product_segments": None, "geo_segments": None} on any failure.
    """
    try:
        files = get_xbrl_files(cik, ticker)
        if not files:
            return _NULL_RESULT

        labels = parse_labels(files["label_url"]) if files.get("label_url") else {}

        return parse_segments(files["instance_url"], labels, ticker)
    except Exception as exc:
        log.error("[%s] Unexpected error in get_segments: %s", ticker, exc)
        return _NULL_RESULT


# ── STEP 5: CLI ───────────────────────────────────────────────────────────────

def _fmt_cagr(c: float | None) -> str:
    if c is None:
        return "  —  "
    return f"{c * 100:+.1f}%"


def _fmt_val(v: float) -> str:
    bn = v / 1_000_000_000
    if abs(bn) >= 1:
        return f"${bn:.1f}B"
    mn = v / 1_000_000
    return f"${mn:.0f}M"


def _print_table(title: str, segments: list[dict] | None) -> None:
    print(f"\n  {title}")
    print(f"  {'─' * 58}")
    if not segments:
        print("  (no data)")
        return
    print(f"  {'Name':<35} {'Value':>9}  {'Pct':>6}  {'CAGR':>7}")
    print(f"  {'─' * 35} {'─' * 9}  {'─' * 6}  {'─' * 7}")
    for s in segments:
        print(f"  {s['name']:<35} {_fmt_val(s['value']):>9}  {s['pct']:>5.1f}%  {_fmt_cagr(s['cagr']):>7}")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s  %(message)s",
        datefmt="%H:%M:%S",
    )

    import sys
    import os
    # Allow importing sec_client from same directory
    sys.path.insert(0, os.path.dirname(__file__))
    from sec_client import load_cik_map

    tickers = [t.upper() for t in sys.argv[1:]] if len(sys.argv) > 1 else ["AAPL"]

    cik_map = load_cik_map()

    for ticker in tickers:
        cik = cik_map.get(ticker)
        if not cik:
            print(f"\n[{ticker}] CIK not found in cache")
            continue

        print(f"\n{'═' * 62}")
        print(f"  {ticker}  (CIK {cik})")
        print(f"{'═' * 62}")

        result = get_segments(ticker, cik)
        _print_table("PRODUCT BREAKDOWN", result["product_segments"])
        _print_table("GEOGRAPHIC BREAKDOWN", result["geo_segments"])

    print()
