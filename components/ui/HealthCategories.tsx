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

type CatLevel = { data: boolean; why: boolean };

export default function HealthCategories({ cats }: { cats: HealthCat[] }) {
  const [catState, setCatState] = useState<Record<string, CatLevel>>(() =>
    Object.fromEntries(cats.map((c) => [c.label, { data: true, why: false }]))
  );

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
              <p
                className="text-xs font-bold tracking-widest border-b border-[rgba(0,255,65,0.2)] pb-1 flex-1 min-w-0"
                style={{ color: "rgba(0,255,65,0.5)" }}
              >
                {cat.label} — {cat.checks.filter((c) => c.pass).length}/{cat.checks.filter((c) => !c.not_scored).length} PASS
              </p>
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
                    WHY
                  </button>
                )}
              </div>
            </div>

            {/* Metric rows — visible when DATA is open */}
            {dataOpen && (
              <div className="px-5 pb-4 space-y-2">
                {cat.checks.length === 0 ? (
                  <p className="text-xs" style={{ color: "rgba(0,255,65,0.25)" }}>No data</p>
                ) : (
                  cat.checks.map((check, i) => {
                    const notScored = check.not_scored === true;
                    const explanation = notScored
                      ? "Not applicable for banks — excluded from health score"
                      : getCheckExplanation(check.name, check.pass);
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs flex-1 min-w-0 leading-relaxed" style={{ color: "rgba(0,255,65,0.65)" }}>
                            {check.name}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
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
