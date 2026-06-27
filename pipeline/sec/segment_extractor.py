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
    # IFRS filers (20-F, e.g. TSM)
    "ifrs-full:Revenue",
    "ifrs-full:RevenueFromContractsWithCustomers",
]

# Axes that indicate product segments
_PRODUCT_AXES = {
    "srt:ProductOrServiceAxis",
    "us-gaap:ProductOrServiceAxis",
    # IFRS filers use end-market breakdown (e.g. TSM: HPC, Smartphone, Auto…)
    "ifrs-full:MarketsOfCustomersAxis",
}

# Axes that indicate geographic segments
_GEO_AXES = {
    "srt:StatementGeographicalAxis",
    "us-gaap:StatementGeographicalAxis",
    "us-gaap:GeographicAreasRevenuesFromExternalCustomersAbstract",
    # IFRS filers (20-F)
    "ifrs-full:GeographicalAreasAxis",
}

# Axes that indicate operating/reportable segments (geo-style for companies
# whose reportable segments ARE geographic regions, e.g. AAPL)
_BIZ_SEGMENT_AXES = {
    "us-gaap:StatementBusinessSegmentsAxis",
}

_NULL_RESULT = {"product_segments": None, "geo_segments": None}

# Segment names that are roll-up rows, not real segments.
# Lowercased exact matches — anything starting with "total" is also excluded.
_NAME_ROLLUPS = {"worldwide", "consolidated", "revenue to unaffiliated customers,", "revenues"}

# Regex used to truncate verbose segment names (e.g. BKNG stores full SEC
# paragraph text as XBRL labels).  Split at first verb/preposition.
_SPLIT_RE = re.compile(
    r'\b(are|is|were|from|derived|based|include)\b', re.IGNORECASE
)

# Hard overrides: XBRL member code → clean display name.
# Used when the label file returns a generic description instead of a terse name
# (e.g. QCOM's label file maps all segment members to the same documentation
# text; GLW's labels are description sentences rather than short segment names).
_MEMBER_OVERRIDES: dict[str, str] = {
    # QCOM — label file returns the same generic "A component of the entity
    # for which there is an accounting requirement to report…" for all members
    "qcom:QctMember": "QCT",
    "qcom:QtlMember": "QTL",
    "qcom:QsiMember": "QSI",
    # TXN — label file appends trailing period and/or the word "member"
    "txn:AnalogMember":             "Analog",
    "txn:EmbeddedProcessingMember": "Embedded Processing",
    # GLW — label file stores description sentences ("Represents …", "Related to …")
    "glw:OpticalCommunicationsMember":       "Optical Communications",
    "glw:DisplayProductsMember":             "Display Technologies",
    "glw:SpecialtyMaterialsProductsMember":  "Specialty Materials",
    "glw:LifeScienceProductsMember":         "Life Sciences",
    "glw:PolycrystallineSiliconProductsMember": "Polycrystalline Silicon",
    # MSFT — camelCase split of "ThreeSixFive…AndCloudServices" produces 51/50
    # chars, which _shorten() clips to "…Products And" at the 40-char word boundary.
    "msft:MicrosoftThreeSixFiveCommercialProductsAndCloudServicesMember": "Microsoft 365 Commercial Products and Cloud Services",
    "msft:MicrosoftThreeSixFiveConsumerProductsAndCloudServicesMember":   "Microsoft 365 Consumer Products and Cloud Services",
    # Standard XBRL members — replace generic taxonomy labels with clean names
    "us-gaap:ProductAndServiceOtherMember":  "Other",
    "us-gaap:AllOtherSegmentsMember":        "Other",
}


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

    # 2. Find most recent annual filing — 10-K (US) or 20-F (foreign private issuer)
    recent  = sub.get("filings", {}).get("recent", {})
    forms   = recent.get("form", [])
    accns   = recent.get("accessionNumber", [])
    accn    = next((a for f, a in zip(forms, accns) if f in ("10-K", "20-F")), None)
    if not accn:
        log.warning("[%s] No 10-K or 20-F found in recent filings", ticker)
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
    pre_url      = find_file([r"_pre\.xml$"])

    if not instance_url:
        log.warning("[%s] No XBRL instance file found in filing %s", ticker, accn)
        return None
    if not label_url:
        log.warning("[%s] No label linkbase found in filing %s", ticker, accn)
    if not pre_url:
        log.warning("[%s] No presentation linkbase found in filing %s", ticker, accn)

    log.info("[%s] XBRL instance: %s", ticker, instance_url)
    log.info("[%s] Label file:    %s", ticker, label_url or "—")
    log.info("[%s] Pre linkbase:  %s", ticker, pre_url or "—")

    return {"instance_url": instance_url, "label_url": label_url, "pre_url": pre_url}


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


