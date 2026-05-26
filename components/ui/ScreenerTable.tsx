"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import HazardTooltip from "@/components/ui/HazardTooltip";

// ── ScreenerRow type ──────────────────────────────────────────────────────────

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
  has_anomaly: boolean | null;
  anomaly_reasons: string | null;
};

// ── Filter types & config ─────────────────────────────────────────────────────

type ColumnKey   = "signal" | "cagr" | "return" | "growth" | "health" | "ticker" | "company" | "hazard";
type ConditionKey = "is" | "gte" | "lte" | "asc" | "desc" | "show_only" | "exclude";

type FilterRow = {
  id: number;
  column: ColumnKey;
  condition: ConditionKey;
  value: string;
  signals: string[];
};

const COLUMNS: { key: ColumnKey; label: string; conditions: ConditionKey[] }[] = [
  { key: "signal",  label: "SIGNAL",  conditions: ["is"] },
  { key: "cagr",    label: "CAGR",    conditions: ["gte", "lte", "desc", "asc"] },
  { key: "return",  label: "RETURN",  conditions: ["gte", "lte", "desc", "asc"] },
  { key: "growth",  label: "GROWTH",  conditions: ["gte", "lte", "desc", "asc"] },
  { key: "health",  label: "HEALTH",  conditions: ["gte", "lte", "desc", "asc"] },
  { key: "ticker",  label: "TICKER",  conditions: ["asc", "desc"] },
  { key: "company", label: "COMPANY", conditions: ["asc", "desc"] },
  { key: "hazard",  label: "HAZARD",  conditions: ["show_only", "exclude"] },
];

const SORT_CONDITIONS = new Set<ConditionKey>(["asc", "desc"]);
const TEXT_SORT_COLS  = new Set<ColumnKey>(["ticker", "company"]);
const SIGNAL_OPTS     = ["BUY+", "BUY", "HOLD", "SELL"] as const;

function condLabel(col: ColumnKey, cond: ConditionKey): string {
  if (cond === "asc")       return TEXT_SORT_COLS.has(col) ? "A → Z"       : "small → large";
  if (cond === "desc")      return TEXT_SORT_COLS.has(col) ? "Z → A"       : "large → small";
  if (cond === "gte")       return "≥";
  if (cond === "lte")       return "≤";
  if (cond === "is")        return "is";
  if (cond === "show_only") return "show only";
  if (cond === "exclude")   return "exclude";
  return cond;
}

function needsValue(f: FilterRow): boolean {
  return (
    (f.column === "cagr" || f.column === "return" || f.column === "growth" || f.column === "health") &&
    !SORT_CONDITIONS.has(f.condition)
  );
}

function valuePlaceholder(col: ColumnKey): string {
  if (col === "cagr")   return "% e.g. 15";
  if (col === "return") return "e.g. 2";
  if (col === "growth") return "0–100";
  if (col === "health") return "0–24";
  return "";
}

// ── Filter application (pure function, called via useMemo) ───────────────────

