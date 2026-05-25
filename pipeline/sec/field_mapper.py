"""
SEC EDGAR field mapper — driven by tag_mapping.csv, not hardcoded Python.

What this does:
  - load_tag_mapping(): reads tag_mapping.csv → {name: [tags by priority]}
  - extract_annual_series(): pulls 10-K/FY data for ALL non-stale tags, sums
    per year, writes every contributing tag to extracted_data.csv, logs misses
    to missing_log.csv
  - extract_computed(): derives free_cash_flow and ebitda from components
  - extract_all(): runs every field for a ticker, prints summary

What this does NOT do:
  - Fetch any data from the internet (that is sec_client.py)
  - Normalise or reshape data into scoring-layer dicts (that is normalizer.py)
  - Raise exceptions — returns empty list on any failure
"""
from __future__ import annotations

import csv
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_DIR = Path(__file__).parent
_TAG_MAPPING_CSV   = _DIR / "tag_mapping.csv"
_EXTRACTED_CSV     = _DIR / "extracted_data.csv"
_MISSING_LOG_CSV   = _DIR / "missing_log.csv"

_COMPUTED_FIELDS: dict[str, tuple[str, str, str]] = {
    "gross_profit":      ("revenue",             "cost_of_revenue",           "a_minus_b"),
    "free_cash_flow":    ("operating_cash_flow", "capital_expenditure",       "a_minus_abs_b"),
    "ebitda":            ("operating_income",    "depreciation_amortization", "a_plus_b"),
    "total_liabilities": ("total_assets",        "total_equity",             "a_minus_b"),
}


# ── Tag mapping ───────────────────────────────────────────────────────────────

def load_tag_mapping() -> dict[str, list[str]]:
    """
    Read tag_mapping.csv and return {standardised_name: [original_tags ordered by priority]}.
    """
    mapping: dict[str, list[tuple[int, str]]] = {}
    with _TAG_MAPPING_CSV.open(newline="") as f:
        for row in csv.DictReader(f):
            name = row["standardised_name"].strip()
            tag  = row["original_tag"].strip()
            pri  = int(row["priority"])
            mapping.setdefault(name, []).append((pri, tag))
    return {
        name: [t for _, t in sorted(pairs)]
        for name, pairs in mapping.items()
    }


# ── CSV writers ───────────────────────────────────────────────────────────────

def _load_extracted_keys() -> set[tuple[str, int, str, str]]:
    """
    Return set of (ticker, fiscal_year, standardised_name, original_tag) already in
    extracted_data.csv. Keying on original_tag allows multiple tags for the same
    ticker+year+field to coexist (additive summing). The same tag is not written twice.
    """
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
    new_rows: list[dict] = []
    for r in rows:
        key = (
            r["ticker"],
            int(r["fiscal_year"]),
            r["standardised_name"],
            r.get("original_tag", ""),
        )
        if key in existing:
            print(
                f"[field_mapper] WARNING: {r['ticker']} {r['standardised_name']} "
                f"{r['fiscal_year']} tag={r.get('original_tag', '')} appeared twice — "
                f"keeping most recent pull only",
                file=sys.stderr,
            )
        else:
            new_rows.append(r)
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


def _append_missing(ticker: str, standardised_name: str, notes: str = "") -> None:
    """Write a MISSING row; skip if a non-RESOLVED row already exists for this ticker+field."""
    existing: list[dict] = []
    if _MISSING_LOG_CSV.exists():
        with _MISSING_LOG_CSV.open(newline="") as f:
            existing = list(csv.DictReader(f))

    for row in existing:
        if row["ticker"] == ticker and row["standardised_name"] == standardised_name:
            if row.get("status") != "RESOLVED":
                return  # already logged and unresolved

    write_header = not _MISSING_LOG_CSV.exists() or _MISSING_LOG_CSV.stat().st_size == 0
    with _MISSING_LOG_CSV.open("a", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["ticker", "standardised_name", "status",
                        "detected_at", "resolved_at", "notes"],
        )
        if write_header:
            writer.writeheader()
        writer.writerow({
            "ticker":            ticker,
            "standardised_name": standardised_name,
            "status":            "MISSING",
            "detected_at":       datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "resolved_at":       "",
            "notes":             notes,
        })