# ── STEP 2b: Parse presentation linkbase ─────────────────────────────────────

def parse_presentation(pre_xml_url: str) -> dict[str, set[str]]:
    """
    Parse _pre.xml and return {parent_member: {child_member, ...}} for every
    presentation arc in every link role.

    This gives us the exact XBRL hierarchy without heuristics: a member that
    appears as the "from" end of an arc is a rollup row; members that only
    appear as "to" ends (or not at all) are leaves.
    """
    if not pre_xml_url:
        return {}
    try:
        xml_bytes = _get(pre_xml_url, timeout=60).content
        root      = ET.fromstring(xml_bytes)
    except Exception as exc:
        log.warning("Failed to fetch/parse presentation linkbase: %s", exc)
        return {}

    LINK_NS  = "http://www.xbrl.org/2003/linkbase"
    XLINK    = "http://www.w3.org/1999/xlink"

    parent_children: dict[str, set[str]] = {}

    for plink in root.iter(f"{{{LINK_NS}}}presentationLink"):
        # Build xlink:label → member-name map from loc elements
        loc_map: dict[str, str] = {}
        for loc in plink.iter(f"{{{LINK_NS}}}loc"):
            label = loc.get(f"{{{XLINK}}}label", "")
            href  = loc.get(f"{{{XLINK}}}href",  "")
            # href fragment: "aapl-20250927.xsd#aapl_IPhoneMember"
            # or "../../us-gaap-2024.xsd#us-gaap_ProductMember"
            fragment = href.split("#")[-1] if "#" in href else ""
            if "_" in fragment:
                parts = fragment.split("_", 1)
                loc_map[label] = f"{parts[0]}:{parts[1]}"

        for arc in plink.iter(f"{{{LINK_NS}}}presentationArc"):
            frm  = arc.get(f"{{{XLINK}}}from", "")
            to   = arc.get(f"{{{XLINK}}}to",   "")
            parent = loc_map.get(frm)
            child  = loc_map.get(to)
            if parent and child:
                parent_children.setdefault(parent, set()).add(child)

    log.info("Parsed %d rollup parents from presentation linkbase", len(parent_children))
    return parent_children


# ── STEP 3: Parse XBRL instance ───────────────────────────────────────────────

