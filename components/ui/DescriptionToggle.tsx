"use client";
import { useState } from "react";

export default function DescriptionToggle({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-l-2 pl-4" style={{ borderColor: "rgba(0,255,65,0.2)" }}>
      <p className="text-xs leading-relaxed" style={{ color: "rgba(0,255,65,0.4)" }}>
        {expanded ? text : text.slice(0, 80) + "... "}
        <button
          className="text-[9px] tracking-widest"
          style={{ color: "rgba(0,255,65,0.5)" }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "[−]" : "[+]"}
        </button>
      </p>
    </div>
  );
}
