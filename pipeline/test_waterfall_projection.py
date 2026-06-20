"""
Dry-run test: A/B1/B2/C waterfall projection for EBITDA (M1) and FCF (M2).
Does NOT write anything to Supabase.
"""
from __future__ import annotations
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from config import SUPABASE_URL, SUPABASE_KEY
from scoring.layer1_ppm import score_ppm
from scoring.layer4_final import score_final
from scoring.layer2_growth import score_growth
from scoring.layer3_health import score_health
from scoring.utils import project_series, tapered_project, safe_float
from supabase import create_client

EBITDA_TICKERS = ["IP", "CNC", "KHC", "TAP", "SATS", "CRWD", "SNDK", "MRNA"]
FCF_TICKERS    = ["AMZN", "NFLX", "UBER", "VRTX", "CEG", "SMCI", "BALL"]
ALL_TICKERS    = list(dict.fromkeys(EBITDA_TICKERS + FCF_TICKERS))

SP500_CAGR = 0.136


def _f(v, default=0.0):
    try: return float(v) if v is not None else default
    except: return default

def fmt_m(v):
    if v is None: return "null"
    return f"${_f(v)/1e6:+.1f}M"

def fmt_price(v):
    if v is None: return "null"
    return f"${_f(v):.2f}"

def fmt_pct(v):
    if v is None: return "null"
    return f"{_f(v)*100:+.2f}%"

def fmt_score(v):
    if v is None: return "null"
    return f"{_f(v):.2f}"


def build_data(fund_rows, price_row, stock_row):
    income, cashflow, balance, metrics = [], [], [], []
    for r in fund_rows:
        ebitda = _f(r.get("ebitda")); ni = _f(r.get("net_income"))
        fcf = _f(r.get("free_cash_flow")); div = _f(r.get("dividends_paid"))
        td = _f(r.get("total_debt")); cash = _f(r.get("cash_and_equivalents"))
        mktcap_y = _f(r.get("market_cap_at_year")); shares_y = _f(r.get("shares_outstanding"))
        buybacks = _f(r.get("buybacks"))
        net_debt = td - cash

        income.append({"ebitda": ebitda, "netIncome": ni})
        cashflow.append({"freeCashFlow": fcf, "dividendsPaid": div,
                         "commonStockRepurchased": -abs(buybacks) if buybacks else 0.0})
        balance.append({"netDebt": net_debt, "weightedAverageShsOutDil": shares_y})

        ev_ebitda = (mktcap_y + net_debt) / ebitda if ebitda and ebitda != 0 and mktcap_y > 0 else 0.0
        p_fcf_m   = mktcap_y / fcf if fcf > 0 and mktcap_y > 0 else 0.0
        dy        = abs(div) / mktcap_y if div and mktcap_y > 0 else 0.0
        metrics.append({"evToEBITDA": ev_ebitda, "priceToFreeCashFlowsRatio": p_fcf_m,
                        "dividendYield": dy, "marketCap": mktcap_y})

    price = _f(price_row.get("current_price")); mktcap = _f(price_row.get("market_cap"))
    shares_cur = mktcap / price if price > 0 else 0
    last_div = 0.0
    if fund_rows:
        dt = _f(fund_rows[0].get("dividends_paid"))
        if dt and shares_cur > 0: last_div = abs(dt) / shares_cur
    profile = {"price": price, "marketCap": mktcap,
               "sector": stock_row.get("sector",""), "industry": stock_row.get("industry",""),
               "lastDividend": last_div}
    return {"income": income, "cashflow": cashflow, "balance": balance,
            "metrics": metrics, "profile": profile}


