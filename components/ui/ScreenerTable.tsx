"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export type ScreenerRow = {
  ticker: string;
  name: string | null;
  ppm_cagr: number | null;
  ppm_blended_price: number | null;
  current_price: number | null;
  growth_score: number | null;
  health_passes: number | null;
  signal: string | null;
  updated_at: string | null;
};

function SignalBadge({ signal }: { signal: string | null }) {
  const s = (signal ?? "").toUpperCase();
  const styles: Record<string, string> = {
    BUY:  "bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/60",
    HOLD: "bg-yellow-400/10 text-yellow-300 border border-yellow-400/50",
    SELL: "bg-red-500/10 text-red-400 border border-red-500/50",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold tracking-widest ${styles[s] ?? "bg-gray-800 text-gray-400 border border-gray-600"}`}>
      {s || "—"}
    </span>
  );
}

function GrowthStarsCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-600">—</span>;
  const filled = value >= 80 ? 5 : value >= 60 ? 4 : value >= 40 ? 3 : value >= 20 ? 2 : 1;
  const color = filled >= 4 ? "#00ff41" : filled === 3 ? "#fbbf24" : "#f87171";
  return (
    <span className="font-mono">
      <span style={{ color }}>{"★".repeat(filled)}</span>
      <span style={{ color: "rgba(0,255,65,0.2)" }}>{"☆".repeat(5 - filled)}</span>
    </span>
  );
}

function HealthPassesCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-600">—</span>;
  const color = value >= 18 ? "text-[#00ff41]" : value >= 12 ? "text-yellow-300" : "text-red-400";
  return <span className={`font-mono font-bold ${color}`}>{value}/24</span>;
}

function CagrCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-600">—</span>;
  const color = value >= 0.2 ? "text-[#00ff41]" : value >= 0.1 ? "text-yellow-300" : "text-red-400";
  return <span className={`font-mono font-bold ${color}`}>{(value * 100).toFixed(1)}%</span>;
}

function ReturnCell({ blended, current }: { blended: number | null; current: number | null }) {
  if (!blended || !current) return <span className="text-gray-600">—</span>;
  const mult = blended / current;
  const color = mult >= 2 ? "text-[#00ff41]" : mult >= 1.5 ? "text-yellow-300" : "text-red-400";
  return <span className={`font-mono font-bold ${color}`}>{mult.toFixed(1)}x</span>;
}

function stockSummary(stock: ScreenerRow, rank: number): string {
  const ret = (stock.ppm_blended_price && stock.current_price)
    ? `${(stock.ppm_blended_price / stock.current_price).toFixed(1)}x`
    : "—";
  const cagr = stock.ppm_cagr !== null
    ? `${(stock.ppm_cagr * 100).toFixed(1)}%`
    : "—";
  const health = stock.health_passes !== null ? `${stock.health_passes}/24` : "—";
  const g = stock.growth_score;
  const filled = g === null ? 0 : g >= 80 ? 5 : g >= 60 ? 4 : g >= 40 ? 3 : g >= 20 ? 2 : 1;
  const stars = g === null ? "—" : "★".repeat(filled) + "☆".repeat(5 - filled);
  return `${stock.ticker} is ranked #${rank} — projected ${ret} return over 5 years at ${cagr} CAGR, ${stars} growth quality, with ${health} financial health metrics passed.`;
}

export default function ScreenerTable({
  visibleStocks,
  lockedStocks,
  hasSession,
}: {
  visibleStocks: ScreenerRow[];
  lockedStocks: ScreenerRow[];
  hasSession: boolean;
}) {
  // 0 = compact, 1 = compact + summaries, 2 = summaries + GROWTH/HEALTH columns
  const [detailLevel, setDetailLevel] = useState(0);
  const router = useRouter();

  const showSummaries = detailLevel >= 1;
  const showQuality   = detailLevel >= 2;

  // Total column count for summary row colSpan (includes spacer for [+])
  const totalCols = showQuality ? 9 : 7;

  const btnLabel    = detailLevel === 0 ? "+" : detailLevel === 1 ? "++" : "−";
  const btnAriaLabel = detailLevel === 0
    ? "Show summaries"
    : detailLevel === 1
    ? "Show quality columns"
    : "Reset view";

  // bg-[#001200] keeps sticky cells opaque so data doesn't bleed through on scroll
  const stickyThTint = "sticky top-0 z-10 bg-[#001a00]/40"; // tinted: 5Y RETURN + VERDICT
  const stickyThBase = "sticky top-0 z-10 bg-[#001200]";    // no tint: QUALITY
  const stickyTd    = "sticky left-0 z-[5] bg-[#000]";

  return (
    // overflow-y:clip avoids creating a scroll container so sticky th works against the viewport
    <div className="overflow-x-auto [overflow-y:clip]">
      <table className="w-full text-sm border-collapse">
        <thead>
          {/* Group label row — [+] spans both header rows via rowSpan */}
          <tr className="bg-[#001200]">
            <th rowSpan={2} className="border-0 sticky left-0 z-20 bg-[#001200] w-14 px-2 py-3 text-left text-xs font-bold tracking-widest text-[#00ff41]/70">TICKER</th>
            <th rowSpan={2} className="border-0 hidden md:table-cell bg-[#001200] px-2 py-3 text-left text-xs font-bold tracking-widest text-[#00ff41]/70">COMPANY</th>
            <th colSpan={2} className="border-0 bg-[#001a00]/40 px-2 py-0.5 text-center text-xs font-bold tracking-widest text-[#00ff41]/60">5Y RETURN</th>
            {showQuality && (
              <th colSpan={2} className="border-0 bg-[#001200] px-2 py-0.5 text-center text-[9px] font-bold tracking-[0.3em] text-[#00ff41]/30">QUALITY</th>
            )}
            <th colSpan={2} className="border-0 bg-[#001a00]/40 px-2 py-0.5 text-center text-xs font-bold tracking-widest text-[#00ff41]/60">VERDICT</th>
            <th rowSpan={2} className="border-0 sticky top-0 right-0 z-30 bg-[#001200] px-2 py-3 text-center align-middle">
              <button
                onClick={() => setDetailLevel((l) => (l + 1) % 3)}
                className="text-[#00ff41]/40 hover:text-[#00ff41] border border-[#00ff41]/25 rounded px-1.5 py-0.5 font-mono text-xs transition-colors leading-none"
                aria-label={btnAriaLabel}
              >
                {btnLabel}
              </button>
            </th>
          </tr>

          {/* Main column header row — sticky */}
          <tr className="border-b border-[#00ff41]/60 bg-[#001200]">
            <th className={`px-1 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThTint}`}>CAGR</th>
            <th className={`px-1 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThTint}`}>RETURN</th>
            {showQuality && <th className={`px-1 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThBase}`}>GROWTH</th>}
            {showQuality && <th className={`px-1 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThBase}`}>HEALTH</th>}
            <th className={`px-1 py-3 text-center text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThTint}`}>SIGNAL</th>
            <th className={`px-1 py-3 text-center text-[10px] font-bold tracking-widest text-[#00ff41]/70 ${stickyThTint}`}>RANK</th>
          </tr>
        </thead>

        <tbody>
          {visibleStocks.map((stock, i) => (
            <React.Fragment key={stock.ticker}>
              <tr
                onClick={() => router.push(`/screener/${stock.ticker}`)}
                className={`cursor-pointer border-t border-[#00ff41]/10 transition-colors hover:bg-[#00ff41]/5 ${
                  i % 2 === 1 ? "bg-[#00ff41]/[0.02]" : ""
                }`}
              >
                <td className={`px-2 py-3 ${stickyTd}`}>
                  <span className="font-mono font-bold text-[#00ff41] tracking-wider underline decoration-[#00ff41]">
                    {stock.ticker}
                  </span>
                </td>
                <td className="hidden md:table-cell px-2 py-3 text-left">
                  <span className="block max-w-[10rem] truncate text-[#00ff41]/50 text-xs">
                    {stock.name ?? ""}
                  </span>
                </td>
                <td className="px-1 py-3 text-right bg-[#001a00]/40">
                  <CagrCell value={stock.ppm_cagr} />
                </td>
                <td className="px-1 py-3 text-right bg-[#001a00]/40">
                  <ReturnCell blended={stock.ppm_blended_price} current={stock.current_price} />
                </td>
                {showQuality && (
                  <td className="px-1 py-3 text-right">
                    <GrowthStarsCell value={stock.growth_score} />
                  </td>
                )}
                {showQuality && (
                  <td className="px-1 py-3 text-right">
                    <HealthPassesCell value={stock.health_passes} />
                  </td>
                )}
                <td className="px-1 py-3 text-center bg-[#001a00]/40">
                  <span className="inline-flex items-center gap-1.5">
                    <SignalBadge signal={stock.signal} />
                    <span className="font-mono text-[#00ff41]/40 text-xs">→</span>
                  </span>
                </td>
                <td className="px-1 py-3 text-center bg-[#001a00]/40">
                  <span className="text-[#00ff41]/40 font-mono text-[10px]">#{i + 1}</span>
                </td>
                <td className="px-1" />
              </tr>

              {showSummaries && (
                <tr>
                  <td colSpan={totalCols} className="px-2 pb-2.5 pt-0">
                    <span className="text-[10px] italic text-[#00ff41]/30 font-mono leading-snug">
                      {stockSummary(stock, i + 1)}
                    </span>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}

          {/* Locked rows: blurred content + CTA overlay */}
          {lockedStocks.length > 0 && (
            <tr className="border-t border-[#00ff41]/10">
              {/* colSpan=9 covers max columns: TICKER, COMPANY, CAGR, RETURN, GROWTH, HEALTH, SIGNAL, RANK, spacer */}
              <td colSpan={9} className="p-0">
                <div className="relative">
                  <table className="w-full text-sm border-collapse blur-sm select-none pointer-events-none opacity-60">
                    <tbody>
                      {lockedStocks.map((stock, i) => (
                        <tr
                          key={stock.ticker}
                          className={`border-t border-[#00ff41]/10 ${i % 2 === 1 ? "bg-[#00ff41]/[0.02]" : ""}`}
                        >
                          <td className="px-2 py-3">
                            <span className="font-mono font-bold text-[#00ff41] tracking-wider">{stock.ticker}</span>
                          </td>
                          <td className="hidden md:table-cell px-2 py-3">
                            <span className="block max-w-[10rem] truncate text-[#00ff41]/50 text-xs">
                              {stock.name ?? ""}
                            </span>
                          </td>
                          <td className="px-1 py-3 text-right bg-[#001a00]/40">
                            <CagrCell value={stock.ppm_cagr} />
                          </td>
                          <td className="px-1 py-3 text-right bg-[#001a00]/40">
                            <ReturnCell blended={stock.ppm_blended_price} current={stock.current_price} />
                          </td>
                          {showQuality && (
                            <td className="px-1 py-3 text-right">
                              <GrowthStarsCell value={stock.growth_score} />
                            </td>
                          )}
                          {showQuality && (
                            <td className="px-1 py-3 text-right">
                              <HealthPassesCell value={stock.health_passes} />
                            </td>
                          )}
                          <td className="px-1 py-3 text-center bg-[#001a00]/40">
                            <span className="inline-flex items-center gap-1.5">
                              <SignalBadge signal={stock.signal} />
                              <span className="font-mono text-[#00ff41]/40 text-xs">→</span>
                            </span>
                          </td>
                          <td className="px-1 py-3 text-center bg-[#001a00]/40">
                            <span className="text-[#00ff41]/40 font-mono text-[10px]">#{visibleStocks.length + i + 1}</span>
                          </td>
                          <td className="px-1" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <a
                      href="/pricing"
                      className="text-[#00ff41] font-bold tracking-widest text-sm hover:text-[#00ff41]/70 transition-colors"
                    >
                      Unlock all stocks — Upgrade to Pro →
                    </a>
                    {!hasSession && (
                      <span className="ml-4 text-xs text-[#00ff41]/30">
                        <a href="/login" className="text-[#00ff41]/50 hover:text-[#00ff41] underline">Sign in</a>
                      </span>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
