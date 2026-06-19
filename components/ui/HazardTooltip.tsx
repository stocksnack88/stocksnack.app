"use client";

import { useState } from "react";

export default function HazardTooltip({ reasons }: { reasons: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(true); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setOpen(false); }}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="text-amber-400/80 hover:text-amber-400 transition-colors leading-none text-lg"
        aria-label="Data anomaly warning"
      >
        ⚠
      </button>
      {open && (
        <span
          className="absolute bottom-full left-0 mb-1.5 z-50 w-64 rounded border border-amber-400/30 bg-black px-3 py-2.5 shadow-lg pointer-events-none"
          style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
        >
          <span className="block text-[10px] font-bold text-amber-400 mb-1.5 tracking-wider">
            UNUSUAL DATA DETECTED
          </span>
          {reasons.map((r, i) => (
            <span key={i} className="block text-[10px] text-amber-300/80 leading-relaxed">
              · {r}
            </span>
          ))}
          <span className="block mt-1.5 text-[9px] text-amber-400/40 leading-relaxed">
            Please verify before relying on this score.
          </span>
        </span>
      )}
    </span>
  );
}
