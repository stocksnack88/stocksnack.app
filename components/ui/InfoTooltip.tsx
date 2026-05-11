"use client";

import { useState } from "react";

export default function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="text-[#00ff41]/30 hover:text-[#00ff41]/60 transition-colors leading-none ml-2 text-base"
        aria-label="Score legend"
      >
        ⓘ
      </button>
      {open && (
        <span className="absolute left-0 top-full mt-1.5 z-20 w-64 rounded border border-[#00ff41]/20 bg-black px-3 py-2 text-xs text-[#00ff41]/60 leading-relaxed shadow-lg pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}
