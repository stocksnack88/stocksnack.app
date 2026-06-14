"use client";
import { useState } from "react";

type HealthCheck = {
  name: string;
  pass: boolean;
  score: number;
  years_passed: number;
  not_scored?: boolean;
};

export type HealthCat = {
  label: string;
  checks: HealthCheck[];
};

export type FundRow = {
  fiscal_year: number;
  cash_and_equivalents: number | null;
  total_debt: number | null;
  debt_to_equity: number | null;
  total_equity: number | null;
  buybacks: number | null;
  roe: number | null;
  roic: number | null;
  operating_income: number | null;
  total_assets: number | null;
  gross_margin: number | null;
  interest_coverage: number | null;
  net_margin: number | null;
  eps: number | null;
  operating_cash_flow: number | null;
  free_cash_flow: number | null;
  capex: number | null;
  dividends_paid: number | null;
  net_income: number | null;
  market_cap_at_year: number | null;
  sga: number | null;
  rd_expense: number | null;
  tax_rate: number | null;
  sbc: number | null;
  shares_outstanding: number | null;
  intangibles: number | null;
  preferred_stock: number | null;
};

// ── Metric detail map ────────────────────────────────────────────────────────

type MetricField = {
  key: keyof FundRow;
  label: string;
  fmt: "bn" | "pct" | "x" | "dollar" | "count";
  hib: boolean;            // higher is better (used for individual value coloring)
  lowerIsBetter: boolean;  // decreasing trend is healthy (used for sparkline + verdict)
  abs?: boolean;           // show absolute value (for stored-negative outflows)
  neutral?: boolean;       // no red/green coloring — value is neither good nor bad in isolation
};

type CheckDetail = {
  fields: MetricField[];
  description: string;
};

