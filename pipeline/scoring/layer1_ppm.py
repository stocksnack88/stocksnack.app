"""
Layer 1 — Price Projection Model (PPM)

Three independent valuation methods produce a 5-year projected price each.
The blended price → CAGR vs today → score 0–100.

M1  EBITDA Multiple  — project EBITDA forward, apply EV/EBITDA, solve for equity
M2  FCF Yield        — project FCF forward, apply target yield, solve for market cap
M3  Div + Buyback    — project price appreciation + shareholder yield compounded
"""
from __future__ import annotations
import logging
import requests
from scoring.utils import safe_float, compute_cagr, list_cagr, cagr_to_score, clamp

log = logging.getLogger(__name__)


_TARGET_FCF_YIELD   = 0.04   # 4% — assumed long-run market FCF yield
_MAX_PROJ_GROWTH    = 0.22   # cap individual growth rates used in projections
_EV_EBITDA_FALLBACK = 16.0   # sector-neutral fallback multiple
_YEARS              = 5


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


def _safe_growth(values: list, years: int = 4) -> float:
    """Return a conservative growth rate from a list of historical values."""
    cagr = list_cagr(values, years)
    if cagr is None:
        return 0.05  # fall back to 5 %
    return clamp(cagr, 0.0, _MAX_PROJ_GROWTH)


# ── M1: EBITDA Multiple ────────────────────────────────────────────────────────

def _m1_ebitda(data: dict, shares: float, fx_rate: float = 1.0) -> dict | None:
    income  = data.get("income", [])
    balance = data.get("balance", [])
    metrics = data.get("metrics", [])

    ebitda_vals = [safe_float(r.get("ebitda")) * fx_rate for r in income]
    if not ebitda_vals or ebitda_vals[0] <= 0:
        return None

    growth_rate = _safe_growth(ebitda_vals)
    ebitda_5y   = ebitda_vals[0] * (1 + growth_rate) ** _YEARS

    ev_ebitda_raw = safe_float((metrics[0] if metrics else {}).get("evToEBITDA"))
    ev_ebitda = clamp(ev_ebitda_raw, 8.0, 50.0) if ev_ebitda_raw > 0 else _EV_EBITDA_FALLBACK

    future_ev = ebitda_5y * ev_ebitda

    net_debt = safe_float((balance[0] if balance else {}).get("netDebt")) * fx_rate
    future_equity = future_ev - net_debt

    if future_equity <= 0 or shares <= 0:
        return None
    return {
        "price":            future_equity / shares,
        "ebitda_current":   ebitda_vals[0],
        "ebitda_projected": ebitda_5y,
        "growth_rate":      growth_rate,
        "ev_ebitda":        ev_ebitda,
        "net_debt":         net_debt,
    }


# ── M2: FCF Yield ──────────────────────────────────────────────────────────────

def _m2_fcf(data: dict, shares: float, fx_rate: float = 1.0) -> dict | None:
    cashflow = data.get("cashflow", [])

    fcf_vals = [safe_float(r.get("freeCashFlow")) * fx_rate for r in cashflow]
    if not fcf_vals or fcf_vals[0] <= 0:
        return None

    growth_rate = _safe_growth(fcf_vals)
    fcf_5y      = fcf_vals[0] * (1 + growth_rate) ** _YEARS

    future_mkt_cap = fcf_5y / _TARGET_FCF_YIELD
    if shares <= 0:
        return None
    return {
        "price":         future_mkt_cap / shares,
        "fcf_current":   fcf_vals[0],
        "fcf_projected": fcf_5y,
        "growth_rate":   growth_rate,
        "fcf_yield":     _TARGET_FCF_YIELD,
    }


# ── M3: Dividend + Buyback Total Return ────────────────────────────────────────

def _m3_shareholder_return(data: dict, current_price: float, fx_rate: float = 1.0) -> float | None:
    if current_price <= 0:
        return None

    income   = data.get("income", [])
    cashflow = data.get("cashflow", [])
    metrics  = data.get("metrics", [])

    # Annual dividend yield: lastDividend (annual $) / price — profile values are in USD
    _prof = data.get("profile", {})
    _price = safe_float(_prof.get("price"))
    _div = safe_float(_prof.get("lastDividend"))
    div_yield = clamp(_div / _price if _price > 0 else 0.0, 0.0, 0.15)

    # Buyback yield: buybacks from cashflow (native currency) / market cap (USD)
    # Convert buybacks to USD; market cap is already in USD from profile
    buybacks  = abs(safe_float((cashflow[0] if cashflow else {}).get("commonStockRepurchased"))) * fx_rate
    mkt_cap   = safe_float(data.get("profile", {}).get("marketCap"))
    buyback_yield = clamp(buybacks / mkt_cap, 0.0, 0.10) if mkt_cap > 0 else 0.0

    # Price appreciation proxy: average of revenue growth and net-income growth
    # CAGRs are scale-invariant — no currency conversion needed
    rev_vals = [safe_float(r.get("revenue")) for r in income]
    ni_vals  = [safe_float(r.get("netIncome")) for r in income]
    rev_cagr = list_cagr(rev_vals, 4) or 0.05
    ni_cagr  = list_cagr([v for v in ni_vals if v > 0], 4) or 0.05
    price_growth = clamp((rev_cagr + ni_cagr) / 2, 0.0, _MAX_PROJ_GROWTH)

    total_annual_return = price_growth + div_yield + buyback_yield
    future_price = current_price * (1 + total_annual_return) ** _YEARS
    return {
        "price":             future_price,
        "div_yield":         div_yield,
        "buyback_yield":     buyback_yield,
        "shareholder_yield": div_yield + buyback_yield,
        "growth_rate":       price_growth,
        "annual_div_ps":     _div,
    }


# ── Public API ─────────────────────────────────────────────────────────────────

def score_ppm(data: dict, ticker: str = "") -> dict:
    profile       = data.get("profile", {})
    current_price = safe_float(profile.get("price"))
    shares        = _shares(profile)

    # Resolve FX rate once (1 unit of reported_currency → USD).
    # All monetary statement values are multiplied by this before use.
    # Stock price and share count are already in USD for NYSE ADRs.
    reported_currency = data.get("reported_currency", "USD") or "USD"
    fx_rate = _fx_to_usd(reported_currency, ticker)

    r1 = _m1_ebitda(data, shares or 0, fx_rate) if shares else None
    r2 = _m2_fcf(data, shares or 0, fx_rate)    if shares else None
    r3 = _m3_shareholder_return(data, current_price, fx_rate)

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

    blended = sum(valid) / len(valid)
    ppm_cagr  = compute_cagr(current_price, blended, _YEARS)
    ppm_score = cagr_to_score(ppm_cagr)

    return {
        "score":         round(ppm_score, 2),
        "m1_price":      round(m1, 2) if m1 else None,
        "m2_price":      round(m2, 2) if m2 else None,
        "m3_price":      round(m3, 2) if m3 else None,
        "blended_price": round(blended, 2),
        "cagr":          round(ppm_cagr, 4) if ppm_cagr is not None else None,
        **intermediates,
    }