def _clean_member_name(member: str, labels: dict[str, str]) -> str:
    """
    Convert a prefixed member code to a human-readable name.
    Priority: _MEMBER_OVERRIDES → labels lookup → strip prefix+"Member" → camelCase split.
    """
    if member in _MEMBER_OVERRIDES:
        return _MEMBER_OVERRIDES[member]

    if member in labels:
        name = labels[member]
        name = re.sub(r"\s*\[Member\]\.?$", "", name).strip()
        name = re.sub(r"\.\s*$", "", name).strip()   # strip trailing period (e.g. "Pharmaceutical segment.")
        name = re.sub(r"\s+Segment$", "", name).strip()
        # Some companies (e.g. INCY) store documentation text as the label:
        # "Represents information pertaining to JAKAFI, ruxolitinib…"
        # Extract the product/category name that follows "pertaining to".
        _rept = re.match(r'represents\s+information\s+pertaining\s+to\s+(.+)', name, re.IGNORECASE)
        if _rept:
            name = _rept.group(1).split(',')[0].strip()
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

            # Pattern 2: ProductOrService + Geo 2-dim contexts.
            # Two sub-cases:
            #  (a) NFLX style: one product, many geos → extract geo dimension.
            #  (b) LLY style: many drugs × many geos → extract product dimension
            #      so we can sum geo regions to get total per-drug revenue.
            # We emit TWO entries for case (b): one for geo (2dim_geo) and one
            # for the product (2dim_product). The product entry is deduplicated
            # by summing in _build_segments.
            elif (any(k in (_PRODUCT_AXES | _BIZ_SEGMENT_AXES) for k in dims) and
                  any(k in _GEO_AXES for k in dims)):
                geo_keys  = [k for k in dims if k in _GEO_AXES]
                prod_keys = [k for k in dims if k in (_PRODUCT_AXES | _BIZ_SEGMENT_AXES)]
                if len(geo_keys) != 1:
                    continue
                # Store geo view. Also embed product info so _extract_revenue_facts
                # can emit a second product-axis fact for the same element.
                axis   = geo_keys[0]
                member = dims[axis]
                source = "2dim_geo"
                entry: dict = {
                    "axis": axis, "member": member,
                    "period_end": period_end, "source": source,
                }
                if len(prod_keys) == 1:
                    entry["also_product"] = {
                        "axis":   prod_keys[0],
                        "member": dims[prod_keys[0]],
                    }
                axis   = geo_keys[0]
                member = dims[axis]
                source = "2dim_geo"
                ctx_map[cid] = entry
                continue

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

    # Dynamically find us-gaap and ifrs-full namespace URIs used in this document
    found_ns: set[str] = set()
    for elem in root.iter():
        tag = elem.tag
        if tag.startswith("{") and ("us-gaap" in tag or "ifrs-full" in tag or "ifrs.org" in tag):
            ns_uri = tag[1:tag.index("}")]
            found_ns.add(ns_uri)

    # Try each revenue tag
    seen_ctx: set[tuple[str, str]] = set()  # (tag, context_id) dedup

    for rev_tag in _REVENUE_TAGS:
        # IFRS tags already carry their namespace prefix — resolve directly
        if rev_tag.startswith("ifrs-full:"):
            local = rev_tag.split(":", 1)[1]
            ifrs_ns = next((n for n in found_ns if "ifrs" in n), None)
            search_ns = {ifrs_ns} if ifrs_ns else set()
            search_tag = local
        else:
            search_ns = {n for n in found_ns if "us-gaap" in n}
            search_tag = rev_tag

        for ns_uri in search_ns:
            full_tag = f"{{{ns_uri}}}{search_tag}"
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
                # For 2dim Product+Geo contexts, also emit a product-axis fact
                # so drug-level revenue can be summed across geo regions.
                if ctx.get("also_product"):
                    ap = ctx["also_product"]
                    facts.append({
                        "tag":        rev_tag,
                        "axis":       ap["axis"],
                        "member":     ap["member"],
                        "period_end": ctx["period_end"],
                        "value":      val,
                        "source":     "2dim_product",
                    })

    return facts


