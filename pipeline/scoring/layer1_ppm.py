"""
Layer 1 — Price Projection Model (PPM)

Three independent valuation methods produce a 5-year projected price each.
The blended price → CAGR vs today → score 0–100.

M1  EBITDA Multiple  — project EBITDA via compute_gq, trimmed-median EV/EBITDA
M2  FCF Yield        — project FCF via compute_gq, trimmed-median P/FCF multiple
M3  Div + FCF floor  — project dividends per share with FCF ceiling, trimmed P/giveback
"""
from __future__ import annotations
import logging
import requests
from scoring.utils import safe_float, compute_cagr, cagr_to_score, clamp, compute_gq, trimmed_median

log = logging.getLogger(__name__)


_EV_EBITDA_FALLBACK  = 16.0   # sector-neutral EV/EBITDA fallback
_P_FCF_FALLBACK      = 25.0   # P/FCF fallback (≈ 4% FCF yield)
_P_GIVEBACK_FALLBACK = 22.0   # P/giveback fallback for M3
_YEARS               = 5


def _fx_to_usd(currency: str, ticker: str = "") -> float:
    """Return the USD exchange rate for the given currency (1 unit → USD).
    Falls back to 1.0 on any error so the pipeline never hard-crashes."""
    if not currency or currency.upper() == "USD":
        return 1.0
    try:
        url = f"https://api.exchangerate-api.com/v4/latest/{currency.upper()}"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        rate = resp.json()["rates"]["USD"]
        log.info("[%s] Currency: %s → USD @ %.6f", ticker, currency, rate)
        return float(rate)
    except Exception as exc:
        log.warning("[%s] FX lookup failed for %s (%s), falling back to 1.0", ticker, currency, exc)
        return 1.0


def _shares(profile: dict) -> float | None:
    price = safe_float(profile.get("price"))
    mkt   = safe_float(profile.get("marketCap"))
    if price > 0 and mkt > 0:
        return mkt / price
    return None


# ── M1: EBITDA Multiple ────────────────────────────────────────────────────────

def _m1_ebitda(data: dict, shares: float, fx_rate: float = 1.0, sp500_cagr: float = 0.10) -> dict | None:
    income  = data.get("income", [])
    balance = data.get("balance", [])
    metrics = data.get("metrics", [])

    ebitda_vals = [safe_float(r.get("ebitda")) * fx_rate for r in income]
    if not ebitda_vals or ebitda_vals[0] <= 0:
        return None

    gq         = compute_gq(list(reversed(ebitda_vals[:5])), sp500_cagr)
    adj_growth = gq["weightedCAGR"]

    ev_ebitda_hist = [safe_float(r.get("evToEBITDA")) for r in metrics]
    ev_ebitda_med  = trimmed_median(ev_ebitda_hist)
    ev_ebitda = clamp(ev_ebitda_med, 8.0, 50.0) if ev_ebitda_med > 0 else _EV_EBITDA_FALLBACK

    cur_ebitda = ebitda_vals[0]
    for _ in range(_YEARS):
        cur_ebitda *= (1 + adj_growth)
    ebitda_5y = cur_ebitda

    net_debt      = safe_float((balance[0] if balance else {}).get("netDebt")) * fx_rate
    future_equity = ebitda_5y * ev_ebitda - net_debt

    if future_equity <= 0 or shares <= 0:
        return None
    return {
        "price":            future_equity / shares,
        "ebitda_current":   ebitda_vals[0],
        "ebitda_projected": ebitda_5y,
        "growth_rate":      adj_growth,
        "ev_ebitda":        ev_ebitda,
        "net_debt":         net_debt,
    }


# ── M2: FCF Multiple ───────────────────────────────────────────────────────────

