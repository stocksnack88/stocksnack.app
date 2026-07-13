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
from scoring.utils import safe_float, compute_cagr, cagr_to_score, clamp, compute_gq, project_series, tapered_project, trimmed_median, is_financial

log = logging.getLogger(__name__)


_EV_EBITDA_FALLBACK  = 16.0   # sector-neutral EV/EBITDA fallback
_P_FCF_FALLBACK      = 25.0   # P/FCF fallback (≈ 4% FCF yield)
_P_GIVEBACK_FALLBACK = 22.0   # P/giveback fallback for M3
_PE_MULTIPLE_FALLBACK = 20.0  # P/E fallback for float-distorted tickers
_YEARS               = 5

# Tickers where M1 EV/EBITDA cannot be reliably computed because customer float
# or custody assets appear as balance-sheet liabilities in XBRL data, inflating
# net_debt and therefore overstating EV.  For these tickers M1 is replaced with
# a P/E-based intrinsic price (net income projected forward × median historical
# P/E multiple derived from year-end market caps in the metrics list).
# PYPL: customer funds awaiting settlement (~$30–40B) show as a liability.
# HOOD: custodied user assets similarly distort the balance sheet.
FLOAT_DISTORTED_TICKERS = frozenset({"PYPL", "HOOD"})


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


# ── M1 substitute: P/E Intrinsic (float-distorted tickers only) ───────────────

def _pe_intrinsic(data: dict, shares: float, fx_rate: float = 1.0, sp500_cagr: float = 0.10) -> dict | None:
    """Project net income forward via compute_gq, apply median historical P/E.

    Used in place of M1 EV/EBITDA for tickers in FLOAT_DISTORTED_TICKERS where
    XBRL-derived net_debt is unreliable (customer float inflates liabilities,
    overstating EV and making EV/EBITDA meaningless).
    """
    income  = data.get("income",  [])
    metrics = data.get("metrics", [])

    ni_vals = [safe_float(r.get("netIncome")) * fx_rate for r in income]
    if not ni_vals or ni_vals[0] <= 0:
        return None

    gq         = compute_gq(list(reversed(ni_vals[:5])), sp500_cagr)
    adj_growth = gq["weightedCAGR"]

    # Historical P/E: year-end market cap (from metrics) ÷ net income
    pe_hist = []
    for inc_row, m in zip(income, metrics):
        ni     = safe_float(inc_row.get("netIncome")) * fx_rate
        mktcap = safe_float(m.get("marketCap"))
        if ni > 0 and mktcap > 0:
            pe_hist.append(mktcap / ni)
    pe_median = trimmed_median(pe_hist) if pe_hist else None
    pe_mult   = clamp(pe_median, 8.0, 60.0) if pe_median and pe_median > 0 else _PE_MULTIPLE_FALLBACK

    cur_ni = ni_vals[0]
    for _ in range(_YEARS):
        cur_ni *= (1 + adj_growth)
    ni_5y = cur_ni

    if shares <= 0:
        return None
    return {
        "price":        (ni_5y * pe_mult) / shares,
        "ni_current":   ni_vals[0],
        "ni_projected": ni_5y,
        "growth_rate":  adj_growth,
        "pe_multiple":  pe_mult,
    }


# ── M1: EBITDA Multiple ────────────────────────────────────────────────────────

