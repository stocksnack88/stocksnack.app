"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center"
      style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      <div className="mb-5 text-3xl" style={{ color: "#f87171" }}>✕</div>
      <h1
        className="text-2xl font-bold tracking-widest mb-4"
        style={{ color: "#f87171" }}
      >
        SOMETHING WENT WRONG
      </h1>
      <p
        className="text-xs leading-relaxed mb-10 max-w-xs"
        style={{ color: "rgba(0,255,65,0.4)" }}
      >
        An unexpected error occurred. Try again or return home.
      </p>
      <div className="flex items-center gap-4">
        <button
          onClick={reset}
          className="font-bold text-xs tracking-widest py-2.5 px-6 rounded transition-colors"
          style={{ background: "#00ff41", color: "#000", cursor: "pointer" }}
        >
          TRY AGAIN →
        </button>
        <Link
          href="/"
          className="font-bold text-xs tracking-widest py-2.5 px-6 rounded transition-colors"
          style={{
            border: "1px solid rgba(0,255,65,0.3)",
            color: "rgba(0,255,65,0.6)",
          }}
        >
          ← HOME
        </Link>
      </div>
    </div>
  );
}