def _m2_fcf(data: dict, shares: float, fx_rate: float = 1.0, sp500_cagr: float = 0.10) -> dict | None:
    cashflow = data.get("cashflow", [])
    metrics  = data.get("metrics", [])

    fcf_vals = [safe_float(r.get("freeCashFlow")) * fx_rate for r in cashflow]
    if not fcf_vals or fcf_vals[0] <= 0:
        return None

    gq         = compute_gq(list(reversed(fcf_vals[:5])), sp500_cagr)
    adj_growth = gq["weightedCAGR"]

    p_fcf_hist = [safe_float(r.get("priceToFreeCashFlowsRatio")) for r in metrics]
    p_fcf_med  = trimmed_median(p_fcf_hist)
    p_fcf = clamp(p_fcf_med, 8.0, 60.0) if p_fcf_med > 0 else _P_FCF_FALLBACK

    cur_fcf = fcf_vals[0]
    for _ in range(_YEARS):
        cur_fcf *= (1 + adj_growth)
    fcf_5y = cur_fcf

    if shares <= 0:
        return None
    return {
        "price":         (fcf_5y * p_fcf) / shares,
        "fcf_current":   fcf_vals[0],
        "fcf_projected": fcf_5y,
        "growth_rate":   adj_growth,
        "fcf_yield":     1.0 / p_fcf,
    }


# ── M3: Dividend + FCF Ceiling ─────────────────────────────────────────────────

def _m3_shareholder_return(
    data: dict,
    current_price: float,
    shares: float,
    fx_rate: float = 1.0,
    sp500_cagr: float = 0.10,
) -> dict | None:
    if current_price <= 0 or shares <= 0:
        return None

    income   = data.get("income", [])
    cashflow = data.get("cashflow", [])
    metrics  = data.get("metrics", [])
    profile  = data.get("profile", {})

    div_current = safe_float(profile.get("lastDividend"))

    # Revenue + NI blend → dividend growth rate with 0.9 haircut
    rev_vals = [safe_float(r.get("revenue")) for r in income]
    ni_vals  = [safe_float(r.get("netIncome")) for r in income]
    ni_pos   = [v for v in ni_vals if v and v > 0]
    gq_rev   = compute_gq(list(reversed(rev_vals[:5])),   sp500_cagr)
    gq_ni    = compute_gq(list(reversed(ni_pos[:5])),     sp500_cagr) if len(ni_pos) >= 2 else gq_rev
    linear_growth  = (gq_rev["weightedCAGR"] + gq_ni["weightedCAGR"]) / 2
    adj_div_growth = clamp(linear_growth * 0.9, -0.05, 0.20)

    # FCF growth rate for ceiling projection
    fcf_vals = [safe_float(r.get("freeCashFlow")) * fx_rate for r in cashflow]
    gq_fcf       = compute_gq(list(reversed(fcf_vals[:5])), sp500_cagr) if fcf_vals else {"weightedCAGR": 0.05}
    adj_fcf_growth = gq_fcf["weightedCAGR"]

    # Historical P/giveback multiple (1 / dividendYield)
    div_yields    = [safe_float(r.get("dividendYield")) for r in metrics]
    p_giveback_vals = [1.0 / y for y in div_yields if y and y > 0.001]
    p_giveback = (
        clamp(trimmed_median(p_giveback_vals), 5.0, 100.0)
        if p_giveback_vals
        else _P_GIVEBACK_FALLBACK
    )

    # Project dividends per share with FCF ceiling
    cur_gps = div_current
    cur_fcf = fcf_vals[0] if fcf_vals else 0.0
    for _ in range(_YEARS):
        cur_fcf   *= (1 + adj_fcf_growth)
        target_gps = cur_gps * (1 + adj_div_growth)
        ceiling    = (cur_fcf * 0.90) / shares
        cur_gps    = min(target_gps, ceiling)

    if cur_gps <= 0:
        return None

    # Keep div_yield / buyback_yield for backward-compatible intermediates
    _price = safe_float(profile.get("price"))
    _div   = div_current
    div_yield     = clamp(_div / _price if _price > 0 else 0.0, 0.0, 0.15)
    buybacks      = abs(safe_float((cashflow[0] if cashflow else {}).get("commonStockRepurchased"))) * fx_rate
    mkt_cap       = safe_float(profile.get("marketCap"))
    buyback_yield = clamp(buybacks / mkt_cap, 0.0, 0.10) if mkt_cap > 0 else 0.0

    return {
        "price":             cur_gps * p_giveback,
        "div_yield":         div_yield,
        "buyback_yield":     buyback_yield,
        "shareholder_yield": div_yield + buyback_yield,
        "growth_rate":       adj_div_growth,
        "annual_div_ps":     _div,
    }