const METRIC_DETAIL: [string, CheckDetail][] = [
  ["cash/debt", {
    fields: [
      { key: "cash_and_equivalents", label: "CASH",       fmt: "bn", hib: true,  lowerIsBetter: false },
      { key: "total_debt",           label: "TOTAL DEBT", fmt: "bn", hib: false, lowerIsBetter: true },
    ],
    description: "Compares cash on hand to total debt — more cash than debt signals the company can meet obligations without stress.",
  }],
  ["debt/equity", {
    fields: [{ key: "debt_to_equity", label: "DEBT / EQUITY", fmt: "x", hib: false, lowerIsBetter: true }],
    description: "Total debt divided by shareholders' equity — measures financial leverage; lower means less risk.",
  }],
  ["preferred stock", {
    fields: [{ key: "preferred_stock", label: "PREFERRED STOCK", fmt: "bn", hib: false, lowerIsBetter: true }],
    description: "Value of preferred shares outstanding — preferred holders get paid before common shareholders in dividends and liquidation.",
  }],
  ["retained earnings", {
    fields: [{ key: "total_equity", label: "TOTAL EQUITY", fmt: "bn", hib: true, lowerIsBetter: false }],
    description: "Total shareholders' equity grows when a company retains profits year after year instead of paying them all out.",
  }],
  ["active buybacks", {
    fields: [{ key: "buybacks", label: "BUYBACKS", fmt: "bn", hib: true, lowerIsBetter: false, abs: true }],
    description: "Cash spent repurchasing shares — reduces share count and increases each remaining shareholder's ownership.",
  }],
  ["roe", {
    fields: [{ key: "roe", label: "RETURN ON EQUITY", fmt: "pct", hib: true, lowerIsBetter: false }],
    description: "Net income divided by shareholders' equity — how efficiently the company turns invested capital into profit.",
  }],
  ["rota", {
    fields: [
      { key: "operating_income", label: "OPERATING INCOME", fmt: "bn", hib: true, lowerIsBetter: false },
      { key: "total_assets",     label: "TOTAL ASSETS",     fmt: "bn", hib: true, lowerIsBetter: false },
    ],
    description: "Operating income divided by total assets — how effectively the company generates profit from everything it owns.",
  }],
  ["gross margin", {
    fields: [{ key: "gross_margin", label: "GROSS MARGIN", fmt: "pct", hib: true, lowerIsBetter: false }],
    description: "Revenue minus cost of goods sold as a percentage — reflects pricing power and production cost efficiency.",
  }],
  ["sg&a", {
    fields: [{ key: "sga", label: "SG&A EXPENSE", fmt: "bn", hib: false, lowerIsBetter: true }],
    description: "Selling, general, and administrative expenses — overhead costs that eat into gross profit on the way to operating income.",
  }],
  ["r&d", {
    fields: [{ key: "rd_expense", label: "R&D EXPENSE", fmt: "bn", hib: false, lowerIsBetter: false }],
    description: "Research and development spending — reduces current earnings but may fuel future growth; the check flags excessive R&D relative to gross profit.",
  }],
  ["interest", {
    fields: [{ key: "interest_coverage", label: "INTEREST COVERAGE", fmt: "x", hib: true, lowerIsBetter: false }],
    description: "Operating income divided by interest expense — how many times the company can cover its debt payments from earnings.",
  }],
  ["tax rate", {
    fields: [{ key: "tax_rate", label: "EFFECTIVE TAX RATE", fmt: "pct", hib: false, lowerIsBetter: true }],
    description: "Income tax expense divided by pre-tax income — the check flags rates outside the 15–25% normal range as potential accounting anomalies.",
  }],
  ["net margin", {
    fields: [{ key: "net_margin", label: "NET MARGIN", fmt: "pct", hib: true, lowerIsBetter: false }],
    description: "Net income as a percentage of revenue — how many cents of profit the company keeps from every dollar of sales.",
  }],
  ["eps growth", {
    fields: [{ key: "eps", label: "EARNINGS PER SHARE", fmt: "dollar", hib: true, lowerIsBetter: false }],
    description: "Net income divided by shares outstanding — the profit attributable to each share, which should grow over time.",
  }],
  ["sbc", {
    fields: [{ key: "sbc", label: "STOCK-BASED COMP", fmt: "bn", hib: false, lowerIsBetter: true }],
    description: "Non-cash compensation paid as equity — dilutes shareholders and inflates reported earnings vs real cash profit.",
  }],
  ["ocf", {
    fields: [{ key: "operating_cash_flow", label: "OPERATING CASH FLOW", fmt: "bn", hib: true, lowerIsBetter: false }],
    description: "Cash generated from core business operations — the real cash engine before investment and financing.",
  }],
  ["fcf growth", {
    fields: [{ key: "free_cash_flow", label: "FREE CASH FLOW", fmt: "bn", hib: true, lowerIsBetter: false }],
    description: "Operating cash flow minus capital expenditure — the cash the business generates after maintaining its asset base.",
  }],
  ["capex", {
    fields: [{ key: "capex", label: "CAPITAL EXPENDITURE", fmt: "bn", hib: false, lowerIsBetter: false, abs: true }],
    description: "Cash spent on property, plant, and equipment — high capex relative to cash flow signals a capital-intensive business.",
  }],
  ["payout ratio", {
    fields: [
      { key: "free_cash_flow", label: "FREE CASH FLOW", fmt: "bn", hib: true,  lowerIsBetter: false },
      { key: "dividends_paid", label: "DIVIDENDS PAID", fmt: "bn", hib: false, lowerIsBetter: false, abs: true },
      { key: "buybacks",       label: "BUYBACKS",       fmt: "bn", hib: false, lowerIsBetter: false, abs: true },
    ],
    description: "Whether dividends and buybacks combined are covered by free cash flow — returns exceeding FCF may not be sustainable.",
  }],
  ["dilution", {
    fields: [{ key: "shares_outstanding", label: "SHARES OUTSTANDING", fmt: "count", hib: false, lowerIsBetter: true, neutral: true }],
    description: "Diluted share count — a rising count means new shares are being issued, which dilutes each existing shareholder's stake.",
  }],
  ["consistent earnings", {
    fields: [{ key: "net_income", label: "NET INCOME", fmt: "bn", hib: true, lowerIsBetter: false }],
    description: "Net profit after all expenses and taxes — should be positive and ideally growing each year.",
  }],
  ["intangibles", {
    fields: [{ key: "intangibles", label: "INTANGIBLES + GOODWILL", fmt: "bn", hib: false, lowerIsBetter: true }],
    description: "Goodwill and intangible assets — often reflects acquisition premiums; high intangibles relative to total assets can impair if the business deteriorates.",
  }],
  ["debt payoff", {
    fields: [
      { key: "total_debt", label: "TOTAL DEBT", fmt: "bn", hib: false, lowerIsBetter: true },
      { key: "net_income", label: "NET INCOME", fmt: "bn", hib: true,  lowerIsBetter: false },
    ],
    description: "How long it would take to pay off all debt using net income alone — under 4 years of earnings is considered healthy.",
  }],
  ["retained test", {
    fields: [
      { key: "total_equity",       label: "TOTAL EQUITY", fmt: "bn", hib: true, lowerIsBetter: false },
      { key: "market_cap_at_year", label: "MARKET CAP",   fmt: "bn", hib: true, lowerIsBetter: false },
    ],
    description: "Tests whether retained earnings have grown market value — market cap growth should exceed the amount retained.",
  }],
  ["roic", {
    fields: [{ key: "roic", label: "ROIC", fmt: "pct", hib: true, lowerIsBetter: false }],
    description: "Operating income after tax divided by invested capital (equity + debt − cash) — measures how efficiently the company generates returns on all capital employed.",
  }],
];

