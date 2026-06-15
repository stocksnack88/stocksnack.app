"""
Revenue segment analysis — product and geographic.

Processes raw FMP segmentation data to compute per-segment
revenue share, CAGR, and concentration risk.
"""
from __future__ import annotations

import logging
from scoring.utils import compute_cagr

log = logging.getLogger(__name__)


def _clean_name(name: str, max_len: int = 40) -> str:
    """Truncate verbose segment names at first comma/period; hard-cap at max_len chars."""
    if len(name) <= max_len:
        return name
    first_comma  = name.find(',')
    first_period = name.find('.')
    candidates   = [p for p in (first_comma, first_period) if p > 0]
    first_break  = min(candidates) if candidates else -1
    if 0 < first_break < max_len:
        return name[:first_break].strip()
    # No natural break within max_len — fall back to last word boundary
    truncated  = name[:max_len]
    last_space = truncated.rfind(' ')
    return (truncated[:last_space] if last_space > 0 else truncated).strip()


def _parse_year(item: dict) -> int | None:
    raw = item.get("fiscalYear") or item.get("date") or ""
    try:
        return int(str(raw)[:4])
    except (ValueError, TypeError):
        return None


def _analyse_segments(raw: list) -> tuple[list[dict], bool]:
    if not raw:
        return [], False

    # Filter valid items and sort ascending by fiscal year
    valid = [item for item in raw if _parse_year(item) and isinstance(item.get("data"), dict)]
    valid.sort(key=lambda x: _parse_year(x))
    valid = valid[-5:]

    if not valid:
        return [], False

    recent_data: dict = valid[-1].get("data", {})
    total_revenue = sum(v for v in recent_data.values() if isinstance(v, (int, float)) and v > 0)
    if total_revenue <= 0:
        return [], False

    all_names = set()
    for item in valid:
        all_names.update(item.get("data", {}).keys())

    results = []
    for name in all_names:
        current_value = recent_data.get(name)
        if not isinstance(current_value, (int, float)) or current_value <= 0:
            continue

        # Collect positive yearly values oldest → newest
        yearly = [
            item["data"][name]
            for item in valid
            if isinstance(item.get("data", {}).get(name), (int, float)) and item["data"][name] > 0
        ]

        cagr = None
        if len(yearly) >= 2:
            c = compute_cagr(yearly[0], yearly[-1], len(yearly) - 1)
            cagr = round(c, 4) if c is not None else None

        results.append({
            "name":  _clean_name(name),
            "pct":   round(current_value / total_revenue * 100, 2),
            "cagr":  cagr,
            "value": int(current_value),
        })

    results.sort(key=lambda x: x["value"], reverse=True)

    concentration_risk = any(s["pct"] > 50 for s in results)
    if concentration_risk:
        log.warning("Concentration risk: %s is %.1f%% of revenue", results[0]["name"], results[0]["pct"])

    return results, concentration_risk


def compute_segments(product_raw: list, geo_raw: list) -> dict:
    """
    Process raw FMP segment data into structured segment lists.

    Returns:
        {
            "product_segments":           [{name, pct, cagr, value}, ...],
            "geo_segments":               [{name, pct, cagr, value}, ...],
            "product_concentration_risk": bool,
            "geo_concentration_risk":     bool,
        }
    """
    product_segments, product_risk = _analyse_segments(product_raw)
    geo_segments,     geo_risk     = _analyse_segments(geo_raw)

    return {
        "product_segments":           product_segments,
        "geo_segments":               geo_segments,
        "product_concentration_risk": product_risk,
        "geo_concentration_risk":     geo_risk,
    }