def _drop_rollups(
    segments: list[dict],
    parent_child_map: dict[str, set[str]] | None = None,
) -> list[dict]:
    """
    Remove parent-aggregate rows.

    Primary method — presentation linkbase hierarchy (when available):
      Any segment whose XBRL member code is listed as a parent in the
      _pre.xml arcs AND has at least one of its children also present in
      the current segment list is identified as a rollup row and dropped.
      This is exact: no heuristics, no false positives.

    Fallback — subset-sum on standard taxonomy members (us-gaap:/srt:):
      When _pre.xml is not available (or identifies no rollups), STD rows
      are tested against all other segments: if any subset of ≤10 siblings
      sums to within 2% of the candidate, the candidate is a rollup.
      Company-specific rows are NOT checked by this fallback — coincidental
      sum matches are too common when many items are present (e.g. GILD's
      Descovy would be falsely dropped).
    """
    if len(segments) <= 1:
        return segments

    # ── Primary: presentation-linkbase hierarchy ──────────────────────────
    if parent_child_map:
        member_set = {s["member"] for s in segments}
        to_drop = {
            id(s) for s in segments
            if s.get("member") in parent_child_map
            and bool(parent_child_map[s["member"]] & member_set)
        }
        if to_drop:
            kept = [s for s in segments if id(s) not in to_drop]
            return kept if kept else segments
        # Fall through: pre.xml parsed but found no rollup candidates in
        # this segment set (can happen for BizSegments axis).

    # ── Fallback: subset-sum ─────────────────────────────────────────────────
    # STD rows (us-gaap:/srt:) always tested with 2% tolerance.
    # Company-specific rows also tested when the list is small (≤ 8 items):
    # small lists have too few combinations for coincidental matches to occur,
    # but company-specific geo aggregates (e.g. "Outside the United States")
    # would otherwise go uncaught. Use tighter 0.5% tolerance for those.
    _MAX_CHILDREN = 10
    _SMALL_N      = 8

    def _is_std(s: dict) -> bool:
        m = s.get("member", "")
        return m.startswith("us-gaap:") or m.startswith("srt:")

    def _is_complement_member(m: str) -> bool:
        """True for aggregate members that are the complement of a specific country."""
        ml = m.lower()
        return (m == "us-gaap:NonUsMember" or "nonusmember" in ml or "nonus" in ml
                or "excluding" in ml or "ex-us" in ml)

    n_total   = len(segments)
    candidates = [s for s in segments if _is_std(s) or n_total <= _SMALL_N]
    if not candidates:
        return segments

    to_drop: set[int] = set()

    for candidate in candidates:
        v   = candidate["value"]
        tol = v * (0.02 if _is_std(candidate) else 0.005)
        lo, hi = v - tol, v + tol

        # When testing a country:XX member, exclude complement members (e.g.
        # us-gaap:NonUsMember) from the "others" pool.  A country can never be
        # a rollup of (NonUS + children) — the numeric coincidence that
        # NonUS + EMEA + Japan ≈ US would otherwise falsely drop the US row.
        if candidate.get("member", "").startswith("country:"):
            others = [s for s in segments
                      if s is not candidate and not _is_complement_member(s.get("member", ""))]
        else:
            others = [s for s in segments if s is not candidate]
        if not others:
            continue

        child_vals = sorted([s["value"] for s in others], reverse=True)
        n = len(child_vals)

        # Fast path: all others sum to v
        if lo <= sum(child_vals) <= hi:
            to_drop.add(id(candidate))
            continue

        # Subset search.
        # For company-specific members, start at size=3 (not 2) to avoid
        # coincidental 2-element matches (e.g. NFLX: EMEA+LatAm ≈ USCanada).
        # Standard taxonomy members are more rigidly defined, so size=2 is fine.
        min_size = 2 if _is_std(candidate) else 3
        found = False
        for size in range(min_size, min(_MAX_CHILDREN, n) + 1):
            for combo in combinations(child_vals, size):
                if lo <= sum(combo) <= hi:
                    found = True
                    break
            if found:
                break
        if found:
            to_drop.add(id(candidate))

    kept = [s for s in segments if id(s) not in to_drop]
    return kept if kept else segments