# ── Core extraction ───────────────────────────────────────────────────────────

def _get_usgaap(facts_json: dict) -> dict:
    return facts_json.get("facts", {}).get("us-gaap", {})


def _extract_tag(usgaap: dict, tag: str, years: int) -> tuple[list[dict], str]:
    """
    Pull annual FY/10-K data for one us-gaap tag.
    Returns ([{"year": int, "value": float, "end": str}, ...], unit_key).
    """
    concept = usgaap.get(tag)
    if not concept:
        return [], ""

    units: dict = concept.get("units", {})
    if not units:
        return [], ""

    unit_key = next(iter(units))
    entries: list[dict] = units[unit_key]

    annual = [
        e for e in entries
        if e.get("form") == "10-K" and e.get("fp") == "FY"
        and e.get("fy") is not None and e.get("val") is not None
    ]
    if not annual:
        return [], ""

    # Group by year(end), keeping the most recently filed entry per period.
    # We use year(end) — not the fy field — because SEC EDGAR tags ALL data points
    # in a 10-K (including prior-year comparisons) with the filing year's fy, making
    # the fy field unreliable for identifying which period a data point belongs to.
    #
    # Tie-break by duration: some companies (e.g. REITs) include quarterly sub-period
    # facts inside the 10-K with fp="FY" and the same filed date as the annual fact.
    # When filed dates are equal, prefer the longest-duration fact (full year > quarter).
    def _duration_days(entry: dict) -> int:
        from datetime import date as _date
        try:
            s  = _date.fromisoformat(entry.get("start", ""))
            en = _date.fromisoformat(entry.get("end",   ""))
            return (en - s).days
        except (ValueError, TypeError):
            return 0

    by_year: dict[int, dict] = {}
    for e in annual:
        end = e.get("end", "")
        if not end:
            continue
        try:
            end_year = int(end[:4])
        except ValueError:
            continue
        if end_year not in by_year:
            by_year[end_year] = e
        else:
            cur = by_year[end_year]
            new_filed = e.get("filed", "")
            cur_filed = cur.get("filed", "")
            if new_filed > cur_filed:
                by_year[end_year] = e
            elif new_filed == cur_filed and _duration_days(e) > _duration_days(cur):
                # Same filing — prefer longer period (annual > quarterly sub-period)
                by_year[end_year] = e

    sorted_years = sorted(by_year.keys())[-years:]
    return [
        {"year": yr, "value": float(by_year[yr]["val"]), "end": by_year[yr].get("end", "")}
        for yr in sorted_years
    ], unit_key


