"""
StockSnack — Pipeline Health Report (CLI).

Python port of app/admin/health/page.tsx's methodology, scoped to any ticker
batch — built to QC a new index-group backfill (S&P 400, S&P 600, ...)
against the same checks the live admin page runs, before deciding it's ready
to go live. Skips §08 (FMP-based live price validation — FMP is not used for
anything else in this pipeline) and §6f (fix_log — operational history, not
meaningful for a fresh batch).

Run:
    python health_report.py                              # everything in stock_scores
    python health_report.py --ticker-file sp400_tickers.csv
"""
from __future__ import annotations

import argparse
import statistics as st
import sys
from datetime import datetime, timezone
from pathlib import Path

_PIPELINE_DIR = Path(__file__).parent.parent
_SEC_DIR      = Path(__file__).parent
if str(_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_DIR))

import config  # noqa: F401 — loads pipeline/.env
from supabase import create_client

STALE_DAYS = 14


def fmt_b(v: float | None) -> str:
    if v is None:
        return "—"
    a = abs(v)
    if a >= 1e12:
        return f"${v/1e12:.1f}T"
    if a >= 1e9:
        return f"${v/1e9:.1f}B"
    if a >= 1e6:
        return f"${v/1e6:.0f}M"
    return f"${v:.0f}"


def coverage_label(n: float) -> str:
    return "GOOD" if n >= 90 else "WARN" if n >= 70 else "LOW"


def days_since(iso: str | None) -> int:
    # Python 3.9's fromisoformat needs exactly 0/3/6 fractional digits and no
    # +HH:MM offset — same normalisation verify.py already uses.
    if not iso:
        return 9999
    import re
    s = re.sub(r'[+-]\d{2}:\d{2}$', '', iso.replace("Z", ""))
    s = re.sub(r'\.(\d+)$', lambda m: '.' + m.group(1).ljust(6, '0')[:6], s)
    ts = datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts).days


