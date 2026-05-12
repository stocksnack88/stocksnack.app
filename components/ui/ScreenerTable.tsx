"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import InfoTooltip from "@/components/ui/InfoTooltip";

export type ScreenerRow = {
  ticker: string;
  name: string | null;
  ppm_cagr: number | null;
  ppm_blended_price: number | null;
  current_price: number | null;
  ppm_score: number | null;
  growth_score: number | null;
  health_score: number | null;
  final_score: number | null;
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

function ScoreCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-600">—</span>;
  const color = value >= 70 ? "text-[#00ff41]" : value >= 45 ? "text-yellow-300" : "text-red-400";
  return <span className={`font-mono font-bold ${color}`}>{value.toFixed(1)}</span>;
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

export default function ScreenerTable({
  visibleStocks,
  lockedStocks,
  hasSession,
}: {
  visibleStocks: ScreenerRow[];
  lockedStocks: ScreenerRow[];
  hasSession: boolean;
}) {
  const [insightsOpen, setInsightsOpen] = useState(false);
  const router = useRouter();

  const stickyThBD = "sticky top-0 z-10 bg-[#001a00]/40"; // 5Y RETURN + VERDICT groups
  const stickyThC  = "sticky top-0 z-10 bg-[#001200]/60"; // SCORES group
  const stickyTd = "sticky left-0 z-[5] bg-[#000]";
  const ins = insightsOpen ? "" : "hidden";

  return (
    // overflow-y:clip avoids creating a scroll container so sticky th works against the viewport
    <div className="overflow-x-auto [overflow-y:clip]">
      <table className="w-full text-sm border-collapse">
        <thead>
          {/* Group label row — always visible */}
          <tr className="bg-[#001200]">
            {/* TICKER — spans both header rows */}
            <th rowSpan={2} className="sticky left-0 z-20 bg-[#001200] px-3 py-3 text-left text-xs font-bold tracking-widest text-[#00ff41]/70">TICKER</th>
            {/* COMPANY — desktop only, spans both header rows */}
            <th rowSpan={2} className="hidden md:table-cell bg-[#001200] px-3 py-3 text-left text-xs font-bold tracking-widest text-[#00ff41]/70">COMPANY</th>
            {/* 5Y RETURN spans CAGR + RETURN */}
            <th
              colSpan={2}
              className="bg-[#001a00]/40 px-2 py-1 text-center text-[9px] font-bold tracking-[0.3em] text-[#00ff41]/30"
            >
              5Y RETURN
            </th>
            {/* SCORES spans VALUE, GROWTH, HEALTH, OVERALL — only when open */}
            {insightsOpen && (
              <th
                colSpan={4}
                className="bg-[#001200]/60 px-2 py-1 text-center text-[9px] font-bold tracking-[0.3em] text-[#00ff41]/30"
              >
                <span className="inline-flex items-center">
                  SCORES (0–100)
                  <InfoTooltip>
                    <div className="flex flex-col gap-2 text-[11px] tracking-widest">
                      <div className="flex items-center gap-2">
                        <span className="text-[#00ff41]">■</span>
                        <span className="text-[#00ff41]">≥70 STRONG</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-300">■</span>
                        <span className="text-yellow-300">45–69 MODERATE</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-400">■</span>
                        <span className="text-red-400">&lt;45 WEAK</span>
                      </div>
                    </div>
                  </InfoTooltip>
                </span>
              </th>
            )}
            {/* VERDICT spans SIGNAL + RANK */}
            <th
              colSpan={2}
              className="bg-[#001a00]/40 px-2 py-1 text-center text-[9px] font-bold tracking-[0.3em] text-[#00ff41]/30"
            >
              VERDICT
            </th>
            {/* [+] column — no group label */}
            <th className="sticky right-0 z-20 bg-[#001200] px-2 py-1" />
          </tr>

          {/* Main column header row — sticky */}
          <tr className="border-b border-[#00ff41]/60 bg-[#001200]">
            <th className={`px-2 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThBD}`}>CAGR</th>
            <th className={`px-2 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThBD}`}>RETURN</th>
            <th className={`px-2 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThC} ${ins}`}>VALUE</th>
            <th className={`px-2 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThC} ${ins}`}>GROWTH</th>
            <th className={`px-2 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThC} ${ins}`}>HEALTH</th>
            <th className={`px-2 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThC} ${ins}`}>OVERALL</th>
            <th className={`px-2 py-3 text-center text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThBD}`}>SIGNAL</th>
            <th className={`px-2 py-3 text-center text-xs font-bold tracking-widest text-[#00ff41]/70 ${stickyThBD}`}>RANK</th>
            <th className="sticky top-0 right-0 z-30 bg-[#001200] px-2 py-3 text-center">
              <button
                onClick={() => setInsightsOpen((o) => !o)}
                className="text-[#00ff41]/40 hover:text-[#00ff41] border border-[#00ff41]/25 rounded px-1.5 py-0.5 font-mono text-xs transition-colors leading-none"
                aria-label={insightsOpen ? "Hide score columns" : "Show score columns"}
              >
                {insightsOpen ? "−" : "+"}
              </button>
            </th>
          </tr>
        </thead>

        <tbody>
          {visibleStocks.map((stock, i) => (
            <tr
              key={stock.ticker}
              onClick={() => router.push(`/screener/${stock.ticker}`)}
              className={`cursor-pointer border-t border-[#00ff41]/10 transition-colors hover:bg-[#00ff41]/5 ${
                i % 2 === 1 ? "bg-[#00ff41]/[0.02]" : ""
              }`}
            >
              <td className={`px-3 py-3 ${stickyTd}`}>
                <span className="font-mono font-bold text-[#00ff41] tracking-wider">{stock.ticker}</span>
              </td>
              {/* COMPANY — desktop only, truncated at ~20 chars */}
              <td className="hidden md:table-cell px-3 py-3 text-left">
                <span className="block max-w-[10rem] truncate text-[#00ff41]/50 text-xs">
                  {stock.name ?? ""}
                </span>
              </td>
              <td className="px-2 py-3 text-right bg-[#001a00]/40">
                <CagrCell value={stock.ppm_cagr} />
              </td>
              <td className="px-2 py-3 text-right bg-[#001a00]/40">
                <ReturnCell blended={stock.ppm_blended_price} current={stock.current_price} />
              </td>
              <td className={`px-2 py-3 text-right bg-[#003300]/30 ${ins}`}>
                <ScoreCell value={stock.ppm_score} />
              </td>
              <td className={`px-2 py-3 text-right bg-[#003300]/30 ${ins}`}>
                <ScoreCell value={stock.growth_score} />
              </td>
              <td className={`px-2 py-3 text-right bg-[#003300]/30 ${ins}`}>
                <ScoreCell value={stock.health_score} />
              </td>
              <td className={`px-2 py-3 text-right bg-[#003300]/30 ${ins}`}>
                <ScoreCell value={stock.final_score} />
              </td>
              <td className="px-2 py-3 text-center bg-[#001a00]/20">
                <SignalBadge signal={stock.signal} />
              </td>
              <td className="px-2 py-3 text-center bg-[#001a00]/20">
                <span className="text-[#00ff41]/40 font-mono text-xs">#{i + 1}</span>
              </td>
              <td className="px-2 py-3" />
            </tr>
          ))}

          {/* Locked rows: blurred content + CTA overlay */}
          {lockedStocks.length > 0 && (
            <tr className="border-t border-[#00ff41]/10">
              {/* colSpan=11 covers max columns (desktop+insights open); browser clamps to available */}
              <td colSpan={11} className="p-0">
                <div className="relative">
                  <table className="w-full text-sm border-collapse blur-sm select-none pointer-events-none opacity-60">
                    <tbody>
                      {lockedStocks.map((stock, i) => (
                        <tr
                          key={stock.ticker}
                          className={`border-t border-[#00ff41]/10 ${i % 2 === 1 ? "bg-[#00ff41]/[0.02]" : ""}`}
                        >
                          <td className="px-3 py-3">
                            <span className="font-mono font-bold text-[#00ff41] tracking-wider">{stock.ticker}</span>
                          </td>
                          <td className="hidden md:table-cell px-3 py-3">
                            <span className="block max-w-[10rem] truncate text-[#00ff41]/50 text-xs">
                              {stock.name ?? ""}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-right bg-[#001a00]/40">
                            <CagrCell value={stock.ppm_cagr} />
                          </td>
                          <td className="px-2 py-3 text-right bg-[#001a00]/40">
                            <ReturnCell blended={stock.ppm_blended_price} current={stock.current_price} />
                          </td>
                          {insightsOpen && (
                            <>
                              <td className="px-2 py-3 text-right bg-[#003300]/30"><ScoreCell value={stock.ppm_score} /></td>
                              <td className="px-2 py-3 text-right bg-[#003300]/30"><ScoreCell value={stock.growth_score} /></td>
                              <td className="px-2 py-3 text-right bg-[#003300]/30"><ScoreCell value={stock.health_score} /></td>
                              <td className="px-2 py-3 text-right bg-[#003300]/30"><ScoreCell value={stock.final_score} /></td>
                            </>
                          )}
                          <td className="px-2 py-3 text-center bg-[#001a00]/20"><SignalBadge signal={stock.signal} /></td>
                          <td className="px-2 py-3 text-center bg-[#001a00]/20">
                            <span className="text-[#00ff41]/40 font-mono text-xs">#{visibleStocks.length + i + 1}</span>
                          </td>
                          <td className="px-2 py-3" />
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