def extract_annual_series(
    facts_json: dict,
    standardised_name: str,
    ticker: str,
    years: int = 5,
) -> list[dict[str, Any]]:
    """
    Priority-first tag selection with staleness filtering.

    For all fields: tries tags in priority order (from tag_mapping.csv) and
    returns the first non-stale tag's annual series. Lower-priority tags are
    only tried when higher-priority ones are absent or stale.

    Special case — depreciation_amortization: priority-1 is the complete
    aggregate tag. If it is stale/absent, sums priority-2 + priority-3 +
    priority-4 (genuine sub-components: PP&E depreciation + intangible
    amortization) with value-based deduplication to avoid double-counting
    when two component tags report the same figure. Priority-5 is a
    last-resort complete alternative.

    Writes ALL extracted tags to extracted_data.csv (audit trail).
    Logs missing fields to missing_log.csv.
    Never raises.
    """
    try:
        mapping = load_tag_mapping()
        tags = mapping.get(standardised_name, [])
        if not tags:
            print(f"[field_mapper] {standardised_name}: not in tag_mapping.csv", file=sys.stderr)
            return []

        usgaap    = _get_usgaap(facts_json)
        pulled_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cur_year  = datetime.now(timezone.utc).year

        # ── Step 1: extract ALL tags from SEC EDGAR (for CSV audit trail) ────
        tag_data: dict[str, tuple[list[dict], str]] = {}
        for tag in tags:
            series, unit_key = _extract_tag(usgaap, tag, years)
            if series:
                tag_data[tag] = (series, unit_key)

        rows_to_write: list[dict] = [
            {
                "ticker":            ticker,
                "fiscal_year":       d["year"],
                "standardised_name": standardised_name,
                "original_tag":      tag,
                "value":             d["value"],
                "unit":              unit_key,
                "pulled_at":         pulled_at,
                "period_of_report":  d.get("end", ""),
            }
            for tag, (series, unit_key) in tag_data.items()
            for d in series
        ]
        _append_extracted(rows_to_write)

        if not tag_data:
            print(f"[field_mapper] {standardised_name}: no matching tag found", file=sys.stderr)
            _append_missing(ticker, standardised_name)
            return []

        # ── Step 2: depreciation_amortization — special resolution ───────────
        if standardised_name == "depreciation_amortization":
            # Try priority-1 (complete aggregate) first.
            p1 = tags[0]
            if p1 in tag_data:
                series, _ = tag_data[p1]
                most_recent = max(d["year"] for d in series)
                if cur_year - most_recent <= 1:
                    result = sorted(series, key=lambda d: d["year"])[-years:]
                    for d in result:
                        print(
                            f"[field_mapper] {ticker} depreciation_amortization {d['year']}: "
                            f"tag={p1} value={d['value']/1e6:.0f}M",
                            file=sys.stderr,
                        )
                    # Backfill missing years from lower-priority tags when P1 doesn't
                    # reach back `years` years (e.g. a tag switch mid-history).
                    if len(result) < years:
                        covered = {d["year"] for d in result}
                        merged  = list(result)
                        for idx2, tag2 in enumerate(tags):
                            if idx2 == 0:
                                continue  # skip P1 (already primary)
                            if len(merged) >= years:
                                break
                            if tag2 not in tag_data:
                                continue
                            series2, _ = tag_data[tag2]
                            for d2 in sorted(series2, key=lambda x: x["year"]):
                                if len(merged) >= years:
                                    break
                                if d2["year"] in covered:
                                    continue
                                covered.add(d2["year"])
                                merged.append(d2)
                                print(
                                    f"[field_mapper] WARNING: [{ticker}] depreciation_amortization "
                                    f"year {d2['year']} backfilled from fallback tag "
                                    f"(priority {idx2 + 1}): {tag2}",
                                    file=sys.stderr,
                                )
                        result = sorted(merged, key=lambda d: d["year"])[-years:]
                    return result
                print(
                    f"[field_mapper] WARNING: {ticker} depreciation_amortization tag '{p1}' "
                    f"most recent year {most_recent} — stale, skipping",
                    file=sys.stderr,
                )

            # Priority-1 stale/absent → sum priority-2 + priority-3 + priority-4.
            # These are genuine sub-components (PP&E depreciation / intangible
            # amortization) that add up to the total D&A figure.
            component_tags = tags[1:4]
            active: dict[str, list[dict]] = {}
            for tag in component_tags:
                if tag not in tag_data:
                    continue
                series, _ = tag_data[tag]
                most_recent = max(d["year"] for d in series)
                if cur_year - most_recent > 2:
                    print(
                        f"[field_mapper] WARNING: {ticker} depreciation_amortization tag '{tag}' "
                        f"most recent year {most_recent} — stale, skipping component",
                        file=sys.stderr,
                    )
                    continue
                active[tag] = sorted(series, key=lambda d: d["year"])

            if active:
                all_years = sorted(
                    set(d["year"] for s in active.values() for d in s)
                )[-years:]
                year_totals: dict[int, dict] = {}
                for yr in all_years:
                    seen_vals: list[float] = []
                    kept:    list[tuple[str, float]] = []
                    skipped: list[tuple[str, float]] = []
                    end = ""
                    for tag, s in active.items():
                        yr_map = {d["year"]: d for d in s}
                        if yr in yr_map:
                            val = yr_map[yr]["value"]
                            if not end:
                                end = yr_map[yr].get("end", "")
                            if val in seen_vals:
                                skipped.append((tag, val))
                            else:
                                seen_vals.append(val)
                                kept.append((tag, val))
                    year_totals[yr] = {
                        "value":   sum(v for _, v in kept),
                        "end":     end,
                        "kept":    kept,
                        "skipped": skipped,
                    }
                if cur_year - max(year_totals) <= 2:
                    for yr in all_years:
                        entry = year_totals[yr]
                        if len(entry["kept"]) == 1 and not entry["skipped"]:
                            tag, val = entry["kept"][0]
                            print(
                                f"[field_mapper] {ticker} depreciation_amortization {yr}: "
                                f"tag={tag} value={val/1e6:.0f}M",
                                file=sys.stderr,
                            )
                        else:
                            kp = " + ".join(f"{t}(${v/1e6:.0f}M)" for t, v in entry["kept"])
                            sp = ", ".join(f"{t}(${v/1e6:.0f}M) SKIP" for t, v in entry["skipped"])
                            detail = kp + (f"  |  skipped: {sp}" if sp else "")
                            print(
                                f"[field_mapper] {ticker} depreciation_amortization {yr}: "
                                f"summed [{detail}] = ${entry['value']/1e6:.0f}M",
                                file=sys.stderr,
                            )
                    return [
                        {"year": yr, "value": year_totals[yr]["value"], "end": year_totals[yr]["end"]}
                        for yr in all_years
                    ]

            # Last resort: any remaining tag beyond the component range (index 4+).
            # Iterate rather than hardcode index so duplicate priority entries don't shift the target.
            for p5 in tags[4:]:
                if p5 not in tag_data:
                    continue
                series, _ = tag_data[p5]
                most_recent = max(d["year"] for d in series)
                if cur_year - most_recent <= 2:
                    result = sorted(series, key=lambda d: d["year"])[-years:]
                    for d in result:
                        print(
                            f"[field_mapper] {ticker} depreciation_amortization {d['year']}: "
                            f"tag={p5} value={d['value']/1e6:.0f}M",
                            file=sys.stderr,
                        )
                    return result
                print(
                    f"[field_mapper] WARNING: {ticker} depreciation_amortization tag '{p5}' "
                    f"most recent year {most_recent} — stale, skipping",
                    file=sys.stderr,
                )

            print(
                f"[field_mapper] depreciation_amortization: all tags stale or missing for {ticker}",
                file=sys.stderr,
            )
            _append_missing(ticker, standardised_name, notes="all D&A tags stale")
            return []

        # ── Step 3: priority-first selection for all other fields ─────────────
        # Phase A: find primary — the highest-priority tag that passes staleness.
        primary_result: list[dict] | None = None
        primary_idx:    int               = -1
        primary_tag:    str               = ""

        for idx, tag in enumerate(tags):
            if tag not in tag_data:
                continue
            series, _ = tag_data[tag]
            most_recent = max(d["year"] for d in series)
            if cur_year - most_recent > 2:
                print(
                    f"[field_mapper] WARNING: {ticker} {standardised_name} tag '{tag}' "
                    f"most recent year {most_recent} — stale, skipping",
                    file=sys.stderr,
                )
                continue
            primary_result = sorted(series, key=lambda d: d["year"])[-years:]
            primary_idx    = idx
            primary_tag    = tag
            break

        if primary_result is None:
            print(
                f"[field_mapper] WARNING: {ticker} {standardised_name} — all tags stale",
                file=sys.stderr,
            )
            _append_missing(ticker, standardised_name, notes="all tags stale")
            return []

        priority_num = primary_idx + 1
        if priority_num >= 3:
            print(
                f"[field_mapper] WARNING: [{ticker}] {standardised_name} resolved via "
                f"fallback tag (priority {priority_num}): {primary_tag} — verify data quality",
                file=sys.stderr,
            )
        for d in primary_result:
            v = d["value"]
            fmt = f"{v/1e6:.0f}M" if abs(v) >= 1e6 else f"{v:.4f}"
            print(
                f"[field_mapper] {ticker} {standardised_name} {d['year']}: "
                f"tag={primary_tag} value={fmt}",
                file=sys.stderr,
            )

        # Phase B: backfill missing years from lower-priority tags when primary
        # has fewer than `years` entries (e.g. a tag switch mid-history).
        # Only applies to fields with multiple priority tags.
        if len(tags) > 1 and len(primary_result) < years:
            covered = {d["year"] for d in primary_result}
            merged  = list(primary_result)
            for idx2, tag2 in enumerate(tags):
                if idx2 <= primary_idx:
                    continue
                if len(merged) >= years:
                    break
                if tag2 not in tag_data:
                    continue
                series2, _ = tag_data[tag2]
                for d2 in sorted(series2, key=lambda x: x["year"]):
                    if len(merged) >= years:
                        break
                    if d2["year"] in covered:
                        continue
                    covered.add(d2["year"])
                    merged.append(d2)
                    print(
                        f"[field_mapper] WARNING: [{ticker}] {standardised_name} year {d2['year']} "
                        f"backfilled from fallback tag (priority {idx2 + 1}): {tag2}",
                        file=sys.stderr,
                    )
            return sorted(merged, key=lambda d: d["year"])[-years:]

        return primary_result

    except Exception as exc:
        print(f"[field_mapper] {standardised_name}: error — {exc}", file=sys.stderr)
        return []


