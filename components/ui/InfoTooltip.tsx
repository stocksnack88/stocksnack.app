"use client";

import { useState } from "react";
import React from "react";

export default function InfoTooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(true); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setOpen(false); }}
        onClick={() => setOpen((o) => !o)}
        className="text-[#00ff41]/30 hover:text-[#00ff41]/60 transition-colors leading-none ml-2 text-base"
        aria-label="Score legend"
      >
        ⓘ
      </button>
      {open && (
        <span
          className="absolute left-0 top-full mt-1.5 z-30 rounded border border-[#00ff41]/20 bg-black px-3 py-2.5 shadow-lg pointer-events-none"
          style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
        >
          {children}
        </span>
      )}
    </span>
  );
}