def analyse_waterfall(vals_newest_first: list[float]) -> dict:
    window      = vals_newest_first[:5]
    oldest_first = list(reversed(window))
    pj          = project_series(oldest_first, SP500_CAGR)

    # Determine starting value for projection (B2 uses replacement, others use actual current)
    current = pj.get("projection_base")
    if current is None:
        current = vals_newest_first[0] if vals_newest_first else None

    proj_5y = None
    if current is not None:
        proj_5y = tapered_project(
            current,
            pj["weighted_cagr"],
            pj["avg_dollar_change"],
        )

    cumsum_ok = pj["cumulative_sum"] > 0
    proj_ok   = proj_5y is not None and proj_5y > 0
    included  = cumsum_ok and proj_ok

    return {
        **pj,
        "current":      vals_newest_first[0] if vals_newest_first else None,
        "proj_base":    current,
        "proj_5y":      proj_5y,
        "cumsum_ok":    cumsum_ok,
        "proj_ok":      proj_ok,
        "included":     included,
        "series_str":   [f"{v/1e6:+.1f}M" for v in oldest_first],
    }


def print_waterfall(label: str, a: dict) -> None:
    gate = "INCLUDED" if a["included"] else "EXCLUDED"
    if not a["included"]:
        reasons = []
        if not a["cumsum_ok"]: reasons.append("cumsum ≤ 0")
        if not a["proj_ok"]:   reasons.append("proj ≤ 0")
        gate += f" ({', '.join(reasons)})"

    print(f"\n  {label} waterfall:")
    print(f"    series (oldest→newest): {a['series_str']}")
    print(f"    bucket {a['bucket']}: {a['method']}")
    if a.get("smoothed_values"):
        sv = [f"{v/1e6:+.1f}M" for v in a["smoothed_values"]]
        print(f"    smoothed series:         {sv}")
    print(f"    signal:                  {a['signal']}")
    cs_flag = "PASS" if a["cumsum_ok"] else "FAIL"
    print(f"    cumulative_sum:          {fmt_m(a['cumulative_sum'])}  [{cs_flag}]")
    if a["avg_dollar_change"] is not None:
        print(f"    avg_dollar_change:       {fmt_m(a['avg_dollar_change'])}/yr  (tapered)")
    else:
        print(f"    weighted_cagr:           {a['weighted_cagr']:.4f}  ({a['weighted_cagr']*100:+.1f}%/yr, tapered)")
    if a.get("projection_base") is not None:
        print(f"    projection_base (B2):    {fmt_m(a['projection_base'])}")
    print(f"    current (actual):        {fmt_m(a['current'])}")
    print(f"    5y projection (tapered): {fmt_m(a['proj_5y'])}  → {gate}")


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    fund_all = (
        supabase.table("stock_fundamentals")
        .select("ticker, fiscal_year, ebitda, net_income, free_cash_flow, "
                "dividends_paid, total_debt, cash_and_equivalents, "
                "market_cap_at_year, shares_outstanding, buybacks")
        .in_("ticker", ALL_TICKERS)
        .order("fiscal_year", desc=True)
        .execute().data or []
    )
    prices = (
        supabase.table("stock_prices")
        .select("ticker, current_price, market_cap")
        .in_("ticker", ALL_TICKERS)
        .execute().data or []
    )
    stocks = (
        supabase.table("stocks")
        .select("ticker, sector, industry")
        .in_("ticker", ALL_TICKERS)
        .execute().data or []
    )
    before_rows = (
        supabase.table("stock_scores")
        .select("ticker, ppm_blended_price, ppm_cagr, final_score, signal, "
                "m1_ebitda_current, m1_ebitda_projected, m2_fcf_current, m2_fcf_projected")
        .in_("ticker", ALL_TICKERS)
        .execute().data or []
    )

    fund_by = {}
    for r in fund_all: fund_by.setdefault(r["ticker"], []).append(r)
    price_map  = {r["ticker"]: r for r in prices}
    stock_map  = {r["ticker"]: r for r in stocks}
    before_map = {r["ticker"]: r for r in before_rows}

    sep = "═" * 86

    # ── EBITDA / M1 section ──────────────────────────────────────────────────────
    print(f"\n{sep}")
    print("  M1 / EBITDA  — A/B1/B2/C waterfall bucket analysis")
    print(sep)

    for ticker in EBITDA_TICKERS:
        print(f"\n{'─'*86}")
        print(f"  {ticker}")
        fund_rows = fund_by.get(ticker, [])
        price_row = price_map.get(ticker, {})
        stock_row = stock_map.get(ticker, {})
        b = before_map.get(ticker, {})

        print(f"  BEFORE: m1_ebitda_current={fmt_m(b.get('m1_ebitda_current'))}  "
              f"m1_ebitda_proj={fmt_m(b.get('m1_ebitda_projected'))}  "
              f"blended={fmt_price(b.get('ppm_blended_price'))}  "
              f"score={fmt_score(b.get('final_score'))}  signal={b.get('signal','null')}")

        if not fund_rows or not price_row:
            print("  ERROR: missing data"); continue

        ebitda_vals = [_f(r.get("ebitda")) for r in fund_rows]
        while ebitda_vals and ebitda_vals[0] == 0: ebitda_vals = ebitda_vals[1:]

        a = analyse_waterfall(ebitda_vals)
        print_waterfall("EBITDA", a)

        data = build_data(fund_rows, price_row, stock_row)
        try:
            result = score_ppm(data, ticker=ticker, sp500_cagr=SP500_CAGR)
            final  = score_final(result, score_growth(data, sp500_cagr=SP500_CAGR, ticker=ticker),
                                 score_health(data), SP500_CAGR)
        except Exception as e:
            import traceback; traceback.print_exc(); continue

        print(f"\n  AFTER:  m1_price={fmt_price(result.get('m1_price'))}  "
              f"m2_price={fmt_price(result.get('m2_price'))}  "
              f"blended={fmt_price(result.get('blended_price'))}  "
              f"cagr={fmt_pct(result.get('cagr'))}  "
              f"score={fmt_score(final['score'])}  signal={final['signal']}")

    # ── FCF / M2 section ─────────────────────────────────────────────────────────
    print(f"\n\n{sep}")
    print("  M2 / FCF  — A/B1/B2/C waterfall bucket analysis")
    print(sep)

    for ticker in FCF_TICKERS:
        print(f"\n{'─'*86}")
        print(f"  {ticker}")
        fund_rows = fund_by.get(ticker, [])
        price_row = price_map.get(ticker, {})
        stock_row = stock_map.get(ticker, {})
        b = before_map.get(ticker, {})

        print(f"  BEFORE: m2_fcf_current={fmt_m(b.get('m2_fcf_current'))}  "
              f"m2_fcf_proj={fmt_m(b.get('m2_fcf_projected'))}  "
              f"blended={fmt_price(b.get('ppm_blended_price'))}  "
              f"score={fmt_score(b.get('final_score'))}  signal={b.get('signal','null')}")

        if not fund_rows or not price_row:
            print("  ERROR: missing data"); continue

        fcf_vals = [_f(r.get("free_cash_flow")) for r in fund_rows]

        a = analyse_waterfall(fcf_vals)
        print_waterfall("FCF", a)

        data = build_data(fund_rows, price_row, stock_row)
        try:
            result = score_ppm(data, ticker=ticker, sp500_cagr=SP500_CAGR)
            final  = score_final(result, score_growth(data, sp500_cagr=SP500_CAGR, ticker=ticker),
                                 score_health(data), SP500_CAGR)
        except Exception as e:
            import traceback; traceback.print_exc(); continue

        print(f"\n  AFTER:  m1_price={fmt_price(result.get('m1_price'))}  "
              f"m2_price={fmt_price(result.get('m2_price'))}  "
              f"blended={fmt_price(result.get('blended_price'))}  "
              f"cagr={fmt_pct(result.get('cagr'))}  "
              f"score={fmt_score(final['score'])}  signal={final['signal']}")


if __name__ == "__main__":
    main()