def load_ticker_filter(filename: str | None) -> list[str] | None:
    if not filename:
        return None
    return [
        line.strip().upper() for line in (_SEC_DIR / filename).read_text().splitlines()
        if line.strip()
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="StockSnack pipeline health report")
    parser.add_argument("--ticker-file", metavar="FILE",
                        help="CSV under sec/ to scope this report to (e.g. sp400_tickers.csv)")
    args = parser.parse_args()
    tf = load_ticker_filter(args.ticker_file)

    client = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)

    scores_q = client.table("stock_scores").select(
        "ticker, final_score, signal, has_anomaly, updated_at, "
        "product_segments, geo_segments, m1_ev_ebitda_multiple, m1_ebitda_current"
    )
    if tf:
        scores_q = scores_q.in_("ticker", tf)
    scores = scores_q.execute().data or []

    fund_q = client.table("stock_fundamentals").select(
        "ticker, fiscal_year, eps, rd_expense, roe, roic, gross_margin, net_margin, "
        "operating_margin, free_cash_flow, total_debt, total_equity, sga, sbc, tax_rate, "
        "capex, shares_outstanding, intangibles, revenue, total_assets, updated_at, ebitda, "
        "net_income, cash_and_equivalents, current_liabilities, gross_profit, "
        "operating_income, dividends_paid, buybacks, operating_cash_flow, retained_earnings"
    ).order("fiscal_year", desc=True)
    if tf:
        fund_q = fund_q.in_("ticker", tf)
    fund_all = fund_q.execute().data or []

    prices_q = client.table("stock_prices").select("ticker, market_cap, shares_outstanding")
    if tf:
        prices_q = prices_q.in_("ticker", tf)
    prices = prices_q.execute().data or []

    if tf:
        exceptions = client.table("confirmed_exceptions").select("ticker, field, reason, confirmed_date") \
            .in_("ticker", tf).execute().data or []
    else:
        exceptions = client.table("confirmed_exceptions").select("ticker, field, reason, confirmed_date") \
            .execute().data or []
    confirmed_set = {(e["ticker"], e["field"]) for e in exceptions}

    latest_fund: dict[str, dict] = {}
    latest_updated: dict[str, str] = {}
    for row in fund_all:  # already DESC by fiscal_year
        t = row["ticker"]
        if t not in latest_fund:
            latest_fund[t] = row
        if row.get("updated_at") and (t not in latest_updated or row["updated_at"] > latest_updated[t]):
            latest_updated[t] = row["updated_at"]

    by_ticker: dict[str, list[dict]] = {}
    for row in fund_all:
        by_ticker.setdefault(row["ticker"], []).append(row)

    price_map       = {p["ticker"]: p["market_cap"] for p in prices}
    price_share_map = {p["ticker"]: p["shares_outstanding"] for p in prices}

    # ── 01 Summary ──────────────────────────────────────────────────────────
    total_tickers   = len(scores)
    with_final      = sum(1 for s in scores if s.get("final_score") is not None)
    anomaly_flagged = sum(1 for s in scores if s.get("has_anomaly"))
    complete_pct    = round(100 * with_final / total_tickers) if total_tickers else 0

    # ── 02 Field coverage ───────────────────────────────────────────────────
    fund_fields = ["eps", "rd_expense", "roe", "roic", "gross_margin", "net_margin",
                   "operating_margin", "free_cash_flow", "total_debt", "total_equity",
                   "sga", "sbc", "tax_rate", "capex", "shares_outstanding", "intangibles"]
    latest_fund_values = list(latest_fund.values())
    fund_total = len(latest_fund)
    coverage_rows = []
    for f in fund_fields:
        populated = sum(1 for r in latest_fund_values if r.get(f) is not None)
        cov = round(100 * populated / fund_total) if fund_total else 0
        coverage_rows.append((f, "fundamentals", populated, fund_total - populated, cov))
    scores_total = len(scores)
    for label, populated in [
        ("product_segments", sum(1 for s in scores if s.get("product_segments"))),
        ("geo_segments",     sum(1 for s in scores if s.get("geo_segments"))),
        ("m1_ev_ebitda_multiple", sum(1 for s in scores if s.get("m1_ev_ebitda_multiple") is not None)),
    ]:
        cov = round(100 * populated / scores_total) if scores_total else 0
        coverage_rows.append((label, "stock_scores", populated, scores_total - populated, cov))

    # ── 03 Quality flags ────────────────────────────────────────────────────
    long_seg_names = []
    for s in scores:
        for seg in (s.get("product_segments") or []):
            name = seg.get("name") or ""
            if len(name) > 40:
                long_seg_names.append((s["ticker"], name, len(name)))

    missing_data = []
    for s in scores:
        flags = []
        if s.get("final_score") is None: flags.append("final_score")
        if s.get("m1_ev_ebitda_multiple") is None: flags.append("m1_ev_ebitda_multiple")
        if not s.get("product_segments"): flags.append("product_segments")
        if not s.get("geo_segments"): flags.append("geo_segments")
        if flags:
            missing_data.append((s["ticker"], flags))
    missing_data.sort()

    # ── 04 Anomaly alerts (>10x median) ─────────────────────────────────────
    revs    = [r["revenue"] for r in latest_fund_values if r.get("revenue")]
    assets  = [r["total_assets"] for r in latest_fund_values if r.get("total_assets")]
    mktcaps = [v for v in price_map.values() if v]
    med_rev, med_assets, med_mktcap = (st.median(x) if x else 0 for x in (revs, assets, mktcaps))

    anomalies = []
    for t, row in latest_fund.items():
        rev, ast, mc = row.get("revenue"), row.get("total_assets"), price_map.get(t)
        flags = []
        if rev and med_rev and rev > med_rev * 10: flags.append("REVENUE")
        if ast and med_assets and ast > med_assets * 10: flags.append("TOTAL ASSETS")
        if mc and med_mktcap and mc > med_mktcap * 10: flags.append("MARKET CAP")
        if flags:
            anomalies.append((t, rev, ast, mc, flags))
    anomalies.sort()

    # ── 05 Staleness ─────────────────────────────────────────────────────────
    staleness = sorted(
        ((s["ticker"], latest_updated.get(s["ticker"]), days_since(latest_updated.get(s["ticker"])))
         for s in scores),
        key=lambda r: -r[2],
    )
    stale_count = sum(1 for _, _, d in staleness if d > STALE_DAYS)

    # ── 06 Systemic risk flags ───────────────────────────────────────────────
    score_map = {s["ticker"]: s for s in scores}

    ebitda_sanity = []
    for t, fund in latest_fund.items():
        ebitda = (score_map.get(t) or {}).get("m1_ebitda_current")
        rev = fund.get("revenue")
        if ebitda is not None and rev and abs(ebitda) > rev * 5:
            ebitda_sanity.append((t, ebitda, rev, ebitda / rev))
    ebitda_sanity.sort(key=lambda r: -abs(r[3]))

    eps_computable = []
    for t, fund in latest_fund.items():
        if fund.get("eps") is None and fund.get("net_income") is not None and (fund.get("shares_outstanding") or 0) > 0:
            eps_computable.append((t, fund["net_income"], fund["shares_outstanding"]))
    eps_computable.sort()

    float_flags = []
    for t, fund in latest_fund.items():
        cash, rev, cl = fund.get("cash_and_equivalents"), fund.get("revenue"), fund.get("current_liabilities")
        if cash and rev and cl and rev > 0 and cash > 0:
            cash_rev, liab_cash = cash / rev, cl / cash
            if cash_rev > 2 and liab_cash > 1.5:
                float_flags.append((t, cash, rev, cl, cash_rev, liab_cash))
    float_flags.sort(key=lambda r: -r[5])

    ebitda_missing = []
    for t, fund in latest_fund.items():
        ni = fund.get("net_income")
        if ni is not None and ni > 0 and not fund.get("ebitda"):
            ebitda_missing.append((t, fund.get("ebitda"), ni))
    ebitda_missing.sort()

    # 6g (new): SG&A null despite revenue being populated — a company with real
    # income-statement data almost certainly has an SG&A figure to report, even
    # if small. Found via S&P 400/500 comparison: ~30% of BOTH universes hit
    # this, including obvious cases (Kroger, Chipotle) that definitely have
    # SG&A in reality — a pre-existing extraction gap, not a new one.
    # R&D tracked separately (rd_missing) since a null R&D is usually
    # legitimate — most non-tech companies (airlines, grocers, insurers)
    # genuinely report none — conflating the two would bury the real signal.
    sga_missing, rd_missing = [], []
    for t, fund in latest_fund.items():
        rev = fund.get("revenue")
        if not rev:
            continue
        if fund.get("sga") is None:
            sga_missing.append((t, rev))
        if fund.get("rd_expense") is None:
            rd_missing.append((t, rev))
    sga_missing.sort()
    rd_missing.sort()

    split_mismatches = []
    for t, fund in latest_fund.items():
        filing_eps, ni, shares = fund.get("eps"), fund.get("net_income"), price_share_map.get(t)
        if filing_eps is not None and ni is not None and shares and ni > 0 and shares > 0:
            implied = ni / shares
            if implied > 0:
                ratio = filing_eps / implied
                if ratio > 3 or ratio < 0.33:
                    split_mismatches.append((t, filing_eps, implied, ratio, ni, shares))
    split_mismatches.sort(key=lambda r: -abs(r[3]))

    # ── 07 Missing data gaps ─────────────────────────────────────────────────
    gap_fields = ["revenue", "gross_profit", "sga", "rd_expense", "operating_income",
                  "net_income", "ebitda", "eps", "operating_cash_flow", "free_cash_flow",
                  "capex", "sbc", "dividends_paid", "buybacks", "total_debt", "total_equity",
                  "total_assets", "cash_and_equivalents", "retained_earnings"]
    data_gaps, all_null_flags = [], []
    for t, rows in by_ticker.items():
        sorted_rows = sorted(rows, key=lambda r: r["fiscal_year"])
        for f in gap_fields:
            year_map = {r["fiscal_year"]: r.get(f) for r in sorted_rows}
            years = sorted(year_map.keys())
            valid_years = [y for y in years if year_map.get(y) is not None]
            if not valid_years:
                all_null_flags.append((t, f))
                continue
            first, last = valid_years[0], valid_years[-1]
            if first == last:
                continue
            gaps = [y for y in years if first < y < last and year_map.get(y) is None]
            if gaps:
                data_gaps.append((t, f, gaps))
    data_gaps.sort()
    all_null_flags.sort()
    all_null_active    = [f for f in all_null_flags if f not in confirmed_set]
    all_null_confirmed = [f for f in all_null_flags if f in confirmed_set]

    # ── 09 Data integrity checks ─────────────────────────────────────────────
    balance_sanity = []
    for t, fund in latest_fund.items():
        d, a = fund.get("total_debt"), fund.get("total_assets")
        if d is not None and a and d >= a * 0.98:
            balance_sanity.append((t, d, a, d / a))
    balance_sanity.sort(key=lambda r: -r[3])

    freeze_fields = ["revenue", "net_income", "total_assets", "operating_income"]
    frozen_values = []
    for t, rows in by_ticker.items():
        sorted_rows = sorted(rows, key=lambda r: r["fiscal_year"])
        for f in freeze_fields:
            pts = [(r["fiscal_year"], r[f]) for r in sorted_rows if r.get(f) not in (None, 0)]
            i = 0
            while i < len(pts):
                j = i + 1
                while j < len(pts) and pts[j][1] == pts[i][1]:
                    j += 1
                if j - i >= 3:
                    frozen_values.append((t, f, pts[i][1], [p[0] for p in pts[i:j]]))
                i = j
    frozen_values.sort()

    # Extended from the original 3 fields — found via S&P 400/500 comparison
    # that net_income/FCF/OCF/gross_profit swings this large were happening
    # undetected in BOTH universes (suspicious round placeholder-looking
    # values like -$1M or $200K next to real multi-hundred-million figures).
    scale_fields = ["revenue", "ebitda", "total_assets", "net_income",
                     "free_cash_flow", "operating_cash_flow", "gross_profit"]
    scale_errors = []
    for t, rows in by_ticker.items():
        sorted_rows = sorted(rows, key=lambda r: r["fiscal_year"])
        for f in scale_fields:
            prev = None
            for r in sorted_rows:
                curr = r.get(f)
                if curr is not None and prev is not None and prev != 0:
                    ratio = abs(curr / prev)
                    if ratio > 100 or ratio < 0.01:
                        scale_errors.append((t, f, r["fiscal_year"], prev, curr, ratio))
                if curr is not None:
                    prev = curr
    scale_errors.sort(key=lambda r: -r[5])

    nonneg_fields = ["total_debt", "revenue", "total_assets", "shares_outstanding"]
    negative_errors = []
    for t, rows in by_ticker.items():
        for f in nonneg_fields:
            for r in rows:
                v = r.get(f)
                if isinstance(v, (int, float)) and v < 0:
                    negative_errors.append((t, f, v, r["fiscal_year"]))
    negative_errors.sort()

    nm_vals = [r["net_margin"] for r in latest_fund_values if r.get("net_margin") is not None]
    nm_mu, nm_sd = (st.mean(nm_vals), st.pstdev(nm_vals)) if nm_vals else (0, 0)
    de_vals = [r["total_debt"] / r["total_equity"] for r in latest_fund_values
               if r.get("total_debt") is not None and r.get("total_equity")]
    de_mu, de_sd = (st.mean(de_vals), st.pstdev(de_vals)) if de_vals else (0, 0)
    peer_outliers = []
    for t, fund in latest_fund.items():
        nm = fund.get("net_margin")
        if nm is not None and nm_sd > 0:
            z = (nm - nm_mu) / nm_sd
            if abs(z) > 3:
                peer_outliers.append((t, "net_margin", nm, nm_mu, nm_sd, z))
        d, e = fund.get("total_debt"), fund.get("total_equity")
        if d is not None and e and de_sd > 0:
            de = d / e
            z = (de - de_mu) / de_sd
            if abs(z) > 3:
                peer_outliers.append((t, "debt/equity", de, de_mu, de_sd, z))
    peer_outliers.sort(key=lambda r: -abs(r[5]))

    freshness = [(t, max(r["fiscal_year"] for r in rows)) for t, rows in by_ticker.items()]
    median_year = st.median([y for _, y in freshness]) if freshness else 0
    stale_year_rows = sorted([f for f in freshness if f[1] < median_year], key=lambda r: r[1])

    sig_counts = {"BUY": 0, "HOLD": 0, "SELL": 0, "NONE": 0}
    for s in scores:
        sig = (s.get("signal") or "").upper()
        if "BUY" in sig: sig_counts["BUY"] += 1
        elif "HOLD" in sig: sig_counts["HOLD"] += 1
        elif "SELL" in sig: sig_counts["SELL"] += 1
        else: sig_counts["NONE"] += 1
    sig_total = len(scores)
    sig_skewed = sig_total > 0 and (
        sig_counts["BUY"] / sig_total > 0.80 or
        sig_counts["SELL"] / sig_total > 0.80 or
        sig_counts["NONE"] / sig_total > 0.30
    )

    # 9h (new): segment percentages should sum to ~100% — a real bug (double
    # counted or dropped segment) would show up as a sum far from 100.
    # Checked clean at 0/398 and 0/502 when this was first added; kept as a
    # standing check since it's cheap and catches a real class of bug.
    segment_pct_errors = []
    for s in scores:
        for field in ("product_segments", "geo_segments"):
            segs = s.get(field)
            if not segs:
                continue
            total = sum(seg.get("pct", 0) for seg in segs)
            if abs(total - 100) > 2:
                segment_pct_errors.append((s["ticker"], field, round(total, 1), len(segs)))
    segment_pct_errors.sort(key=lambda r: -abs(r[2] - 100))

    # ── 10 Triage ─────────────────────────────────────────────────────────
    triage = [t for t in [
        (1, "07",  len(data_gaps),        "interior data gaps (null mid-run)"),
        (1, "07",  len(all_null_active),  "all-null fields unconfirmed"),
        (1, "09a", len(balance_sanity),   "balance sheet sanity failures"),
        (1, "09c", len(scale_errors),     "scale/magnitude errors (YoY >100x)"),
        (1, "09d", len(negative_errors),  "negative sign errors"),
        (1, "06a", len(ebitda_sanity),    "EBITDA >5x revenue (scoring input corrupt)"),
        (1, "09g", 1 if sig_skewed else 0, "signal distribution skewed"),
        (1, "09h", len(segment_pct_errors), "segment percentages don't sum to 100%"),
        (2, "06b", len(eps_computable),   "EPS null but computable"),
        (2, "06d", len(ebitda_missing),   "EBITDA null/zero with positive net income"),
        (2, "06g", len(sga_missing),      "SG&A null despite revenue populated (R&D excluded — usually legitimate)"),
        (2, "09b", len(frozen_values),    "frozen values across 3+ years"),
        (2, "09f", len(stale_year_rows),  "tickers below median fiscal year"),
        (3, "04",  len(anomalies),        "magnitude outliers >10x median"),
        (3, "09e", len(peer_outliers),    "peer outliers >3 sigma"),
        (3, "05",  stale_count,           f"stale pipeline entries (>{STALE_DAYS}d)"),
        (3, "03",  len(long_seg_names),   "segment names >40 chars"),
    ] if t[2] > 0]
    triage.sort(key=lambda t: (t[0], -t[2]))
    p1 = sum(1 for t in triage if t[0] == 1)
    p2 = sum(1 for t in triage if t[0] == 2)

    # ── print report ─────────────────────────────────────────────────────────
    hr = "─" * 60
    print(hr)
    print("STOCKSNACK · PIPELINE HEALTH REPORT" + (f"  [{args.ticker_file}]" if args.ticker_file else "  [all tickers]"))
    print(datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT"))
    print(hr)

    print("\n01 — SUMMARY")
    print(f"  TOTAL TICKERS TRACKED   {total_tickers}")
    print(f"  COMPLETE CORE DATA      {complete_pct}% ({with_final} with final_score)")
    print(f"  ANOMALY FLAGS ACTIVE    {anomaly_flagged}")

    print(f"\n02 — FIELD COVERAGE  ({fund_total} in fundamentals · {scores_total} in scores)")
    print(f"  {'FIELD':<25} {'SOURCE':<14} {'POP':>5} {'NULL':>5} {'COV':>4}  STATUS")
    for label, source, pop, null_, cov in coverage_rows:
        print(f"  {label:<25} {source:<14} {pop:>5} {null_:>5} {cov:>3}%  {coverage_label(cov)}")

    print(f"\n03 — QUALITY FLAGS")
    print(f"  SEGMENT NAMES > 40 CHARS ({len(long_seg_names)})")
    for t, name, ln in long_seg_names:
        print(f"    {t:<6} [{ln}] {name}")
    print(f"  MISSING CRITICAL FIELDS ({len(missing_data)} tickers)")
    for t, flags in missing_data[:30]:
        print(f"    {t:<6} {' · '.join(flags)}")
    if len(missing_data) > 30:
        print(f"    ... and {len(missing_data) - 30} more")

    print(f"\n04 — ANOMALY ALERTS >10x MEDIAN ({len(anomalies)})  median rev={fmt_b(med_rev)} assets={fmt_b(med_assets)} mktcap={fmt_b(med_mktcap)}")
    for t, rev, ast, mc, flags in anomalies:
        print(f"    {t:<6} rev={fmt_b(rev):>8} assets={fmt_b(ast):>8} mktcap={fmt_b(mc):>8}  {' · '.join(flags)}")

    print(f"\n05 — PIPELINE STALENESS  {stale_count} STALE (>{STALE_DAYS}d) · {len(staleness) - stale_count} OK")

    print(f"\n06 — SYSTEMIC RISK FLAGS")
    print(f"  6a EBITDA >5x revenue ({len(ebitda_sanity)})")
    for t, ebitda, rev, ratio in ebitda_sanity:
        print(f"    {t:<6} ebitda={fmt_b(ebitda)}  rev={fmt_b(rev)}  {ratio:.1f}x")
    print(f"  6b EPS null but computable ({len(eps_computable)})")
    for t, ni, sh in eps_computable[:20]:
        print(f"    {t:<6} net_income={fmt_b(ni)}  shares={sh/1e6:.1f}M  implied_eps=${ni/sh:.2f}")
    print(f"  6c balance sheet float flag ({len(float_flags)})")
    for t, cash, rev, cl, cr, lc in float_flags:
        print(f"    {t:<6} cash={fmt_b(cash)} rev={fmt_b(rev)} cash/rev={cr:.1f}x liab/cash={lc:.1f}x")
    print(f"  6d EBITDA null/zero with positive net income ({len(ebitda_missing)})")
    for t, eb, ni in ebitda_missing[:30]:
        print(f"    {t:<6} ebitda={'NULL' if eb is None else '0'}  net_income={fmt_b(ni)}")
    if len(ebitda_missing) > 30:
        print(f"    ... and {len(ebitda_missing) - 30} more")
    print(f"  6e split mismatch detector ({len(split_mismatches)})")
    for t, fe, ie, ratio, ni, sh in split_mismatches:
        print(f"    {t:<6} filing_eps=${fe:.2f} implied_eps=${ie:.2f}  {ratio:.1f}x")
    print(f"  6g SG&A null despite revenue populated ({len(sga_missing)})")
    for t, rev in sga_missing[:20]:
        print(f"    {t:<6} revenue={fmt_b(rev)}")
    if len(sga_missing) > 20:
        print(f"    ... and {len(sga_missing) - 20} more")
    print(f"  (for reference, R&D null despite revenue: {len(rd_missing)} — excluded from triage, usually legitimate)")

    print(f"\n07 — MISSING DATA GAPS  ({len(data_gaps)} interior · {len(all_null_active)} all-null active · {len(all_null_confirmed)} confirmed OK)")
    for t, f, gaps in data_gaps[:20]:
        print(f"    {t:<6} {f:<22} missing years: {gaps}")
    if len(data_gaps) > 20:
        print(f"    ... and {len(data_gaps) - 20} more")

    print(f"\n09 — DATA INTEGRITY CHECKS")
    print(f"  9a balance sheet sanity        {len(balance_sanity)} flagged")
    print(f"  9b frozen values               {len(frozen_values)} flagged")
    print(f"  9c scale/magnitude errors      {len(scale_errors)} flagged")
    print(f"  9d negative sign errors        {len(negative_errors)} flagged")
    print(f"  9e peer outliers (>3σ)         {len(peer_outliers)} flagged")
    print(f"  9f stale fiscal year           {len(stale_year_rows)} flagged (median year {median_year})")
    print(f"  9g signal distribution         {'SKEWED ⚠' if sig_skewed else 'OK'}  "
          f"BUY {sig_counts['BUY']} · HOLD {sig_counts['HOLD']} · SELL {sig_counts['SELL']} · NONE {sig_counts['NONE']}")
    print(f"  9h segment pct sums != 100%    {len(segment_pct_errors)} flagged")
    for t, field, total, n in segment_pct_errors[:20]:
        print(f"    {t:<6} {field:<18} sums to {total}%  ({n} segments)")

    print(f"\n10 — TRIAGE SUMMARY  ({len(triage)} active issues · P1:{p1} P2:{p2} P3:{len(triage)-p1-p2})")
    for pri, section, count, label in triage:
        badge = f"P{pri}"
        print(f"  [{badge}] §{section}  {count} × {label}")
    print(hr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