def _build_segments(
    facts: list[dict],
    axes: set[str],
    labels: dict[str, str],
    parent_child_map: dict[str, set[str]] | None = None,
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

    # ── Geo source preference ─────────────────────────────────────────────────
    # 1dim geo = company's own top-level geographic segments — always preferred.
    # 2dim_geo = revenue tagged as product × geo — useful only when a company
    #   files no meaningful 1dim geo (e.g. NFLX, BIIB). When 1dim and 2dim_geo
    #   coexist, 2dim_geo can double-count because the product axis has rollup
    #   hierarchy (e.g. GILD's HIV-portfolio US + Biktarvy US + Descovy US all
    #   tag country:US, inflating the total).
    # Rule: use 1dim if it gives ≥ 2 unique members for the most-recent year;
    # fall back to 2dim_geo otherwise (NFLX, BIIB).
    if axes & _GEO_AXES:
        dim1  = [f for f in relevant if f.get("source") == "1dim"]
        dim2g = [f for f in relevant if f.get("source") == "2dim_geo"]
        if dim1 and dim2g:
            yr = max(f["period_end"] for f in relevant)[:4]
            if len({f["member"] for f in dim1 if f["period_end"][:4] == yr}) >= 2:
                relevant = dim1
            else:
                relevant = dim2g

    # Geo deduplication: companies file BOTH company-defined regional members
    # (meta:USCanadaMember) AND country-level members (country:US) for concentration
    # risk disclosures. A country:XX member is subsumed when a non-complement,
    # non-country member is strictly larger (≥ 90% of country value). Complement
    # members (NonUsMember, "Excluding United States") are explicitly excluded
    # from this check — they represent the opposite side of the split, not a superset.
    if axes & _GEO_AXES:
        country_facts    = [f for f in relevant if f["member"].startswith("country:")]
        noncountry_facts = [f for f in relevant if not f["member"].startswith("country:")]
        if country_facts and noncountry_facts:
            yr = max(f["period_end"] for f in relevant)[:4]

            def _is_complement(member: str) -> bool:
                m = member.lower()
                return ("nonusmember" in m or "non-us" in m or "nonus" in m
                        or "excluding" in m or "ex-us" in m
                        or member == "us-gaap:NonUsMember")

            to_drop = set()
            for cf in country_facts:
                cv = next((f["value"] for f in country_facts
                           if f["member"] == cf["member"] and f["period_end"][:4] == yr), None)
                if cv is None:
                    continue
                if any(f["period_end"][:4] == yr
                       and not _is_complement(f["member"])
                       and f["value"] > cv * 0.90
                       for f in noncountry_facts):
                    to_drop.add(id(cf))
            if to_drop:
                relevant = [f for f in relevant if id(f) not in to_drop]

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
    # (earlier tag in _REVENUE_TAGS list is more preferred).
    # 2dim_product facts (drug × geo) are summed across geo regions to get
    # total per-drug revenue. 1dim facts take precedence over 2dim_product
    # if both exist for the same member (avoids double-counting).
    member_year_val: dict[str, dict[int, float]] = {}
    tag_priority = {t: i for i, t in enumerate(_REVENUE_TAGS)}

    member_tag:    dict[str, str]  = {}  # track which tag each member used
    member_source: dict[str, str]  = {}  # track source type per member

    for f in relevant:
        y = year_of(f["period_end"])
        if y not in years:
            continue
        m      = f["member"]
        src    = f.get("source", "1dim")
        cur_tag = member_tag.get(m)
        cur_src = member_source.get(m, "")

        # 1dim always beats 2dim_product for same member
        if src == "2dim_product" and cur_src == "1dim":
            continue

        if cur_tag is None or tag_priority.get(f["tag"], 99) < tag_priority.get(cur_tag, 99):
            member_year_val.setdefault(m, {})[y] = f["value"]
            member_tag[m]    = f["tag"]
            member_source[m] = src
        elif f["tag"] == cur_tag:
            if src == "2dim_product" and cur_src == "2dim_product":
                # Sum geo slices to build total drug revenue
                member_year_val.setdefault(m, {})[y] = member_year_val[m].get(y, 0) + f["value"]
            elif src == "2dim_geo" and cur_src == "2dim_geo":
                # 2dim_geo fallback: multiple product slices for same geo member.
                # Take MAX rather than summing — the largest value is the most
                # comprehensive (highest-level rollup), avoiding hierarchy double-count.
                member_year_val.setdefault(m, {})[y] = max(
                    member_year_val[m].get(y, 0), f["value"]
                )
            else:
                member_year_val.setdefault(m, {})[y] = f["value"]

    # Only keep members that have a value in the most recent year
    members_with_recent = {
        m for m, yvals in member_year_val.items()
        if most_recent_year in yvals and yvals[most_recent_year] > 0
    }
    if not members_with_recent:
        return None

    # If 2dim_product drug-level facts are present, drop 1dim standard-taxonomy
    # aggregate members (us-gaap:ProductMember, us-gaap:ServiceMember) that are
    # rollups of the individual drug/product members. The subset-sum rollup check
    # fails when there are >10 children, so we handle this explicitly.
    has_2dim_product = any(member_source.get(m) == "2dim_product" for m in members_with_recent)
    _STD_AGGREGATE_MEMBERS = {
        "us-gaap:ProductMember",
        "us-gaap:ServiceMember",
        "us-gaap:AllProductsAndServicesMember",
        "us-gaap:RevenuesMember",  # BIIB: generic rollup member used as top-level
    }
    if has_2dim_product:
        members_with_recent -= _STD_AGGREGATE_MEMBERS

    # If every remaining member is a standard taxonomy member (us-gaap:/srt: prefixed),
    # this is a generic Product/Service or revenue line-item split — not a company-specific
    # breakdown. Return None to avoid showing meaningless "Product / Service" rows.
    # (Applies to product and business-segment axes only, not geo axes.)
    if axes & (_PRODUCT_AXES | _BIZ_SEGMENT_AXES) and not (axes & _GEO_AXES):
        if members_with_recent and all(
            m.startswith("us-gaap:") or m.startswith("srt:")
            for m in members_with_recent
        ):
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
    segments = _drop_rollups(segments, parent_child_map)

    # Drop name-based rollup markers: anything starting with "total",
    # or exact matches for "worldwide" / "consolidated".
    # Also filter boilerplate documentation labels that appear instead of real names
    # (CAT: "Represents the aggregate total of...", TGT: "Disclosures related to...").
    _BOILERPLATE_PREFIXES = ("represents ", "disclosures ")
    segments = [
        s for s in segments
        if not s["name"].lower().startswith("total")
        and s["name"].lower() not in _NAME_ROLLUPS
        and not any(s["name"].lower().startswith(p) for p in _BOILERPLATE_PREFIXES)
    ]

    # Drop us-gaap:NonUsMember when ≥2 other geo segments are present.
    # NonUsMember is always a complement/aggregate and is redundant alongside
    # specific country (country:XX) or named regional segments (EMEA, LatAm, etc.).
    if axes & _GEO_AXES:
        non_us_segs = [s for s in segments if s.get("member") != "us-gaap:NonUsMember"]
        if len(non_us_segs) >= 2:
            segments = non_us_segs

    # Recalculate pct against the post-rollup total and strip internal key
    real_total = sum(s["value"] for s in segments)
    for s in segments:
        s["pct"] = round(s["value"] / real_total * 100, 1) if real_total > 0 else 0.0
        s.pop("member", None)

    # If only one segment remains and it's a catch-all "other" bucket, it means
    # the company doesn't XBRL-tag meaningful segments — return None rather than
    # showing a single 100% "other" row (e.g. ABBV's OtherProductsMember).
    if len(segments) == 1 and segments[0]["name"].lower().startswith("other"):
        return None

    return segments if segments else None


def parse_segments(
    instance_xml_url: str,
    labels: dict[str, str],
    ticker: str = "",
    parent_child_map: dict[str, set[str]] | None = None,
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
    product          = _build_segments(facts, _PRODUCT_AXES, labels, parent_child_map)
    product_used_biz = False
    if product is None or len(product) < 2:
        biz_product = _build_segments(facts, _BIZ_SEGMENT_AXES, labels, parent_child_map)
        if biz_product and len(biz_product) >= 2:
            product          = biz_product
            product_used_biz = True
            log.info("[%s] Product segments sourced from StatementBusinessSegmentsAxis", ticker)

    # Build geo segments — try pure geo axes first, fall back to business segment axes
    # (many companies like AAPL report geographic revenue under StatementBusinessSegmentsAxis).
    # Skip the BizSegments fallback if it was already consumed for product above.
    geo = _build_segments(facts, _GEO_AXES, labels, parent_child_map)
    # A single-segment geo result (US-only) is not a meaningful breakdown — it's
    # a concentration-risk disclosure, not true geographic segmentation.  Treat it
    # the same as None so the BizSegments fallback can produce a richer breakdown
    # (e.g. NKE's North America / EMEA / Greater China / APLA).
    if geo is not None and len(geo) < 2:
        geo = None
    if geo is None and not product_used_biz:
        biz_geo = _build_segments(facts, _BIZ_SEGMENT_AXES, labels, parent_child_map)
        if biz_geo and len(biz_geo) >= 3:
            # Require ≥3 segments to avoid using brand/business segments (e.g. NKE's
            # "NIKE Brand / Converse" which has only 2 entries on BizSegments axis).
            # Geographic breakdowns typically have ≥3 regions.
            geo = biz_geo
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

        labels           = parse_labels(files["label_url"]) if files.get("label_url") else {}
        parent_child_map = parse_presentation(files["pre_url"]) if files.get("pre_url") else {}

        return parse_segments(files["instance_url"], labels, ticker, parent_child_map or None)
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