function findDetail(name: string): CheckDetail | null {
  const lower = name.toLowerCase();
  const entry = METRIC_DETAIL.find(([k]) => lower.includes(k));
  return entry ? entry[1] : null;
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function getVal(row: FundRow, field: MetricField): number | null {
  const v = row[field.key] as number | null;
  if (v == null) return null;
  return field.abs ? Math.abs(v) : v;
}

function fmtVal(v: number | null, fmt: MetricField["fmt"]): string {
  if (v == null) return "—";
  if (fmt === "pct") return `${(v * 100).toFixed(1)}%`;
  if (fmt === "x") return `${v.toFixed(1)}x`;
  if (fmt === "dollar") {
    const sign = v < 0 ? "-" : "";
    return `${sign}$${Math.abs(v).toFixed(2)}`;
  }
  if (fmt === "count") {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${(abs / 1e9).toFixed(2)}bn`;
    if (abs >= 1e6) return `${Math.round(abs / 1e6)}m`;
    return `${abs.toFixed(0)}`;
  }
  // bn
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 100e9) return `${sign}$${Math.round(abs / 1e9)}bn`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}bn`;
  if (abs >= 1e6) return `${sign}$${Math.round(abs / 1e6)}m`;
  return `${sign}$${abs.toFixed(0)}`;
}

function valColor(v: number | null, hib: boolean, neutral?: boolean): string {
  if (v == null) return "rgba(0,255,65,0.3)";
  if (neutral) return "rgba(0,255,65,0.6)";
  if (hib) return v >= 0 ? "#00ff41" : "#ef4444";
  return v <= 0 ? "#00ff41" : "#ef4444";
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ rows, field }: { rows: FundRow[]; field: MetricField }) {
  const vals = rows.map(r => getVal(r, field));
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length < 2) return null;

  const W = 80, H = 28;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;

  const points = vals
    .map((v, i) => {
      if (v == null) return null;
      const x = (i / (vals.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  if (!points) return null;

  const first = nums[0];
  const last = nums[nums.length - 1];
  const color = (field.lowerIsBetter ? last <= first : last >= first) ? "#00ff41" : "#ef4444";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", flexShrink: 0 }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.85"
      />
    </svg>
  );
}

// ── Verdict ──────────────────────────────────────────────────────────────────

function genVerdict(field: MetricField, rows: FundRow[]): string {
  const pairs = rows
    .map(r => { const v = getVal(r, field); return v != null ? { v, y: r.fiscal_year } : null; })
    .filter(Boolean) as { v: number; y: number }[];
  if (pairs.length < 2) return "";

  const first = pairs[0];
  const last = pairs[pairs.length - 1];
  const pct = first.v !== 0 ? Math.round(Math.abs((last.v - first.v) / Math.abs(first.v)) * 100) : 0;

  const prev = pairs[pairs.length - 2];
  if (prev.v <= 0 && last.v > 0)
    return `${sentenceCase(field.label)} turned positive in ${last.y} — a significant improvement.`;
  if (prev.v >= 0 && last.v < 0)
    return `${sentenceCase(field.label)} turned negative in ${last.y} — a trend worth monitoring.`;

  const improved = field.lowerIsBetter ? last.v < first.v : last.v > first.v;
  if (improved) {
    if (pct > 80) return `${sentenceCase(field.label)} has grown strongly since ${first.y} — positive trend.`;
    if (pct > 30) return `Up ${pct}% since ${first.y} — consistent improvement.`;
    if (pct === 0) return `Roughly flat since ${first.y} — no material change.`;
    return `Modestly improved since ${first.y} — moving in the right direction.`;
  } else {
    if (pct > 80) return `${sentenceCase(field.label)} has deteriorated significantly since ${first.y} — notable concern.`;
    if (pct > 30) return `Down ${pct}% since ${first.y} — declining trend to watch.`;
    if (pct === 0) return `Roughly flat since ${first.y} — no material change.`;
    return `Slightly worse since ${first.y} — monitor for continued deterioration.`;
  }
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ detail, rows }: { detail: CheckDetail; rows: FundRow[] }) {
  const primary = detail.fields[0];
  const verdict = genVerdict(primary, rows);

  return (
    <div
      className="mx-0 mt-1 mb-2 rounded px-3 py-3 space-y-3"
      style={{ background: "rgba(0,255,65,0.03)", border: "1px solid rgba(0,255,65,0.12)" }}
    >
      {/* Description */}
      <p className="text-[10px] italic leading-relaxed" style={{ color: "rgba(0,255,65,0.45)" }}>
        {detail.description}
      </p>

      {/* Per-field blocks: label above, then year columns */}
      <div className="space-y-3">
        {detail.fields.map(field => (
          <div key={field.key as string}>
            <p className="text-[9px] font-mono font-bold tracking-wider mb-1" style={{ color: "rgba(0,255,65,0.5)" }}>
              {field.label}
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {rows.map(r => (
                      <th key={r.fiscal_year} className="text-[9px] font-mono text-right" style={{ color: "rgba(0,255,65,0.3)", paddingBottom: 4, paddingLeft: 6 }}>
                        FY{String(r.fiscal_year).slice(2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {rows.map(r => {
                      const v = getVal(r, field);
                      return (
                        <td key={r.fiscal_year} className="text-[10px] font-mono text-right font-bold" style={{ color: valColor(v, field.hib, field.neutral), paddingBottom: 3, paddingLeft: 6 }}>
                          {fmtVal(v, field.fmt)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Sparkline + verdict */}
      <div className="flex items-center gap-3">
        <Sparkline rows={rows} field={primary} />
        {verdict && (
          <p className="text-[10px] leading-relaxed flex-1" style={{ color: "rgba(0,255,65,0.5)" }}>
            {verdict}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Existing explanation map (unchanged) ─────────────────────────────────────

const HEALTH_EXPLANATIONS: { key: string; pass: string; fail: string }[] = [
  { key: "cash/debt",           pass: "Holds more cash than debt — financially secure",                          fail: "Debt exceeds cash — vulnerable in a downturn" },
  { key: "debt/equity",         pass: "Low borrowing vs assets — low financial risk",                            fail: "Heavy borrowing vs assets — higher financial risk" },
  { key: "preferred stock",     pass: "No preferred shareholders ahead of you in the queue",                     fail: "Preferred shareholders get paid before you do" },
  { key: "retained earnings",   pass: "Savings growing year after year — compounding internally",                fail: "Savings shrinking — profits not being retained effectively" },
  { key: "active buybacks",     pass: "Buying back shares — your ownership slice grows",                         fail: "No buybacks — ownership not being returned to shareholders" },
  { key: "roe",                 pass: "Strong returns on shareholder money — a quality business",                fail: "Weak returns on shareholder money — money not being used efficiently" },
  { key: "rota",                pass: "Squeezes strong profit from every asset it owns",                         fail: "Assets not generating enough profit — inefficient operations" },
  { key: "gross margin",        pass: "Keeps a healthy chunk after costs — real pricing power",                  fail: "Thin margins after costs — limited pricing power" },
  { key: "sg&a",                pass: "Admin costs are lean — more profit reaches the bottom line",              fail: "High admin costs eating into gross profit" },
  { key: "r&d",                 pass: "Research spending is controlled — not burning cash on bets",              fail: "Heavy R&D spend — high risk, uncertain payoff" },
  { key: "interest",            pass: "Debt interest is small — not enslaved to lenders",                       fail: "Large chunk of earnings going to debt interest payments" },
  { key: "tax rate",            pass: "Pays fair taxes — clean straightforward accounting",                      fail: "Tax rate outside normal range — unusual, check the reason" },
  { key: "net margin",          pass: "Keeps 20+ cents of every dollar earned — highly profitable",              fail: "Keeps less than 20 cents per dollar — thin profitability" },
  { key: "eps growth",          pass: "Earnings per share growing — each share worth more over time",            fail: "Earnings per share shrinking — each share worth less" },
  { key: "sbc",                 pass: "Staff share pay is controlled — ownership not being diluted",             fail: "Excessive share-based pay quietly diluting your stake" },
  { key: "ocf",                 pass: "Profit backed by real cash — not accounting tricks",                      fail: "Profits may not be real cash — quality of earnings is low" },
  { key: "fcf growth",          pass: "Spendable cash growing consistently year after year",                     fail: "Spendable cash shrinking — less financial flexibility" },
  { key: "capex",               pass: "Doesn't need heavy investment to keep growing — capital light",           fail: "Needs heavy reinvestment just to maintain operations" },
  { key: "payout ratio",        pass: "Dividends and buybacks fully covered by real cash flow",                  fail: "Returning more cash than it generates — unsustainable" },
  { key: "consistent earnings", pass: "Profits show up reliably every year — predictable business",              fail: "Erratic earnings — dependent on unpredictable events" },
  { key: "dilution",            pass: "Share count stable — not printing shares that shrink your piece",         fail: "Share count growing — your ownership being diluted" },
  { key: "intangibles",         pass: "Value from real operations — not goodwill that can vanish",               fail: "High goodwill or intangibles — value could disappear if brand weakens" },
  { key: "debt payoff",         pass: "Could clear all debt within 4 years of profit",                          fail: "Would take over 4 years of total profit just to clear debt" },
  { key: "retained test",       pass: "Every dollar kept has grown the stock's market value",                    fail: "Retaining profits but failing to grow market value" },
];

function getCheckExplanation(name: string, pass: boolean): string {
  const lower = name.toLowerCase();
  const entry = HEALTH_EXPLANATIONS.find((e) => lower.includes(e.key));
  return entry ? (pass ? entry.pass : entry.fail) : "";
}

// ── Main component ───────────────────────────────────────────────────────────

type CatLevel = { data: boolean; why: boolean };

export default function HealthCategories({ cats, fundamentals }: { cats: HealthCat[]; fundamentals?: FundRow[] }) {
  const [catState, setCatState] = useState<Record<string, CatLevel>>(() =>
    Object.fromEntries(cats.map((c) => [c.label, { data: true, why: false }]))
  );
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  const toggleData = (label: string) =>
    setCatState((prev) => {
      const cur = prev[label] ?? { data: true, why: false };
      return { ...prev, [label]: { data: !cur.data, why: cur.data ? false : cur.why } };
    });

  const toggleWhy = (label: string) =>
    setCatState((prev) => {
      const cur = prev[label] ?? { data: true, why: false };
      return { ...prev, [label]: { data: true, why: !cur.why } };
    });

  const toggleRow = (key: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  return (
    <>
      {cats.map((cat, catIdx) => {
        const { data: dataOpen, why: whyOpen } = catState[cat.label] ?? { data: true, why: false };
        return (
          <div
            key={cat.label}
            style={catIdx < cats.length - 1 ? { borderBottom: "1px solid rgba(0,255,65,0.1)" } : {}}
          >
            {/* Category header */}
            <div className="px-5 pt-4 pb-2 flex items-center gap-3 select-none">
              <div className="flex-1 min-w-0 border-b border-[rgba(0,255,65,0.2)] pb-1">
                <p className="text-xs font-bold tracking-widest" style={{ color: "rgba(0,255,65,0.5)" }}>
                  {cat.label}
                </p>
                <p className="text-[10px]" style={{ color: "rgba(0,255,65,0.5)" }}>
                  {cat.checks.filter((c) => c.pass).length}/{cat.checks.filter((c) => !c.not_scored).length} checks passed
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* DATA button */}
                <button
                  className="text-[10px] font-mono px-2 py-0.5 rounded border"
                  style={dataOpen
                    ? { borderColor: "rgba(0,255,65,0.7)", color: "rgba(0,255,65,0.9)" }
                    : { borderColor: "rgba(0,255,65,0.25)", color: "rgba(0,255,65,0.4)" }}
                  onClick={() => toggleData(cat.label)}
                >
                  DATA
                </button>
                {/* WHY button — only visible when DATA is open */}
                {dataOpen && (
                  <button
                    className="text-[10px] font-mono px-2 py-0.5 rounded border"
                    style={whyOpen
                      ? { borderColor: "rgba(0,255,65,0.7)", color: "rgba(0,255,65,0.9)" }
                      : { borderColor: "rgba(0,255,65,0.25)", color: "rgba(0,255,65,0.4)" }}
                    onClick={() => toggleWhy(cat.label)}
                  >
                    INFO
                  </button>
                )}
              </div>
            </div>

            {/* Metric rows — visible when DATA is open */}
            {dataOpen && (
              <div className="px-5 pb-4 space-y-1">
                {cat.checks.length === 0 ? (
                  <p className="text-xs" style={{ color: "rgba(0,255,65,0.25)" }}>No data</p>
                ) : (
                  cat.checks.map((check, i) => {
                    const notScored = check.not_scored === true;
                    const explanation = notScored
                      ? "Not applicable for banks — excluded from health score"
                      : getCheckExplanation(check.name, check.pass);
                    const detail = !notScored && fundamentals?.length ? findDetail(check.name) : null;
                    const rowKey = `${catIdx}-${i}`;
                    const isOpen = openRows.has(rowKey);

                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between gap-3 py-0.5">
                          <span className="text-xs flex-1 min-w-0 leading-relaxed" style={{ color: "rgba(0,255,65,0.65)" }}>
                            {check.name}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs font-mono" style={{ color: "rgba(0,255,65,0.25)" }}>
                              {notScored ? "—" : `${check.years_passed}/5 yrs`}
                            </span>
                            {notScored ? (
                              <span
                                className="inline-block text-center text-[10px] rounded"
                                style={{ padding: "2px 8px", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.3)" }}
                              >
                                NOT SCORED
                              </span>
                            ) : (
                              <span
                                className="inline-block text-center text-xs font-bold tracking-widest rounded"
                                style={{
                                  minWidth: 44,
                                  padding: "2px 8px",
                                  ...(check.pass
                                    ? { background: "rgba(0,255,65,0.12)", color: "#00ff41", border: "1px solid rgba(0,255,65,0.4)" }
                                    : { background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.35)" }),
                                }}
                              >
                                {check.pass ? "PASS" : "FAIL"}
                              </span>
                            )}
                            {detail && (
                              <button
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors"
                                style={isOpen
                                  ? { borderColor: "rgba(0,255,65,0.7)", color: "rgba(0,255,65,0.9)" }
                                  : { borderColor: "rgba(0,255,65,0.25)", color: "rgba(0,255,65,0.35)" }}
                                onClick={() => toggleRow(rowKey)}
                              >
                                {isOpen ? "▴" : "▾"}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* WHY level — explanation text */}
                        {whyOpen && explanation && (
                          <p
                            className="text-[10px] italic"
                            style={{
                              color: notScored
                                ? "rgba(255,255,255,0.25)"
                                : check.pass ? "rgba(0,255,65,0.5)" : "rgba(255,80,80,0.6)",
                            }}
                          >
                            {explanation}
                          </p>
                        )}

                        {/* Detail panel — smooth slide */}
                        {detail && (
                          <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 200ms ease-in-out" }}>
                            <div style={{ overflow: "hidden", minHeight: 0 }}>
                              <DetailPanel detail={detail} rows={fundamentals!} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