def extract_computed(
    facts_json: dict,
    standardised_name: str,
    ticker: str,
    years: int = 5,
) -> list[dict[str, Any]]:
    """
    Derive free_cash_flow or ebitda from component fields.
    Calls extract_annual_series() for each component, which already returns the
    correctly summed value — no additive logic needed here.
    Writes computed rows to extracted_data.csv with descriptive original_tag.
    Never raises.
    """
    try:
        comp_a, comp_b, formula = _COMPUTED_FIELDS[standardised_name]
        series_a = extract_annual_series(facts_json, comp_a, ticker, years)
        series_b = extract_annual_series(facts_json, comp_b, ticker, years)

        if not series_a or not series_b:
            print(f"[field_mapper] {standardised_name}: insufficient component data", file=sys.stderr)
            _append_missing(ticker, standardised_name, notes="component data missing")
            return []

        # Primary match: fiscal_year key (int year derived from end-date year in _extract_tag)
        map_a = {d["year"]: d for d in series_a}
        map_b = {d["year"]: d for d in series_b}
        shared = sorted(set(map_a) & set(map_b))[-years:]

        print(
            f"[field_mapper] {standardised_name}: {comp_a} years={sorted(map_a)}, "
            f"{comp_b} years={sorted(map_b)}, shared={shared}",
            file=sys.stderr,
        )

        # Fallback: match by period_of_report year when fiscal_year keys don't overlap.
        # Handles the case where one component was stored under the filing year and the
        # other under the period year, producing otherwise-identical date ranges with
        # off-by-one integer keys.
        if not shared:
            por_a = {
                int(d["end"][:4]): d
                for d in series_a
                if d.get("end") and len(d["end"]) >= 4
            }
            por_b = {
                int(d["end"][:4]): d
                for d in series_b
                if d.get("end") and len(d["end"]) >= 4
            }
            shared_por = sorted(set(por_a) & set(por_b))[-years:]
            if shared_por:
                print(
                    f"[field_mapper] {standardised_name}: fiscal_year keys non-overlapping, "
                    f"period_of_report fallback matched {shared_por}",
                    file=sys.stderr,
                )
                map_a, map_b, shared = por_a, por_b, shared_por
            else:
                print(
                    f"[field_mapper] {standardised_name}: no overlapping years on either key — "
                    f"{comp_a} has {sorted(map_a)}, {comp_b} has {sorted(map_b)}",
                    file=sys.stderr,
                )
                _append_missing(
                    ticker, standardised_name,
                    notes=f"year gap: {comp_a}={sorted(map_a)[-3:]} vs {comp_b}={sorted(map_b)[-3:]}",
                )
                return []

        if formula == "a_minus_abs_b":
            computed_tag = "computed: {} - abs({})".format(comp_a, comp_b)
        elif formula == "a_minus_b":
            computed_tag = "computed: {} - {}".format(comp_a, comp_b)
        elif formula == "a_plus_b":
            computed_tag = "computed: {} + {}".format(comp_a, comp_b)
        else:
            computed_tag = "computed: {} + {}".format(comp_a, comp_b)

        result = []
        for yr in shared:
            a = map_a[yr]["value"]
            b = map_b[yr]["value"]
            if formula == "a_minus_abs_b":
                value = a - abs(b)
            elif formula == "a_minus_b":
                value = a - b        # signed subtraction — handles negative equity
            else:
                value = a + abs(b)
            result.append({"year": yr, "value": value, "end": map_a[yr].get("end", "")})

        pulled_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        _append_extracted([
            {
                "ticker":            ticker,
                "fiscal_year":       d["year"],
                "standardised_name": standardised_name,
                "original_tag":      computed_tag,
                "value":             d["value"],
                "unit":              "USD",
                "pulled_at":         pulled_at,
                "period_of_report":  d.get("end", ""),
            }
            for d in result
        ])
        print(
            f"[field_mapper] {standardised_name}: computed from {comp_a} & {comp_b} ({len(result)} pts)",
            file=sys.stderr,
        )
        return result

    except Exception as exc:
        print(f"[field_mapper] {standardised_name}: compute error — {exc}", file=sys.stderr)
        return []


