"use client";

import { useEffect, useState } from "react";

export default function DebugResetPage() {
  const [info, setInfo] = useState<{
    href: string;
    search: string;
    hash: string;
  } | null>(null);

  useEffect(() => {
    setInfo({
      href: window.location.href,
      search: window.location.search || "(empty)",
      hash: window.location.hash || "(empty)",
    });
  }, []);

  return (
    <div
      className="min-h-screen bg-black px-6 py-12"
      style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      <p className="text-xs tracking-widest mb-6" style={{ color: "rgba(0,255,65,0.4)" }}>
        DEBUG · RESET URL INSPECTOR
      </p>

      {info ? (
        <div className="space-y-6 max-w-2xl">
          {[
            { label: "window.location.href", value: info.href },
            { label: "window.location.search", value: info.search },
            { label: "window.location.hash", value: info.hash },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs tracking-widest mb-2" style={{ color: "rgba(0,255,65,0.5)" }}>
                {label}
              </p>
              <div
                className="rounded px-4 py-3 text-xs break-all"
                style={{
                  border: "1px solid rgba(0,255,65,0.25)",
                  background: "rgba(0,255,65,0.03)",
                  color: "#00ff41",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "rgba(0,255,65,0.3)" }}>
          LOADING...
        </p>
      )}
    </div>
  );
}