# ── Public API ─────────────────────────────────────────────────────────────────

def score_ppm(data: dict, ticker: str = "", sp500_cagr: float | None = None) -> dict:
    profile       = data.get("profile", {})
    current_price = safe_float(profile.get("price"))
    shares        = _shares(profile)

    # Resolve FX rate once (1 unit of reported_currency → USD).
    # All monetary statement values are multiplied by this before use.
    # Stock price and share count are already in USD for NYSE ADRs.
    reported_currency = data.get("reported_currency", "USD") or "USD"
    fx_rate = _fx_to_usd(reported_currency, ticker)

    _sp500 = sp500_cagr or 0.10
    r1 = _m1_ebitda(data, shares or 0, fx_rate, _sp500) if shares else None
    r2 = _m2_fcf(data, shares or 0, fx_rate, _sp500)    if shares else None
    r3 = _m3_shareholder_return(data, current_price, shares or 0, fx_rate, _sp500)

    m1 = r1["price"] if r1 else None
    m2 = r2["price"] if r2 else None
    m3 = r3["price"] if r3 else None

    valid = [p for p in [m1, m2, m3] if p and p > 0]

    intermediates = {
        "m1_ebitda_current":     round(r1["ebitda_current"],   2) if r1 else None,
        "m1_ebitda_projected":   round(r1["ebitda_projected"], 2) if r1 else None,
        "m1_growth_rate":        round(r1["growth_rate"],      4) if r1 else None,
        "m1_ev_ebitda_multiple": round(r1["ev_ebitda"],        2) if r1 else None,
        "m1_net_debt":           round(r1["net_debt"],         2) if r1 else None,
        "m1_shares":             round(shares,                 2) if shares else None,
        "m2_fcf_current":        round(r2["fcf_current"],      2) if r2 else None,
        "m2_fcf_projected":      round(r2["fcf_projected"],    2) if r2 else None,
        "m2_growth_rate":        round(r2["growth_rate"],      4) if r2 else None,
        "m2_fcf_yield":          round(r2["fcf_yield"],        4) if r2 else None,
        "m3_applicable":         r3 is not None,
        "m3_div_yield":          round(r3["div_yield"],        4) if r3 else None,
        "m3_buyback_yield":      round(r3["buyback_yield"],    4) if r3 else None,
        "m3_shareholder_yield":  round(r3["shareholder_yield"],4) if r3 else None,
        "m3_growth_rate":        round(r3["growth_rate"],      4) if r3 else None,
        "m_cumulative_div_ps":   round(r3["annual_div_ps"] * _YEARS, 4) if r3 else 0.0,
    }

    if not valid or current_price <= 0:
        return {
            "score": 50.0, "m1_price": m1, "m2_price": m2,
            "m3_price": m3, "blended_price": None, "cagr": None,
            **intermediates,
        }

    blended   = sum(valid) / len(valid)
    ppm_cagr  = compute_cagr(current_price, blended, _YEARS)
    ppm_score = cagr_to_score(ppm_cagr, _sp500)

    return {
        "score":         round(ppm_score, 2),
        "m1_price":      round(m1, 2) if m1 else None,
        "m2_price":      round(m2, 2) if m2 else None,
        "m3_price":      round(m3, 2) if m3 else None,
        "blended_price": round(blended, 2),
        "cagr":          round(ppm_cagr, 4) if ppm_cagr is not None else None,
        **intermediates,
    }
