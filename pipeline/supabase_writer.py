"""Write pipeline results to Supabase via the REST client."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from supabase import create_client, Client
from scoring.utils import safe_float

log = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fiscal_year(row: dict) -> int | None:
    # Prefer the explicit fiscalYear field — date can be the filing date, which
    # may fall in a different calendar year (e.g. JNJ FY2022 filed in 2023).
    date_str = row.get("fiscalYear") or row.get("date") or row.get("calendarYear") or ""
    try:
        return int(str(date_str)[:4])
    except (ValueError, TypeError):
        return None


def _build_fundamentals(ticker: str, data: dict) -> list[dict]:
    income_list   = data.get("income",   [])
    balance_list  = data.get("balance",  [])
    cashflow_list = data.get("cashflow", [])
    metrics_list  = data.get("metrics",  [])

    balance_by_year  = {_fiscal_year(r): r for r in balance_list  if _fiscal_year(r)}
    cashflow_by_year = {_fiscal_year(r): r for r in cashflow_list if _fiscal_year(r)}
    metrics_by_year  = {_fiscal_year(r): r for r in metrics_list  if _fiscal_year(r)}

    rows = []
    for inc in income_list:
        year = _fiscal_year(inc)
        if not year:
            continue
        bal = balance_by_year.get(year, {})
        cf  = cashflow_by_year.get(year, {})
        m   = metrics_by_year.get(year, {})

        revenue    = safe_float(inc.get("revenue"))    or None
        net_income = safe_float(inc.get("netIncome"))  or None
        ebitda     = safe_float(inc.get("ebitda"))     or None
        total_debt = safe_float(bal.get("totalDebt"))  or None
        total_eq   = safe_float(bal.get("totalEquity")) or safe_float(bal.get("totalStockholdersEquity")) or None
        op_income  = safe_float(inc.get("operatingIncome")) or None
        int_exp    = safe_float(inc.get("interestExpense")) or None

        def pct(num, denom):
            n, d = safe_float(num), safe_float(denom)
            return round(n / d, 6) if d else None

        # debtToEquity and interestCoverage computed from raw fields (not in stable key-metrics)
        debt_to_equity = round(total_debt / total_eq, 6) if (total_debt and total_eq) else None
        interest_coverage = round(op_income / abs(int_exp), 6) if (op_income and int_exp and abs(int_exp) > 0) else None

        rows.append({
            "ticker":               ticker,
            "fiscal_year":          year,
            "revenue":              revenue,
            "gross_profit":         safe_float(inc.get("grossProfit"))         or None,
            "ebitda":               ebitda,
            "operating_income":     op_income,
            "net_income":           net_income,
            "eps":                  safe_float(inc.get("eps"))                 or None,
            "total_assets":         safe_float(bal.get("totalAssets"))         or None,
            "total_debt":           total_debt,
            "total_equity":         total_eq,
            "cash_and_equivalents": safe_float(bal.get("cashAndCashEquivalents")) or safe_float(bal.get("cashAndShortTermInvestments")) or None,
            "net_debt":             safe_float(bal.get("netDebt"))             or None,
            "operating_cash_flow":  safe_float(cf.get("operatingCashFlow"))   or None,
            "capex":                safe_float(cf.get("capitalExpenditure"))   or None,
            "free_cash_flow":       safe_float(cf.get("freeCashFlow"))         or None,
            "dividends_paid":       safe_float(cf.get("commonDividendsPaid")) or None,
            "buybacks":             safe_float(cf.get("commonStockRepurchased")) or None,
            "gross_margin":         pct(inc.get("grossProfit"),    revenue),
            "operating_margin":     pct(inc.get("operatingIncome"), revenue),
            "net_margin":           pct(net_income,                 revenue),
            "roe":                  safe_float(m.get("returnOnEquity"))        or None,
            "roic":                 safe_float(m.get("returnOnInvestedCapital")) or None,
            "debt_to_equity":       debt_to_equity,
            "current_ratio":        safe_float(m.get("currentRatio"))          or None,
            "interest_coverage":    interest_coverage,
            "ev_to_ebitda":         safe_float(m.get("evToEBITDA"))            or None,
            "updated_at":           _now(),
        })
    return rows


class SupabaseWriter:
    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)

    def upsert_stock(self, ticker: str, data: dict) -> None:
        profile = data.get("profile", {})

        # Parse 52-week range ("low-high")
        low52 = high52 = None
        range_str = profile.get("range", "")
        if range_str and "-" in range_str:
            try:
                parts = range_str.rsplit("-", 1)
                low52  = float(parts[0])
                high52 = float(parts[1])
            except (ValueError, IndexError):
                pass

        price  = safe_float(profile.get("price"))     or None
        mkt    = safe_float(profile.get("marketCap")) or None
        shares = mkt / price if (price and mkt) else None

        self.client.table("stocks").upsert({
            "ticker":      ticker,
            "name":        profile.get("companyName"),
            "sector":      profile.get("sector"),
            "industry":    profile.get("industry"),
            "exchange":    profile.get("exchange"),
            "description": profile.get("description"),
            "website":     profile.get("website"),
            "country":     profile.get("country"),
            "updated_at":  _now(),
        }).execute()

        self.client.table("stock_prices").upsert({
            "ticker":             ticker,
            "current_price":      price,
            "market_cap":         mkt,
            "shares_outstanding": shares,
            "beta":               safe_float(profile.get("beta")) or None,
            "week_52_high":       high52,
            "week_52_low":        low52,
            "updated_at":         _now(),
        }).execute()

        fundamentals = _build_fundamentals(ticker, data)
        if fundamentals:
            self.client.table("stock_fundamentals").upsert(fundamentals).execute()

    def upsert_scores(
        self,
        ticker: str,
        ppm: dict,
        growth: dict,
        health: dict,
        final: dict,
        spy: dict,
        segments: dict,
    ) -> None:
        self.client.table("stock_scores").upsert({
            "ticker":             ticker,
            # Layer 1
            "ppm_score":          ppm.get("score"),
            "ppm_m1_price":       ppm.get("m1_price"),
            "ppm_m2_price":       ppm.get("m2_price"),
            "ppm_m3_price":       ppm.get("m3_price"),
            "ppm_blended_price":  ppm.get("blended_price"),
            "ppm_cagr":           ppm.get("cagr"),
            # Layer 1: PPM intermediates
            "m1_ebitda_current":    ppm.get("m1_ebitda_current"),
            "m1_ebitda_projected":  ppm.get("m1_ebitda_projected"),
            "m1_growth_rate":       ppm.get("m1_growth_rate"),
            "m1_ev_ebitda_multiple": ppm.get("m1_ev_ebitda_multiple"),
            "m1_net_debt":          ppm.get("m1_net_debt"),
            "m1_shares":            ppm.get("m1_shares"),
            "m2_fcf_current":       ppm.get("m2_fcf_current"),
            "m2_fcf_projected":     ppm.get("m2_fcf_projected"),
            "m2_growth_rate":       ppm.get("m2_growth_rate"),
            "m2_fcf_yield":         ppm.get("m2_fcf_yield"),
            "m3_applicable":        ppm.get("m3_applicable"),
            "m3_div_yield":         ppm.get("m3_div_yield"),
            "m3_buyback_yield":     ppm.get("m3_buyback_yield"),
            "m3_shareholder_yield": ppm.get("m3_shareholder_yield"),
            "m3_growth_rate":       ppm.get("m3_growth_rate"),
            "m_cumulative_div_ps":  ppm.get("m_cumulative_div_ps"),
            # Layer 2
            "growth_score":       growth.get("score"),
            "revenue_cagr_3y":    growth.get("revenue_cagr_3y"),
            "revenue_cagr_5y":    growth.get("revenue_cagr_5y"),
            "net_income_cagr_3y": growth.get("net_income_cagr_3y"),
            "net_income_cagr_5y": growth.get("net_income_cagr_5y"),
            "fcf_cagr_3y":           growth.get("fcf_cagr_3y"),
            "fcf_cagr_5y":           growth.get("fcf_cagr_5y"),
            "revenue_yoy_rates":     growth.get("revenue_yoy_rates"),
            "net_income_yoy_rates":  growth.get("net_income_yoy_rates"),
            "fcf_yoy_rates":         growth.get("fcf_yoy_rates"),
            "growth_years":          growth.get("growth_years"),
            "gq_signal_revenue":     growth.get("gq_signal_revenue"),
            "gq_signal_net_income":  growth.get("gq_signal_net_income"),
            "gq_signal_fcf":         growth.get("gq_signal_fcf"),
            "gq_master":             growth.get("gq_master"),
            # Layer 3
            "health_score":       health.get("score"),
            "health_passes":      health.get("passes"),
            "health_details":     health.get("details"),
            # Layer 4
            "final_score":        final.get("score"),
            "signal":             final.get("signal"),
            # Benchmark
            "sp500_cagr":         spy.get("sp500_cagr"),
            "sp500_5y_return":    spy.get("sp500_5y_return"),
            # Segments
            "product_segments":   segments.get("product_segments"),
            "geo_segments":       segments.get("geo_segments"),
            "updated_at":         _now(),
        }).execute()

    def start_pipeline_run(self, tickers: list[str]) -> int:
        result = self.client.table("pipeline_runs").insert({
            "tickers_processed": [],
            "tickers_failed":    [],
            "status":            "running",
        }).execute()
        return result.data[0]["id"]

    def complete_pipeline_run(
        self, run_id: int, processed: list[str], failed: list[str]
    ) -> None:
        status = "completed" if not failed or len(processed) >= len(failed) else "partial"
        self.client.table("pipeline_runs").update({
            "completed_at":      _now(),
            "tickers_processed": processed,
            "tickers_failed":    failed,
            "status":            status,
        }).eq("id", run_id).execute()
