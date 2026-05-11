"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import UpgradeButton from "./UpgradeButton";

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
};

const D = "border-r border-dashed border-[#00ff41]/20";

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

function LockedRow({ ticker, rank }: { ticker: string; rank: number }) {
  return (
    <tr className="border-t border-[#00ff41]/10 blur-[3px] select-none pointer-events-none">
      <td className={`px-4 py-3 ${D}`}>
        <span className="font-mono font-bold text-[#00ff41]/40">{ticker}</span>
        <span className="block text-gray-700 text-[10px]">████████████</span>
      </td>
      <td className="px-4 py-3 text-right text-gray-600">████</td>
      <td className={`px-4 py-3 text-right text-gray-600 hidden md:table-cell ${D}`}>██████</td>
      <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">██</td>
      <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">██</td>
      <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">██</td>
      <td className={`px-4 py-3 text-right text-gray-600 hidden md:table-cell ${D}`}>██</td>
      <td className={`px-4 py-3 text-center ${D}`}>
        <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-600 border border-gray-700">████</span>
      </td>
      <td className="px-4 py-3 text-center text-[#00ff41]/20 font-mono text-xs">#{rank}</td>
    </tr>
  );
}

export default function ScreenerTable({
  visibleStocks,
  lockedStocks,
  freeLimit,
  hasSession,
}: {
  visibleStocks: ScreenerRow[];
  lockedStocks: ScreenerRow[];
  freeLimit: number;
  hasSession: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const router = useRouter();

  function toggle(ticker: string, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });
  }

  const totalStocks = visibleStocks.length + lockedStocks.length;

  return (
    <div className="relative overflow-x-auto rounded border border-[#00ff41]/20">
      <table className="w-full md:min-w-[800px] text-sm border-collapse">
        <thead>
          {/* Top group-label row — desktop only */}
          <tr className="hidden md:table-row border-b border-[#00ff41]/10 bg-[#00ff41]/[0.03]">
            <th className={`px-4 py-1.5 ${D}`} />
            <th colSpan={2} className={`px-4 py-1.5 text-center text-[10px] font-bold tracking-widest text-[#00ff41]/35 ${D}`}>
              EST. 5Y RETURN
            </th>
            <th colSpan={4} className={`px-4 py-1.5 text-center text-[10px] font-bold tracking-widest text-[#00ff41]/35 ${D}`}>
              SCORES (0–100)
            </th>
            <th className={`px-4 py-1.5 ${D}`} />
            <th className="px-4 py-1.5" />
          </tr>
          {/* Column-name row */}
          <tr className="border-b border-[#00ff41]/30 bg-[#00ff41]/5">
            <th className={`px-4 py-3 text-left   text-xs font-bold tracking-widest text-[#00ff41]/70 ${D}`}>TICKER</th>
            <th className="px-4 py-3 text-right  text-xs font-bold tracking-widest text-[#00ff41]/70">5Y RETURN</th>
            <th className={`px-4 py-3 text-right  text-xs font-bold tracking-widest text-[#00ff41]/70 hidden md:table-cell ${D}`}>CAGR</th>
            <th className="px-4 py-3 text-right  text-xs font-bold tracking-widest text-[#00ff41]/70 hidden md:table-cell">VALUE</th>
            <th className="px-4 py-3 text-right  text-xs font-bold tracking-widest text-[#00ff41]/70 hidden md:table-cell">GROWTH</th>
            <th className="px-4 py-3 text-right  text-xs font-bold tracking-widest text-[#00ff41]/70 hidden md:table-cell">HEALTH</th>
            <th className={`px-4 py-3 text-right  text-xs font-bold tracking-widest text-[#00ff41]/70 hidden md:table-cell ${D}`}>OVERALL</th>
            <th className={`px-4 py-3 text-center text-xs font-bold tracking-widest text-[#00ff41]/70 ${D}`}>SIGNAL</th>
            <th className="px-4 py-3 text-center text-xs font-bold tracking-widest text-[#00ff41]/70">RANK</th>
          </tr>
        </thead>
        <tbody>
          {visibleStocks.map((stock, i) => {
            const rank = i + 1;
            const isExpanded = expanded.has(stock.ticker);
            return (
              <React.Fragment key={stock.ticker}>
                <tr
                  onClick={() => router.push(`/screener/${stock.ticker}`)}
                  className={`cursor-pointer border-t border-[#00ff41]/10 transition-colors hover:bg-[#00ff41]/5 ${
                    i % 2 === 1 ? "bg-[#00ff41]/[0.02]" : ""
                  }`}
                >
                  {/* TICKER + company name + mobile expand button */}
                  <td className={`px-4 py-3 ${D}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-[#00ff41] tracking-wider">{stock.ticker}</span>
                        {stock.name && (
                          <span className="block text-[#00ff41]/40 text-[10px] italic font-normal">{stock.name}</span>
                        )}
                      </div>
                      <button
                        onClick={(e) => toggle(stock.ticker, e)}
                        className="md:hidden shrink-0 text-[#00ff41]/50 hover:text-[#00ff41] text-xs border border-[#00ff41]/20 rounded px-1.5 py-0.5 transition-colors leading-none"
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? "−" : "+"}
                      </button>
                    </div>
                  </td>
                  {/* 5Y RETURN — visible on mobile */}
                  <td className="px-4 py-3 text-right">
                    <ReturnCell blended={stock.ppm_blended_price} current={stock.current_price} />
                  </td>
                  {/* CAGR — hidden on mobile */}
                  <td className={`px-4 py-3 text-right hidden md:table-cell ${D}`}>
                    <CagrCell value={stock.ppm_cagr} />
                  </td>
                  {/* VALUE — hidden on mobile */}
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <ScoreCell value={stock.ppm_score} />
                  </td>
                  {/* GROWTH — hidden on mobile */}
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <ScoreCell value={stock.growth_score} />
                  </td>
                  {/* HEALTH — hidden on mobile */}
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <ScoreCell value={stock.health_score} />
                  </td>
                  {/* OVERALL — hidden on mobile */}
                  <td className={`px-4 py-3 text-right hidden md:table-cell ${D}`}>
                    <ScoreCell value={stock.final_score} />
                  </td>
                  {/* SIGNAL — visible on mobile */}
                  <td className={`px-4 py-3 text-center ${D}`}>
                    <SignalBadge signal={stock.signal} />
                  </td>
                  {/* RANK — visible on mobile */}
                  <td className="px-4 py-3 text-center">
                    <span className="text-[#00ff41]/40 font-mono text-xs">#{rank}</span>
                  </td>
                </tr>

                {/* Mobile expanded detail row */}
                {isExpanded && (
                  <tr className="md:hidden border-t border-[#00ff41]/10">
                    <td colSpan={9} className="px-4 py-3 bg-[#00ff41]/[0.03]">
                      <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-xs">
                        {[
                          { label: "CAGR",    node: <CagrCell value={stock.ppm_cagr} /> },
                          { label: "VALUE",   node: <ScoreCell value={stock.ppm_score} /> },
                          { label: "GROWTH",  node: <ScoreCell value={stock.growth_score} /> },
                          { label: "HEALTH",  node: <ScoreCell value={stock.health_score} /> },
                          { label: "OVERALL", node: <ScoreCell value={stock.final_score} /> },
                        ].map(({ label, node }) => (
                          <div key={label}>
                            <div className="text-[#00ff41]/35 tracking-widest text-[10px] mb-1">{label}</div>
                            {node}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}

          {lockedStocks.map((stock, i) => (
            <LockedRow key={stock.ticker} ticker={stock.ticker} rank={freeLimit + i + 1} />
          ))}
        </tbody>
      </table>

      {/* Paywall overlay */}
      {lockedStocks.length > 0 && (
        <div className="relative">
          <div className="absolute inset-x-0 -top-32 h-32 bg-gradient-to-b from-transparent to-black/80 pointer-events-none" />
          <div className="border-t border-[#00ff41]/20 bg-black px-6 py-8 text-center">
            <p className="text-[#00ff41] font-bold tracking-widest text-sm mb-1">
              {lockedStocks.length} MORE STOCKS LOCKED
            </p>
            <p className="text-[#00ff41]/50 text-xs mb-5 tracking-wide">
              Upgrade to Pro to unlock all {totalStocks} stocks with full scoring data
            </p>
            <UpgradeButton />
            {!hasSession && (
              <p className="mt-3 text-xs text-[#00ff41]/30">
                Already have an account?{" "}
                <a href="/login" className="text-[#00ff41]/60 hover:text-[#00ff41] underline">Sign in</a>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
