"use client";
import { useState } from "react";

type Seg = { name: string; pct: number; cagr: number | null; value: number };

function fmtCagr(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n * 100);
  const decimals = abs < 10 ? 1 : 0;
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(decimals)}%`;
}

export default function SegmentBreakdown({
  title,
  segs,
  borderedBottom,
}: {
  title: string;
  segs: Seg[];
  borderedBottom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="px-5 py-4"
      style={{ borderBottom: borderedBottom ? "1px solid rgba(0,255,65,0.1)" : undefined }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>
          {title}
        </p>
        <button
          className="text-[10px] font-mono border border-[rgba(0,255,65,0.3)] text-[rgba(0,255,65,0.6)] px-1.5 py-0.5 rounded hover:border-[rgba(0,255,65,0.6)]"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "−" : "+"}
        </button>
      </div>
      {open && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex-1 text-[9px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}>SEGMENT</span>
            <span className="text-[9px] tracking-widest w-16 text-right shrink-0" style={{ color: "rgba(0,255,65,0.3)" }}>SHARE</span>
            <span className="text-[9px] tracking-widest w-16 text-right shrink-0" style={{ color: "rgba(0,255,65,0.3)" }}>CAGR</span>
          </div>
          <div className="space-y-3">
            {segs.map((seg) => (
              <div key={seg.name}>
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-xs flex-1 min-w-0" style={{ color: "rgba(0,255,65,0.7)" }}>
                    {seg.name}
                  </span>
                  <span className="text-xs font-mono w-16 text-right shrink-0" style={{ color: "#00ff41" }}>
                    {seg.pct.toFixed(1)}%
                  </span>
                  <span
                    className="text-xs font-mono w-16 text-right shrink-0"
                    style={{ color: seg.cagr == null ? "#666" : seg.cagr >= 0 ? "#00ff41" : "#f87171" }}
                  >
                    {fmtCagr(seg.cagr)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full w-full" style={{ background: "rgba(0,255,65,0.1)" }}>
                  <div className="h-full rounded-full" style={{ width: `${seg.pct}%`, background: "#00ff41" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
