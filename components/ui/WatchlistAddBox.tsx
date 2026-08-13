"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WATCHLIST_FREE_UNLOCKED } from "@/lib/constants";

export default function WatchlistAddBox() {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "success"; message: string }
  >({ kind: "idle" });
  const router = useRouter();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (!ticker) return;
    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          data.error === "not_found" ? `${ticker} not found`
          : data.error === "pro_only" ? `${ticker} is Pro-only (S&P 400/600) — upgrade to add it`
          : data.error === "limit_reached" ? `Free limit reached (${data.limit ?? 10}) — remove one or upgrade for unlimited`
          : data.message || "Failed to add ticker";
        setStatus({ kind: "error", message });
        return;
      }
      setValue("");
      setStatus({
        kind: "success",
        message: data.locked
          ? `${ticker} saved — locked until you upgrade (all ${WATCHLIST_FREE_UNLOCKED} unlocked slots are in use)`
          : `${ticker} added`,
      });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error — try again" });
    }
  }

  return (
    <div className="border border-[#00ff41]/15 rounded-lg px-4 py-3 mb-5">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); if (status.kind !== "idle") setStatus({ kind: "idle" }); }}
          placeholder="TYPE A TICKER (E.G. AAPL)"
          maxLength={10}
          className="flex-1 bg-black border border-[#00ff41]/20 text-[#00ff41] text-xs rounded px-3 py-2 font-mono placeholder-[#00ff41]/20 focus:outline-none focus:border-[#00ff41]/50 tracking-widest"
        />
        <button
          type="submit"
          disabled={status.kind === "loading" || !value.trim()}
          className="bg-[#00ff41] text-black font-bold font-mono text-xs tracking-widest px-4 py-2 rounded hover:bg-[#00dd38] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {status.kind === "loading" ? "ADDING…" : "ADD →"}
        </button>
      </form>
      {status.kind === "error" && (
        <p className="text-[11px] font-mono text-red-400 mt-2">{status.message}</p>
      )}
      {status.kind === "success" && (
        <p className="text-[11px] font-mono text-[#00ff41]/60 mt-2">{status.message}</p>
      )}
    </div>
  );
}