function applyFilters(stocks: ScreenerRow[], filters: FilterRow[]): ScreenerRow[] {
  const sortFilter  = filters.find(f => SORT_CONDITIONS.has(f.condition));
  const condFilters = filters.filter(f => !SORT_CONDITIONS.has(f.condition));

  let result = stocks.filter(stock =>
    condFilters.every(f => {
      switch (f.column) {
        case "signal": {
          if (!f.signals.length) return true;
          return f.signals.includes((stock.signal ?? "").toUpperCase());
        }
        case "cagr": {
          const v = parseFloat(f.value);
          if (isNaN(v)) return true;
          const cagr = (stock.ppm_cagr ?? 0) * 100;
          return f.condition === "gte" ? cagr >= v : cagr <= v;
        }
        case "return": {
          const v = parseFloat(f.value);
          if (isNaN(v)) return true;
          const ret = stock.ppm_blended_price && stock.current_price
            ? stock.ppm_blended_price / stock.current_price : 0;
          return f.condition === "gte" ? ret >= v : ret <= v;
        }
        case "growth": {
          const v = parseFloat(f.value);
          if (isNaN(v)) return true;
          return f.condition === "gte"
            ? (stock.growth_score ?? 0) >= v
            : (stock.growth_score ?? 0) <= v;
        }
        case "health": {
          const v = parseFloat(f.value);
          if (isNaN(v)) return true;
          return f.condition === "gte"
            ? (stock.health_passes ?? 0) >= v
            : (stock.health_passes ?? 0) <= v;
        }
        case "hazard":
          return f.condition === "show_only" ? !!stock.has_anomaly : !stock.has_anomaly;
        default:
          return true;
      }
    })
  );

  if (sortFilter) {
    const dir = sortFilter.condition === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      switch (sortFilter.column) {
        case "cagr":
          return ((a.ppm_cagr ?? -Infinity) - (b.ppm_cagr ?? -Infinity)) * dir;
        case "return": {
          const ra = a.ppm_blended_price && a.current_price ? a.ppm_blended_price / a.current_price : 0;
          const rb = b.ppm_blended_price && b.current_price ? b.ppm_blended_price / b.current_price : 0;
          return (ra - rb) * dir;
        }
        case "growth":
          return ((a.growth_score  ?? -Infinity) - (b.growth_score  ?? -Infinity)) * dir;
        case "health":
          return ((a.health_passes ?? -Infinity) - (b.health_passes ?? -Infinity)) * dir;
        case "ticker":
          return a.ticker.localeCompare(b.ticker) * dir;
        case "company":
          return (a.name ?? "").localeCompare(b.name ?? "") * dir;
        default:
          return 0;
      }
    });
  }

  return result;
}

// ── Sub-components (unchanged) ────────────────────────────────────────────────