def _m1_ebitda(data: dict, shares: float, fx_rate: float = 1.0, sp500_cagr: float = 0.10) -> dict | None:
    income  = data.get("income", [])
    balance = data.get("balance", [])
    metrics = data.get("metrics", [])

    ebitda_vals = [safe_float(r.get("ebitda")) * fx_rate for r in income]
    # Strip leading zeros only: a zero EBITDA means D&A was unavailable for that year.
    # Negative EBITDA is valid (loss-making company) and must be preserved.
    while ebitda_vals and ebitda_vals[0] == 0:
        ebitda_vals = ebitda_vals[1:]
    if not ebitda_vals:
        return None

    pj = project_series(list(reversed(ebitda_vals[:5])), sp500_cagr)

    # Dual gate 1: cumulative historical sum must be positive
    if pj["cumulative_sum"] <= 0:
        return None

    if pj["avg_dollar_change"] is not None:
        current     = ebitda_vals[0]
        growth_rate = pj["avg_dollar_change"]
    else:
        current = pj.get("projection_base")   # B2: use replacement, not dropped value
        if current is None:
            if ebitda_vals[0] <= 0:
                return None
            current = ebitda_vals[0]
        growth_rate = pj["weighted_cagr"]

    ebitda_5y = tapered_project(current, pj["weighted_cagr"], pj["avg_dollar_change"])

    # Dual gate 2: tapered forward projection must be positive
    if ebitda_5y <= 0:
        return None

    ev_ebitda_hist = [safe_float(r.get("evToEBITDA")) for r in metrics]
    ev_ebitda_med  = trimmed_median(ev_ebitda_hist)
    ev_ebitda = clamp(ev_ebitda_med, 8.0, 50.0) if ev_ebitda_med > 0 else _EV_EBITDA_FALLBACK

    net_debt      = safe_float((balance[0] if balance else {}).get("netDebt")) * fx_rate
    future_equity = ebitda_5y * ev_ebitda - net_debt

    if shares <= 0:
        return None
    return {
        "price":            future_equity / shares,
        "ebitda_current":   ebitda_vals[0],
        "ebitda_projected": ebitda_5y,
        "growth_rate":      growth_rate,
        "ev_ebitda":        ev_ebitda,
        "net_debt":         net_debt,
    }


# ── M2: FCF Multiple ───────────────────────────────────────────────────────────

