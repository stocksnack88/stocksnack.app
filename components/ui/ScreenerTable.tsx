"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import HazardTooltip from "@/components/ui/HazardTooltip";

const EXTENSION_MS = 15 * 60 * 1000

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
  hasSession,
  isPro,
  trialStartedAt = null,
  trialUsed = true,
  trialExtensionStartedAt = null,
}: {
  visibleStocks: ScreenerRow[];
  hasSession: boolean;
  isPro: boolean;
  trialStartedAt?: string | null;
  trialUsed?: boolean;
  trialExtensionStartedAt?: string | null;
}) {
  const [detailLevel,  setDetailLevel]  = useState(0);
  const [showFilters,  setShowFilters]  = useState(false);
  const [showProGate,    setShowProGate]    = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [filters,      setFilters]      = useState<FilterRow[]>([]);
  const [nextId,       setNextId]       = useState(0);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [soundOn, setSoundOn] = useState(() => {
    try {
      if (typeof window === 'undefined') return true;
      const stored = localStorage.getItem('ss_sound');
      return stored === null ? true : stored === '1';
    } catch {
      return true;
    }
  });

  function playChime() {
    if (!soundOn) return;
    try {
      const AudioCtx = (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!;
      const ctx = new AudioCtx();
      const notes = [1046, 1568];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        const start = ctx.currentTime + i * 0.07;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.1, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
        osc.start(start);
        osc.stop(start + 0.12);
      });
    } catch {}
  }

  function playTickerClick() {
    if (!soundOn) return;
    try {
      const AudioCtx = (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!;
      const ctx = new AudioCtx();
      const bufferSize = ctx.sampleRate * 0.04;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 8);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1800;
      filter.Q.value = 0.8;
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseGain.gain.setValueAtTime(0.4, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      noise.start(ctx.currentTime);
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.03);
      oscGain.gain.setValueAtTime(0.2, ctx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.03);
    } catch {}
  }

  const router = useRouter();

  const showSummaries = detailLevel >= 1;
  const showQuality   = detailLevel >= 2;
  const totalCols     = showQuality ? 9 : 7;
  const btnLabel      = detailLevel === 0 ? "+" : detailLevel === 1 ? "++" : "−";
  const btnAriaLabel  = detailLevel === 0 ? "Show summaries" : detailLevel === 1 ? "Show quality columns" : "Reset view";

  const stickyTd = "sticky left-0 z-[5] bg-[#000]";

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
      // Filters always start empty on fresh page load — only restore search text
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.searchText === "string") setSearchQuery(saved.searchText);
    } catch {
      // corrupted storage — start fresh
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        searchText: searchQuery,
        filterRows: filters,
      }));
    } catch {
      // storage unavailable — ignore
    }
  }, [searchQuery, filters]);

  useEffect(() => {
    localStorage.setItem('ss_sound', soundOn ? '1' : '0');
  }, [soundOn]);


  useEffect(() => {
    // UPSELL TOAST — show only when: logged-in, not pro, trial_used=true,
    // extension was taken (trialExtensionStartedAt set), and extension has expired.
    if (isPro) return;                                          // never show to pro users
    if (!trialUsed) return;                                     // never show before trial is used
    if (!trialExtensionStartedAt) return;                       // never show when extension banner is showing (no extension yet)
    // Client-side expiry check — avoids relying on the server-rendered trialStartedAt
    // prop which is stale once extension expires mid-session.
    const extensionElapsed = Date.now() - new Date(trialExtensionStartedAt).getTime();
    if (extensionElapsed < EXTENSION_MS) return;                // extension still active: never show
    // Reaches here: trial used, extension taken and expired → show upsell
    let timer: ReturnType<typeof setTimeout>;
    function startTimer() {
      timer = setTimeout(() => setShowUpsellModal(true), 60000);
    }
    function onOnboardingDismissed() {
      window.removeEventListener('onboarding-dismissed', onOnboardingDismissed);
      startTimer();
    }
    if (localStorage.getItem('ss_onboarding_seen') === '1') {
      startTimer();
    } else {
      window.addEventListener('onboarding-dismissed', onOnboardingDismissed);
    }
    return () => {
      clearTimeout(timer);
      window.removeEventListener('onboarding-dismissed', onOnboardingDismissed);
    };
  }, [isPro, trialUsed, trialExtensionStartedAt]);

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
            onClick={() => {
              if (!isPro) { setShowProGate(true); return; }
              setShowFilters(v => !v);
              playChime();
            }}
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
            onClick={() => setSoundOn(v => !v)}
            className="p-2 border border-[#00ff41]/30 text-[#00ff41]/50 hover:border-[#00ff41] hover:text-[#00ff41] rounded transition-colors"
            title={soundOn ? "Mute sounds" : "Enable sounds"}
          >
            {soundOn ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
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

      {/* Upsell toast — fixed bottom-right (desktop) / bottom-center (mobile), non-blocking */}
      {showUpsellModal && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 md:left-auto md:right-4 md:translate-x-0 z-[100] w-[calc(100vw-2rem)] max-w-[320px]">
          <div className="relative bg-[#050505] border border-[#00ff41]/20 rounded-xl px-5 py-4 flex flex-col gap-3 shadow-lg shadow-black/60">
            <button
              onClick={() => setShowUpsellModal(false)}
              className="absolute top-3 right-3 text-[#00ff41]/30 hover:text-[#00ff41] font-mono text-xs leading-none transition-colors"
              aria-label="Dismiss"
            >
              ✕
            </button>
            <div className="flex flex-col gap-1 pr-4">
              <p className="text-[10px] font-mono font-bold text-[#00ff41] tracking-[0.2em]">
                YOU&apos;VE SEEN TODAY&apos;S FREE PICKS
              </p>
              <p className="text-xs font-mono text-[#00ff41]/50 leading-relaxed">
                Unlock all 500 stocks with Pro.
              </p>
            </div>
            <a
              href="/pricing"
              className="bg-[#00ff41] text-black font-bold font-mono text-xs tracking-widest px-4 py-2 rounded hover:bg-[#00dd38] transition-colors text-center"
            >
              UPGRADE TO PRO →
            </a>
            {!hasSession && (
              <p className="text-[10px] font-mono text-[#00ff41]/25 text-center">
                Already have an account?{" "}
                <a href="/login" className="text-[#00ff41]/50 hover:text-[#00ff41] underline">Sign in</a>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Pro gate modal — shown when a free/logged-out user clicks the filter button */}
      {showProGate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4">
          <div className="bg-[#050505] border border-[#00ff41]/20 rounded-xl w-full max-w-sm px-8 py-8 flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-mono text-[#00ff41]/40 tracking-[0.15em]">STOCKSNACK PRO</p>
              <p className="text-base font-mono text-[#00ff41] leading-snug">
                Filters are a Pro feature.<br />Upgrade to unlock.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              <a
                href="/pricing"
                className="w-full text-center bg-[#00ff41] text-black font-bold font-mono text-xs tracking-widest py-2.5 rounded hover:bg-[#00dd38] transition-colors"
              >
                UPGRADE →
              </a>
              <button
                onClick={() => setShowProGate(false)}
                className="w-full text-center text-[#00ff41]/30 hover:text-[#00ff41]/60 font-mono text-xs tracking-widest py-2 transition-colors"
              >
                MAYBE LATER
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Table — overflow-y:clip keeps sticky th working against viewport */}
      <div className="relative">
        <div className="scanline-overlay" />
        <div className="scanline-beam" />
      <div className="overflow-x-auto [overflow-y:clip]">
        <table className="w-full text-sm border-collapse">
          <thead>
            {/* Group label row — [+] spans both header rows via rowSpan */}
            <tr className="bg-[#001200]">
              <th rowSpan={2} className="border-0 sticky left-0 z-20 bg-[#001200] w-14 px-2 py-3 text-left text-xs font-bold tracking-widest text-[#00ff41]/70">TICKER</th>
              <th rowSpan={2} className="border-0 hidden md:table-cell bg-[#001200] px-2 py-3 text-left text-xs font-bold tracking-widest text-[#00ff41]/70">COMPANY</th>
              <th colSpan={2} className="border-0 bg-[#001a00]/40 px-2 py-0.5 text-center text-xs font-bold tracking-widest text-[#00ff41]/60">5Y PROJECTED</th>
              {showQuality && (
                <th colSpan={2} className="border-0 bg-[#001200] px-2 py-0.5 text-center text-[9px] font-bold tracking-[0.3em] text-[#00ff41]/30">QUALITY</th>
              )}
              <th colSpan={2} className="border-0 bg-[#001a00]/40 px-2 py-0.5 text-center text-xs font-bold tracking-widest text-[#00ff41]/60">VERDICT</th>
              <th rowSpan={2} className="border-0 bg-[#001200] px-2 py-3 text-center align-middle">
                <button
                  onClick={() => { setDetailLevel(l => (l + 1) % 3); playChime(); }}
                  className="text-[#00ff41]/40 hover:text-[#00ff41] border border-[#00ff41]/25 rounded px-1.5 py-0.5 font-mono text-xs transition-colors leading-none"
                  aria-label={btnAriaLabel}
                >
                  {btnLabel}
                </button>
              </th>
            </tr>

            {/* Main column header row — sticky */}
            <tr className="border-b border-[#00ff41]/60 bg-[#001200]">
              <th className="px-1 py-3 text-center text-xs font-bold tracking-widest text-[#00ff41]/70 bg-[#001a00]/40">CAGR</th>
              <th className="px-1 py-3 text-center text-xs font-bold tracking-widest text-[#00ff41]/70 bg-[#001a00]/40">RETURN</th>
              {showQuality && <th className="px-1 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 bg-[#001200]">GROWTH</th>}
              {showQuality && <th className="px-1 py-3 text-right text-xs font-bold tracking-widest text-[#00ff41]/70 bg-[#001200]">HEALTH</th>}
              <th className="px-1 py-3 text-center text-xs font-bold tracking-widest text-[#00ff41]/70 bg-[#001a00]/40">SIGNAL</th>
              <th className="px-1 py-3 text-center text-[10px] font-bold tracking-widest text-[#00ff41]/70 bg-[#001a00]/40">RANK</th>
            </tr>
          </thead>

          <tbody>
            {processedStocks.map((stock, i) => (
              <React.Fragment key={stock.ticker}>
                <tr
                  onClick={() => { playTickerClick(); router.push(`/screener/${stock.ticker}`); }}
                  className={`screener-row cursor-pointer border-t border-[#00ff41]/10 transition-colors hover:bg-[#00ff41]/5 ${
                    i % 2 === 1 ? "bg-[#00ff41]/[0.02]" : ""
                  }`}
                  style={{ animation: `fadeInUp 200ms ease-out ${Math.min(i, 25) * 30}ms both` }}
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

            {processedStocks.length === 0 && !!searchQuery.trim() && !isPro && !trialStartedAt && (
              <tr>
                <td colSpan={totalCols} className="px-4 py-10 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-mono tracking-widest">
                        <span className="text-[#00ff41]">{searchQuery.trim().toUpperCase()}</span>
                        <span className="text-[#00ff41]/50"> is not in today&apos;s free picks.</span>
                      </p>
                      <p className="text-xs font-mono text-[#00ff41]/35 tracking-widest">
                        Upgrade to Pro to search all 500 stocks.
                      </p>
                    </div>
                    <a
                      href="/pricing"
                      className="bg-[#00ff41] text-black font-bold font-mono text-xs tracking-widest px-4 py-2 rounded hover:bg-[#00dd38] transition-colors"
                    >
                      UPGRADE TO PRO →
                    </a>
                  </div>
                </td>
              </tr>
            )}

            {processedStocks.length === 0 && !!searchQuery.trim() && (isPro || !!trialStartedAt) && (
              <tr>
                <td colSpan={totalCols} className="px-4 py-10 text-center">
                  <span className="text-xs font-mono text-[#00ff41]/25 tracking-widest">
                    NO RESULTS FOUND
                  </span>
                </td>
              </tr>
            )}

            {processedStocks.length === 0 && !searchQuery.trim() && filters.length > 0 && (
              <tr>
                <td colSpan={totalCols} className="px-4 py-10 text-center">
                  <span className="text-xs font-mono text-[#00ff41]/25 tracking-widest">
                    NO STOCKS MATCH YOUR FILTERS
                  </span>
                </td>
              </tr>
            )}

            {/* Locked rows: fake placeholder rows — no real data sent to browser */}
            {!isPro && !trialStartedAt && (
              <tr className="border-t border-[#00ff41]/10">
                {/* colSpan=9 covers max columns: TICKER, COMPANY, CAGR, RETURN, GROWTH, HEALTH, SIGNAL, RANK, spacer */}
                <td colSpan={9} className="p-0">
                  <div className="min-h-[280px]">
                    <table className="w-full text-sm border-collapse blur-sm select-none pointer-events-none opacity-60">
                      <tbody>
                        {Array.from({ length: 10 }, (_, i) => (
                          <tr
                            key={i}
                            className={`border-t border-[#00ff41]/10 ${i % 2 === 1 ? "bg-[#00ff41]/[0.02]" : ""}`}
                          >
                            <td className="px-2 py-3">
                              <span className="font-mono font-bold text-[#00ff41] tracking-wider">████</span>
                            </td>
                            <td className="hidden md:table-cell px-2 py-3">
                              <span className="block max-w-[10rem] truncate text-[#00ff41]/50 text-xs">████████████</span>
                            </td>
                            <td className="px-1 py-3 text-right bg-[#001a00]/40">
                              <span className="font-mono font-bold text-[#00ff41]">██.█%</span>
                            </td>
                            <td className="px-1 py-3 text-right bg-[#001a00]/40">
                              <span className="font-mono font-bold text-[#00ff41]">█.█x</span>
                            </td>
                            {showQuality && (
                              <td className="px-1 py-3 text-right">
                                <span className="font-mono text-[#00ff41]">█████</span>
                              </td>
                            )}
                            {showQuality && (
                              <td className="px-1 py-3 text-right">
                                <span className="font-mono text-[#00ff41]">██/24</span>
                              </td>
                            )}
                            <td className="px-1 py-3 text-center bg-[#001a00]/40">
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-bold tracking-widest bg-gray-800 text-gray-400 border border-gray-600">████</span>
                            </td>
                            <td className="px-1 py-3 text-center bg-[#001a00]/40">
                              <span className="text-[#00ff41]/40 font-mono text-[10px]">#██</span>
                            </td>
                            <td className="px-1" />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

    </div>
  );
}