function SignalBadge({ signal }: { signal: string | null }) {
  const s = (signal ?? "").toUpperCase();
  const styles: Record<string, string> = {
    "BUY+": "bg-[#00ff41]/30 text-[#00ff41] border border-[#00ff41]/80",
    BUY:    "bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/60",
    HOLD:   "bg-yellow-400/10 text-yellow-300 border border-yellow-400/50",
    SELL:   "bg-red-500/10 text-red-400 border border-red-500/50",
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
  const color  = filled >= 4 ? "#00ff41" : filled === 3 ? "#fbbf24" : "#f87171";
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
  const mult  = blended / current;
  const color = mult >= 2 ? "text-[#00ff41]" : mult >= 1.5 ? "text-yellow-300" : "text-red-400";
  return <span className={`font-mono font-bold ${color}`}>{mult.toFixed(1)}x</span>;
}

function stockSummary(stock: ScreenerRow, rank: number): string {
  const ret    = (stock.ppm_blended_price && stock.current_price)
    ? `${(stock.ppm_blended_price / stock.current_price).toFixed(1)}x` : "—";
  const cagr   = stock.ppm_cagr !== null ? `${(stock.ppm_cagr * 100).toFixed(1)}%` : "—";
  const health = stock.health_passes !== null ? `${stock.health_passes}/24` : "—";
  const g      = stock.growth_score;
  const filled = g === null ? 0 : g >= 80 ? 5 : g >= 60 ? 4 : g >= 40 ? 3 : g >= 20 ? 2 : 1;
  const stars  = g === null ? "—" : "★".repeat(filled) + "☆".repeat(5 - filled);
  return `${stock.ticker} is ranked #${rank} — projected ${ret} return over 5 years at ${cagr} CAGR, ${stars} growth quality, with ${health} financial health metrics passed.`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ScreenerTable({
  visibleStocks,
  lockedStocks,
  hasSession,
}: {
  visibleStocks: ScreenerRow[];
  lockedStocks: ScreenerRow[];
  hasSession: boolean;
}) {
  const [detailLevel,  setDetailLevel]  = useState(0);
  const [showFilters,  setShowFilters]  = useState(false);
  const [filters,      setFilters]      = useState<FilterRow[]>([]);
  const [nextId,       setNextId]       = useState(0);
  const router = useRouter();

  const showSummaries = detailLevel >= 1;
  const showQuality   = detailLevel >= 2;
  const totalCols     = showQuality ? 9 : 7;
  const btnLabel      = detailLevel === 0 ? "+" : detailLevel === 1 ? "++" : "−";
  const btnAriaLabel  = detailLevel === 0 ? "Show summaries" : detailLevel === 1 ? "Show quality columns" : "Reset view";

  const stickyThTint = "sticky top-0 z-10 bg-[#001a00]/40";
  const stickyThBase = "sticky top-0 z-10 bg-[#001200]";
  const stickyTd     = "sticky left-0 z-[5] bg-[#000]";

  const processedStocks = useMemo(() => applyFilters(visibleStocks, filters), [visibleStocks, filters]);
  const activeCount     = filters.length;

  // ── Filter handlers ────────────────────────────────────────────────────────

  function addFilter() {
    const col = COLUMNS[0];
    setFilters(prev => [...prev, { id: nextId, column: col.key, condition: col.conditions[0], value: "", signals: [] }]);
    setNextId(n => n + 1);
    setShowFilters(true);
  }

  function removeFilter(id: number) {
    setFilters(prev => prev.filter(f => f.id !== id));
  }

  function handleColumnChange(id: number, newCol: ColumnKey) {
    const colConfig     = COLUMNS.find(c => c.key === newCol)!;
    const defaultCond   = colConfig.conditions[0];
    setFilters(prev => {
      let updated = prev.map(f =>
        f.id === id ? { ...f, column: newCol, condition: defaultCond, value: "", signals: [] } : f
      );
      if (SORT_CONDITIONS.has(defaultCond)) {
        updated = updated.filter(f => f.id === id || !SORT_CONDITIONS.has(f.condition));
      }
      return updated;
    });
  }

  function handleConditionChange(id: number, newCond: ConditionKey) {
    setFilters(prev => {
      let updated = prev.map(f =>
        f.id === id ? { ...f, condition: newCond, value: "", signals: [] } : f
      );
      if (SORT_CONDITIONS.has(newCond)) {
        updated = updated.filter(f => f.id === id || !SORT_CONDITIONS.has(f.condition));
      }
      return updated;
    });
  }

  function handleValueChange(id: number, value: string) {
    setFilters(prev => prev.map(f => f.id === id ? { ...f, value } : f));
  }

  function handleSignalToggle(id: number, signal: string) {
    setFilters(prev => prev.map(f => {
      if (f.id !== id) return f;
      const sigs = f.signals.includes(signal)
        ? f.signals.filter(s => s !== signal)
        : [...f.signals, signal];
      return { ...f, signals: sigs };
    }));
  }

  // ── Select / input shared styles ───────────────────────────────────────────

  const selectCls = "bg-black border border-[#00ff41]/20 text-[#00ff41] text-xs rounded px-1.5 py-1 font-mono focus:outline-none focus:border-[#00ff41]/50 cursor-pointer";
  const inputCls  = "w-24 bg-black border border-[#00ff41]/20 text-[#00ff41] text-xs rounded px-1.5 py-1 font-mono placeholder-[#00ff41]/20 focus:outline-none focus:border-[#00ff41]/50";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`text-xs font-mono tracking-widest border rounded px-2.5 py-1 transition-colors ${
            activeCount > 0
              ? "border-[#00ff41]/60 text-[#00ff41] bg-[#00ff41]/10"
              : "border-[#00ff41]/25 text-[#00ff41]/40 hover:text-[#00ff41] hover:border-[#00ff41]/50"
          }`}
        >
          FILTER{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>

        {activeCount > 0 && (
          <button
            onClick={() => setFilters([])}
            className="text-xs font-mono text-[#00ff41]/30 hover:text-red-400 transition-colors tracking-wider"
          >
            CLEAR ALL
          </button>
        )}

        {activeCount > 0 && (
          <span className="text-[10px] font-mono text-[#00ff41]/25 ml-auto tracking-wider">
            {processedStocks.length} / {visibleStocks.length} shown
          </span>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-4 border border-[#00ff41]/20 rounded p-3 bg-[#00ff41]/[0.015] space-y-2">
          {filters.length === 0 && (
            <p className="text-[10px] font-mono text-[#00ff41]/25 tracking-wider py-1">
              No conditions — click + ADD FILTER
            </p>
          )}

          {filters.map(filter => {
            const colConfig = COLUMNS.find(c => c.key === filter.column)!;
            return (
              <div key={filter.id} className="flex flex-wrap items-center gap-2">
                {/* Column */}
                <select
                  value={filter.column}
                  onChange={e => handleColumnChange(filter.id, e.target.value as ColumnKey)}
                  className={selectCls}
                >
                  {COLUMNS.map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>

                {/* Condition */}
                <select
                  value={filter.condition}
                  onChange={e => handleConditionChange(filter.id, e.target.value as ConditionKey)}
                  className={selectCls}
                >
                  {colConfig.conditions.map(cond => (
                    <option key={cond} value={cond}>{condLabel(filter.column, cond)}</option>
                  ))}
                </select>

                {/* SIGNAL checkboxes */}
                {filter.column === "signal" && (
                  <div className="flex items-center gap-2.5">
                    {SIGNAL_OPTS.map(sig => (
                      <label key={sig} className="flex items-center gap-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={filter.signals.includes(sig)}
                          onChange={() => handleSignalToggle(filter.id, sig)}
                          className="accent-[#00ff41] w-3 h-3"
                        />
                        <span className="text-[10px] font-mono text-[#00ff41]/60">{sig}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Numeric value */}
                {needsValue(filter) && (
                  <input
                    type="number"
                    value={filter.value}
                    onChange={e => handleValueChange(filter.id, e.target.value)}
                    placeholder={valuePlaceholder(filter.column)}
                    className={inputCls}
                  />
                )}

                {/* Delete row */}
                <button
                  onClick={() => removeFilter(filter.id)}
                  aria-label="Remove filter"
                  className="text-[#00ff41]/25 hover:text-red-400 text-xs font-mono transition-colors ml-1"
                >
                  ✕
                </button>
              </div>
            );
          })}

          {/* Panel footer */}
          <div className="flex items-center gap-4 pt-1.5 border-t border-[#00ff41]/10">
            <button
              onClick={addFilter}
              className="text-xs font-mono text-[#00ff41]/50 hover:text-[#00ff41] transition-colors tracking-wider"
            >
              + ADD FILTER
            </button>
            {filters.length > 0 && (
              <button
                onClick={() => setFilters([])}
                className="text-xs font-mono text-[#00ff41]/25 hover:text-red-400 transition-colors tracking-wider"
              >
                CLEAR ALL
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table — overflow-y:clip keeps sticky th working against viewport */}
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
                  onClick={() => setDetailLevel(l => (l + 1) % 3)}
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
            {processedStocks.map((stock, i) => (
              <React.Fragment key={stock.ticker}>
                <tr
                  onClick={() => router.push(`/screener/${stock.ticker}`)}
                  className={`cursor-pointer border-t border-[#00ff41]/10 transition-colors hover:bg-[#00ff41]/5 ${
                    i % 2 === 1 ? "bg-[#00ff41]/[0.02]" : ""
                  }`}
                >
                  <td className={`px-2 py-3 ${stickyTd}`}>
                    <span className="inline-flex items-center gap-1">
                      <span className="font-mono font-bold text-[#00ff41] tracking-wider underline decoration-[#00ff41]">
                        {stock.ticker}
                      </span>
                      {stock.has_anomaly && (
                        <HazardTooltip
                          reasons={(stock.anomaly_reasons ?? "").split(", ").filter(Boolean)}
                        />
                      )}
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

            {processedStocks.length === 0 && filters.length > 0 && (
              <tr>
                <td colSpan={totalCols} className="px-4 py-10 text-center">
                  <span className="text-xs font-mono text-[#00ff41]/25 tracking-widest">
                    NO STOCKS MATCH YOUR FILTERS
                  </span>
                </td>
              </tr>
            )}

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
    </div>
  );
}