def _m2_fcf(data: dict, shares: float, fx_rate: float = 1.0, sp500_cagr: float = 0.10) -> dict | None:
    cashflow = data.get("cashflow", [])
    metrics  = data.get("metrics", [])

    fcf_vals = [safe_float(r.get("freeCashFlow")) * fx_rate for r in cashflow]
    if not fcf_vals:
        return None

    pj = project_series(list(reversed(fcf_vals[:5])), sp500_cagr)

    # Dual gate 1: cumulative historical sum must be positive
    if pj["cumulative_sum"] <= 0:
        return None

    p_fcf_hist = [safe_float(r.get("priceToFreeCashFlowsRatio")) for r in metrics]
    p_fcf_med  = trimmed_median(p_fcf_hist)
    p_fcf = clamp(p_fcf_med, 8.0, 60.0) if p_fcf_med > 0 else _P_FCF_FALLBACK

    if pj["avg_dollar_change"] is not None:
        current     = fcf_vals[0]
        growth_rate = pj["avg_dollar_change"]
    else:
        current = pj.get("projection_base")   # B2: use replacement, not dropped value
        if current is None:
            if fcf_vals[0] <= 0:
                return None
            current = fcf_vals[0]
        growth_rate = pj["weighted_cagr"]

    fcf_5y = tapered_project(current, pj["weighted_cagr"], pj["avg_dollar_change"])

    # Dual gate 2: tapered forward projection must be positive
    if fcf_5y <= 0:
        return None

    if shares <= 0:
        return None
    return {
        "price":         (fcf_5y * p_fcf) / shares,
        "fcf_current":   fcf_vals[0],
        "fcf_projected": fcf_5y,
        "growth_rate":   growth_rate,
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

    cashflow = data.get("cashflow", [])
    metrics  = data.get("metrics", [])
    profile  = data.get("profile", {})

    _price = safe_float(profile.get("price"))
    _div   = safe_float(profile.get("lastDividend"))
    div_yield = clamp(_div / _price if _price > 0 else 0.0, 0.0, 0.15)

    # Gate: spot yield >= 4.5% AND dividends paid every year for last 5 years
    if div_yield < 0.045:
        return None
    div_paid_5y = [safe_float(r.get("dividendsPaid")) for r in cashflow[:5]]
    if len(div_paid_5y) < 5 or not all(v < 0 for v in div_paid_5y):
        return None

    # FIX 2: use total dividends paid series (oldest-first, USD) for growth rate
    # dividendsPaid is negative (cash outflow) — negate to get positive total outflow
    total_div_vals = [-v * fx_rate for v in div_paid_5y]
    gq_div         = compute_gq(list(reversed(total_div_vals)), sp500_cagr)
    adj_div_growth = gq_div["weightedCAGR"]   # FIX 3: saved directly as m3_growth_rate

    # FCF series for ceiling projection
    fcf_vals = [safe_float(r.get("freeCashFlow")) * fx_rate for r in cashflow]
    _fcf_window = fcf_vals[:5]
    gq_fcf                = compute_gq(list(reversed(_fcf_window)), sp500_cagr) if fcf_vals else {"weightedCAGR": 0.05, "avg_dollar_change": None}
    adj_fcf_growth        = gq_fcf["weightedCAGR"]
    avg_fcf_dollar_change = gq_fcf.get("avg_dollar_change")
    # Cumulative-sum gate: if net-negative history, revert to flat ceiling (conservative).
    if avg_fcf_dollar_change is not None and _fcf_window and sum(_fcf_window) <= 0:
        avg_fcf_dollar_change = None  # adj_fcf_growth is already 0.0 on dollar path

    # Historical P/giveback multiple (1 / dividendYield)
    div_yields      = [safe_float(r.get("dividendYield")) for r in metrics]
    p_giveback_vals = [1.0 / y for y in div_yields if y and y > 0.001]
    p_giveback = (
        clamp(trimmed_median(p_giveback_vals), 5.0, 100.0)
        if p_giveback_vals
        else _P_GIVEBACK_FALLBACK
    )

    # Gate: historical average yield >= 4.0% — blocks special-dividend contamination
    p_giveback_yield = (1.0 / p_giveback) if p_giveback > 0 else None
    if p_giveback_yield is None or p_giveback_yield < 0.04:
        return None

    # FIX 2: project total dividends forward; FCF ceiling stays in total dollars
    fcf_start     = fcf_vals[0] if fcf_vals else 0.0
    cur_total_div = total_div_vals[0]   # most recent year total paid
    cur_total_fcf = fcf_start
    for year_idx in range(1, _YEARS + 1):
        if avg_fcf_dollar_change is not None:
            cur_total_fcf = fcf_start + avg_fcf_dollar_change * year_idx
        else:
            cur_total_fcf *= (1 + adj_fcf_growth)
        target_total  = cur_total_div * (1 + adj_div_growth)
        ceiling_total = cur_total_fcf * 0.90
        cur_total_div = min(target_total, ceiling_total)

    if cur_total_div <= 0:
        return None

    # Convert back to per-share only for final price
    proj_div_ps = cur_total_div / shares

    buybacks      = abs(safe_float((cashflow[0] if cashflow else {}).get("commonStockRepurchased"))) * fx_rate
    mkt_cap       = safe_float(profile.get("marketCap"))
    buyback_yield = clamp(buybacks / mkt_cap, 0.0, 0.10) if mkt_cap > 0 else 0.0

    return {
        "price":             proj_div_ps * p_giveback,
        "div_yield":         div_yield,
        "buyback_yield":     buyback_yield,
        "shareholder_yield": div_yield + buyback_yield,
        "growth_rate":       adj_div_growth,   # from compute_gq on total dividends
        "annual_div_ps":     _div,
        "p_giveback_yield":  p_giveback_yield,
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

    _sp500   = sp500_cagr or 0.10
    financial = is_financial(profile)
    r1 = _m1_ebitda(data, shares or 0, fx_rate, _sp500) if shares else None

    # Float-distorted tickers: customer float or custody assets appear as XBRL
    # liabilities, inflating net_debt and making EV — and therefore EV/EBITDA —
    # unreliable.  Null out M1 and substitute a P/E intrinsic price instead so
    # the blended price anchors to (pe_price, m2_price) rather than a distorted
    # EV/EBITDA result.  M1 intermediates (ebitda_current, net_debt, etc.) are
    # intentionally left None to signal that EV/EBITDA was not used.
    r_pe = None
    if ticker in FLOAT_DISTORTED_TICKERS:
        # Use actual diluted shares from SEC XBRL rather than mktcap/price.
        # mktcap/price fluctuates with today's stock price, making pe_price
        # circular (it anchors partly to the very price it is trying to project).
        _balance = data.get("balance", [])
        _sec_shares = safe_float((_balance[0] if _balance else {}).get("weightedAverageShsOutDil"))
        if _sec_shares > 0:
            pe_shares = _sec_shares
            log.info(
                "[%s] P/E intrinsic: SEC diluted shares %.0fM (mktcap/price would have been %.0fM)",
                ticker, _sec_shares / 1e6, (shares or 0) / 1e6,
            )
        else:
            pe_shares = shares or 0
        r_pe = _pe_intrinsic(data, pe_shares, fx_rate, _sp500) if pe_shares else None
        r1   = None
        log.info(
            "[%s] M1 EV/EBITDA excluded (float-distorted) — P/E intrinsic: price=%.2f, pe_mult=%.1f×",
            ticker,
            r_pe["price"]   if r_pe else float("nan"),
            r_pe["pe_multiple"] if r_pe else float("nan"),
        )

    if financial:
        if ticker:
            log.info("[%s] M2 skipped — financial sector", ticker)
        r2 = None
    else:
        r2 = _m2_fcf(data, shares or 0, fx_rate, _sp500) if shares else None
    r3 = _m3_shareholder_return(data, current_price, shares or 0, fx_rate, _sp500)

    # For float-distorted tickers, pe_price fills the m1 slot so the blended
    # average naturally becomes (pe_price + m2_price) / 2.
    m1 = r_pe["price"] if r_pe else (r1["price"] if r1 else None)
    m2 = r2["price"] if r2 else None
    m3 = r3["price"] if r3 else None

    valid = [p for p in [m1, m2, m3] if p and p > 0]

    # For float-distorted tickers, r_pe fills the M1 slot. Reuse the m1_ebitda_*
    # fields for P/E equivalents so the frontend can display them — ni_current in
    # place of ebitda_current, pe_multiple in place of ev_ebitda_multiple, etc.
    intermediates = {
        "m1_ebitda_current":     round(r_pe["ni_current"],   2) if r_pe else (round(r1["ebitda_current"],   2) if r1 else None),
        "m1_ebitda_projected":   round(r_pe["ni_projected"], 2) if r_pe else (round(r1["ebitda_projected"], 2) if r1 else None),
        "m1_growth_rate":        round(r_pe["growth_rate"],  4) if r_pe else (round(r1["growth_rate"],      4) if r1 else None),
        "m1_ev_ebitda_multiple": round(r_pe["pe_multiple"],  2) if r_pe else (round(r1["ev_ebitda"],        2) if r1 else None),
        "m1_net_debt":           round(r1["net_debt"],       2) if r1 else None,
        "m1_shares":             round(shares,                 2) if shares else None,
        "m2_fcf_current":        round(r2["fcf_current"],      2) if r2 else None,
        "m2_fcf_projected":      round(r2["fcf_projected"],    2) if r2 else None,
        "m2_growth_rate":        round(r2["growth_rate"],      4) if r2 else None,
        "m2_fcf_yield":          round(r2["fcf_yield"],        4) if r2 else None,
        "m3_applicable":         r3 is not None,
        "m3_div_yield":          round(r3["p_giveback_yield"],  4) if r3 and r3.get("p_giveback_yield") is not None else None,
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
