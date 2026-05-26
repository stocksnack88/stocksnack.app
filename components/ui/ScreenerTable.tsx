"use client";

import React, { useState, useMemo, useEffect } from "react";
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
const SIGNAL_OPTS     = ["BUY+", "BUY", "HOLD", "SELL"] as const;

const STORAGE_KEY = "stocksnack_screener_filters";

const CONDITION_PILLS: Record<ColumnKey, { cond: ConditionKey; label: string }[]> = {
  signal:  [],
  cagr:    [{ cond: "gte", label: "≥" }, { cond: "lte", label: "≤" }, { cond: "desc", label: "↑ HIGH→LOW" }, { cond: "asc", label: "↓ LOW→HIGH" }],
  return:  [{ cond: "gte", label: "≥" }, { cond: "lte", label: "≤" }, { cond: "desc", label: "↑ HIGH→LOW" }, { cond: "asc", label: "↓ LOW→HIGH" }],
  growth:  [{ cond: "gte", label: "≥" }, { cond: "lte", label: "≤" }, { cond: "desc", label: "↑ HIGH→LOW" }, { cond: "asc", label: "↓ LOW→HIGH" }],
  health:  [{ cond: "gte", label: "≥" }, { cond: "lte", label: "≤" }, { cond: "desc", label: "↑ HIGH→LOW" }, { cond: "asc", label: "↓ LOW→HIGH" }],
  ticker:  [{ cond: "asc", label: "A→Z" }, { cond: "desc", label: "Z→A" }],
  company: [{ cond: "asc", label: "A→Z" }, { cond: "desc", label: "Z→A" }],
  hazard:  [{ cond: "show_only", label: "SHOW ONLY" }, { cond: "exclude", label: "EXCLUDE" }],
};


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
  const [searchQuery,  setSearchQuery]  = useState("");
  const [headerFrozen, setHeaderFrozen] = useState(true);
  const router = useRouter();

  const showSummaries = detailLevel >= 1;
  const showQuality   = detailLevel >= 2;
  const totalCols     = showQuality ? 9 : 7;
  const btnLabel      = detailLevel === 0 ? "+" : detailLevel === 1 ? "++" : "−";
  const btnAriaLabel  = detailLevel === 0 ? "Show summaries" : detailLevel === 1 ? "Show quality columns" : "Reset view";

  const stickyThTint = headerFrozen ? "sticky top-16 z-10 bg-[#001a00]/40" : "bg-[#001a00]/40";
  const stickyThBase = headerFrozen ? "sticky top-16 z-10 bg-[#001200]"    : "bg-[#001200]";
  const stickyTd     = "sticky left-0 z-[5] bg-[#000]";

  const processedStocks = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    const searched = q
      ? visibleStocks.filter(s =>
          s.ticker.toUpperCase().startsWith(q) ||
          (s.name ?? "").toUpperCase().includes(q)
        )
      : visibleStocks;
    return applyFilters(searched, filters);
  }, [visibleStocks, filters, searchQuery]);
  const activeCount = filters.length;

  // ── localStorage persistence ───────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.searchText === "string")    setSearchQuery(saved.searchText);
      if (typeof saved.isHeaderFrozen === "boolean") setHeaderFrozen(saved.isHeaderFrozen);
      if (Array.isArray(saved.filterRows) && saved.filterRows.length > 0) {
        setFilters(saved.filterRows);
        setNextId(Math.max(...saved.filterRows.map((f: FilterRow) => f.id)) + 1);
      }
    } catch {
      // corrupted storage — start fresh
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        searchText:     searchQuery,
        filterRows:     filters,
        isHeaderFrozen: headerFrozen,
      }));
    } catch {
      // storage unavailable — ignore
    }
  }, [searchQuery, filters, headerFrozen]);

  function clearAllFilters() {
    setFilters([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

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
        {/* Search — left */}
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="SEARCH TICKER OR COMPANY..."
            className="w-full bg-black border border-[#00ff41]/20 text-[#00ff41] text-xs rounded px-2.5 py-1 font-mono placeholder-[#00ff41]/20 focus:outline-none focus:border-[#00ff41]/50 pr-6"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#00ff41]/30 hover:text-[#00ff41] text-xs font-mono leading-none"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter controls — right */}
        <div className="flex items-center gap-3 ml-auto">
          {(activeCount > 0 || searchQuery) && (
            <span className="text-[10px] font-mono text-[#00ff41]/25 tracking-wider">
              {processedStocks.length} / {visibleStocks.length} shown
            </span>
          )}

          {activeCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-xs font-mono text-[#00ff41]/30 hover:text-red-400 transition-colors tracking-wider"
            >
              CLEAR ALL
            </button>
          )}

          <button
            onClick={() => setShowFilters(v => !v)}
            className={`relative p-2 border rounded transition-colors ${
              activeCount > 0
                ? "border-[#00ff41] text-[#00ff41]"
                : "border-[#00ff41]/30 text-[#00ff41]/50 hover:border-[#00ff41] hover:text-[#00ff41]"
            }`}
            title="Filter & Sort"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              <line x1="18" y1="9" x2="24" y2="9"/>
              <line x1="17" y1="13" x2="23" y2="13"/>
              <line x1="16" y1="17" x2="22" y2="17"/>
            </svg>
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#00ff41] text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setHeaderFrozen(v => !v)}
            className="p-2 border border-[#00ff41]/30 text-[#00ff41]/50 hover:border-[#00ff41] hover:text-[#00ff41] rounded transition-colors"
            title={headerFrozen ? "Unfreeze header" : "Freeze header"}
          >
            {headerFrozen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-4 border border-[#00ff41]/20 rounded p-3 bg-[#00ff41]/[0.015] space-y-2">
          {filters.length === 0 && (
            <p className="text-[10px] font-mono text-[#00ff41]/25 tracking-wider py-1">
              No conditions — click + ADD FILTER
            </p>
          )}

          {filters.map(filter => (
            <div key={filter.id} className="flex flex-wrap items-center gap-1.5">
              {/* Column dropdown */}
              <select
                value={filter.column}
                onChange={e => handleColumnChange(filter.id, e.target.value as ColumnKey)}
                className={selectCls}
              >
                {COLUMNS.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>

              {/* Condition pills — for all columns except SIGNAL */}
              {filter.column !== "signal" && CONDITION_PILLS[filter.column].map(({ cond, label }) => (
                <button
                  key={cond}
                  type="button"
                  onClick={() => handleConditionChange(filter.id, cond)}
                  className={`px-2 py-1 text-xs font-mono rounded transition-colors leading-none ${
                    filter.condition === cond
                      ? "bg-[#00ff41] text-black font-bold"
                      : "text-[#00ff41]/40 border border-[#00ff41]/20 hover:text-[#00ff41]/70 hover:border-[#00ff41]/40"
                  }`}
                >
                  {label}
                </button>
              ))}

              {/* SIGNAL pills — multi-select */}
              {filter.column === "signal" && SIGNAL_OPTS.map(sig => (
                <button
                  key={sig}
                  type="button"
                  onClick={() => handleSignalToggle(filter.id, sig)}
                  className={`px-2 py-1 text-xs font-mono rounded transition-colors leading-none ${
                    filter.signals.includes(sig)
                      ? "bg-[#00ff41] text-black font-bold"
                      : "text-[#00ff41]/40 border border-[#00ff41]/20 hover:text-[#00ff41]/70 hover:border-[#00ff41]/40"
                  }`}
                >
                  {sig}
                </button>
              ))}

              {/* Numeric value input */}
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
          ))}

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
                onClick={clearAllFilters}
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
              <th rowSpan={2} className={`border-0 ${headerFrozen ? "sticky top-0 right-0 z-30" : ""} bg-[#001200] px-2 py-3 text-center align-middle`}>
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
