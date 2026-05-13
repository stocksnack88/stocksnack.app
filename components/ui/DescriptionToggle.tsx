"use client";
import { useState } from "react";

export default function DescriptionToggle({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="relative border-l-2 pl-4" style={{ borderColor: "rgba(0,255,65,0.2)" }}>
      <p className="text-xs leading-relaxed" style={{ color: "rgba(0,255,65,0.4)" }}>
        {expanded ? text : text.slice(0, 80) + "..."}
      </p>
      {!expanded && (
        <div
          className="absolute inset-x-0 bottom-0 h-5 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, #000)" }}
        />
      )}
      <button
        className="mt-1.5 text-[9px] tracking-widest"
        style={{ color: "rgba(0,255,65,0.5)" }}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "[−]" : "[+]"}
      </button>
    </div>
  );
}