def extract_all(ticker: str, years: int = 5) -> dict[str, list[dict]]:
    """
    Fetch SEC facts for ticker, run all fields, print summary.
    Returns {standardised_name: series}.
    """
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    from sec_client import get_facts

    print(f"Fetching SEC facts for {ticker}…", file=sys.stderr)
    facts = get_facts(ticker)

    mapping = load_tag_mapping()
    all_names = list(mapping.keys())

    results: dict[str, list[dict]] = {}

    for name in all_names:
        series = extract_annual_series(facts, name, ticker, years)
        results[name] = series

    for name in _COMPUTED_FIELDS:
        # total_liabilities has a direct tag (Liabilities) that works for most
        # tickers. Only fall back to the computed version when direct extraction
        # returned nothing — avoids overwriting correct data with a computed value.
        if results.get(name):
            continue
        series = extract_computed(facts, name, ticker, years)
        results[name] = series

    print()
    print(f"{'─'*55}")
    print(f"  {ticker}  —  SEC EDGAR extraction summary")
    print(f"{'─'*55}")

    for name, series in results.items():
        if series:
            matched_tag = ""
            if name not in _COMPUTED_FIELDS:
                try:
                    tags     = mapping.get(name, [])
                    usgaap   = _get_usgaap(facts)
                    cur_year = datetime.now(timezone.utc).year
                    if name == "depreciation_amortization":
                        # Show P1 if non-stale, else "sum: P2+P3+P4 (used)"
                        p1 = tags[0] if tags else ""
                        pts, _ = _extract_tag(usgaap, p1, years) if p1 else ([], "")
                        if pts and cur_year - max(d["year"] for d in pts) <= 2:
                            matched_tag = p1
                        else:
                            used_components = []
                            for t in tags[1:4]:
                                pts2, _ = _extract_tag(usgaap, t, years)
                                if pts2 and cur_year - max(d["year"] for d in pts2) <= 2:
                                    used_components.append(t)
                            if used_components:
                                matched_tag = "sum: " + " + ".join(used_components)
                            elif len(tags) > 4:
                                pts5, _ = _extract_tag(usgaap, tags[4], years)
                                if pts5 and cur_year - max(d["year"] for d in pts5) <= 2:
                                    matched_tag = tags[4]
                    else:
                        # Show the first non-stale tag (priority-first)
                        for tag in tags:
                            pts, _ = _extract_tag(usgaap, tag, years)
                            if pts and cur_year - max(d["year"] for d in pts) <= 2:
                                matched_tag = tag
                                break
                except Exception:
                    pass
            else:
                comp_a, comp_b, _ = _COMPUTED_FIELDS[name]
                matched_tag = "{} & {}".format(comp_a, comp_b)
            tag_label = "  [tag: {}]".format(matched_tag) if matched_tag else ""
            print(f"  ✓ {name:<32} {len(series)} years found{tag_label}")
        else:
            print(f"  ✗ {name:<32} MISSING → logged")

    print(f"{'─'*55}")
    return results


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    sys.path.insert(0, os.path.dirname(__file__))

    def _fmt(series: list[dict]) -> str:
        parts = []
        for d in series:
            v = d["value"]
            parts.append(
                "{}: {:>18,.0f}".format(d["year"], v) if abs(v) >= 1
                else "{}: {:>18.4f}".format(d["year"], v)
            )
        return "  ".join(parts)

    if len(sys.argv) < 2:
        print("Usage:")
        print("  python field_mapper.py <TICKER> <field|all>")
        print("  python field_mapper.py missing")
        sys.exit(1)

    first_arg = sys.argv[1]

    # python field_mapper.py missing
    if first_arg == "missing":
        if not _MISSING_LOG_CSV.exists() or _MISSING_LOG_CSV.stat().st_size <= 1:
            print("missing_log.csv is empty — no missing fields recorded.")
            sys.exit(0)
        with _MISSING_LOG_CSV.open(newline="") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            print("No missing fields recorded.")
            sys.exit(0)
        print(f"\n{'─'*70}")
        print(f"  missing_log.csv  —  {len(rows)} entries")
        print(f"{'─'*70}")
        print(f"  {'TICKER':<8} {'FIELD':<32} {'STATUS':<10} {'DETECTED':<12} NOTES")
        print(f"  {'─'*8} {'─'*32} {'─'*10} {'─'*12} {'─'*20}")
        for r in rows:
            print(
                "  {:<8} {:<32} {:<10} {:<12} {}".format(
                    r.get("ticker", ""),
                    r.get("standardised_name", ""),
                    r.get("status", ""),
                    r.get("detected_at", ""),
                    r.get("notes", ""),
                )
            )
        print(f"{'─'*70}")
        sys.exit(0)

    if len(sys.argv) < 3:
        print("Usage: python field_mapper.py <TICKER> <field|all>")
        sys.exit(1)

    _ticker = first_arg.upper()
    _field  = sys.argv[2].lower()

    if _field == "all":
        extract_all(_ticker)
        sys.exit(0)

    # Single field
    from sec_client import get_facts
    print(f"Fetching SEC facts for {_ticker}…", file=sys.stderr)
    _facts = get_facts(_ticker)
    print()

    if _field in _COMPUTED_FIELDS:
        _series = extract_computed(_facts, _field, _ticker)
    else:
        _series = extract_annual_series(_facts, _field, _ticker)

    if _series:
        print(f"  {_field:<32} {_fmt(_series)}")
    else:
        print(f"  {_field:<32} — no data")
