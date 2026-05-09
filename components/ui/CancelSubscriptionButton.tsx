"use client";

import { useState } from "react";

export default function CancelSubscriptionButton({ periodEnd }: { periodEnd: string }) {
  const [status, setStatus] = useState<"idle" | "confirming" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/cancel-subscription", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.");
        setStatus("idle");
      } else {
        setStatus("done");
      }
    } catch {
      setError("Network error. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div
        className="rounded px-4 py-3 text-xs leading-relaxed"
        style={{
          border: "1px solid rgba(239,68,68,0.3)",
          background: "rgba(239,68,68,0.05)",
          color: "#f87171",
        }}
      >
        Subscription cancelled. Your Pro access continues until{" "}
        <strong>{periodEnd}</strong>.
      </div>
    );
  }

  if (status === "confirming") {
    return (
      <div className="space-y-3">
        <p className="text-xs leading-relaxed" style={{ color: "rgba(0,255,65,0.45)" }}>
          Are you sure? You&apos;ll keep Pro access until{" "}
          <strong style={{ color: "rgba(0,255,65,0.7)" }}>{periodEnd}</strong>,
          then revert to the free plan.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="font-bold text-xs tracking-widest py-2 px-5 rounded transition-colors"
            style={{
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.4)",
              color: "#f87171",
              cursor: "pointer",
            }}
          >
            YES, CANCEL
          </button>
          <button
            onClick={() => setStatus("idle")}
            className="font-bold text-xs tracking-widest py-2 px-5 rounded transition-colors"
            style={{
              border: "1px solid rgba(0,255,65,0.25)",
              color: "rgba(0,255,65,0.5)",
              cursor: "pointer",
            }}
          >
            KEEP PLAN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setStatus("confirming")}
        disabled={status === "loading"}
        className="font-bold text-xs tracking-widest py-2 px-5 rounded transition-colors"
        style={{
          border: "1px solid rgba(239,68,68,0.35)",
          color: "rgba(239,68,68,0.7)",
          cursor: "pointer",
          background: "transparent",
        }}
      >
        {status === "loading" ? "CANCELLING..." : "CANCEL SUBSCRIPTION"}
      </button>
      {error && (
        <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>
      )}
    </div>
  );
}
