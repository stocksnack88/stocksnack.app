"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";

type Stage = "exchanging" | "invalid" | "form" | "success";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("exchanging");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Exchange the one-time code Supabase appends to the redirect URL.
  // Runs only on the client where window is available.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      setStage("invalid");
      return;
    }

    const supabase = createBrowserSupabase();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        console.error("[reset-password] Code exchange failed:", error.message);
        setStage("invalid");
      } else {
        setStage("form");
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createBrowserSupabase();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setStage("success");
      setTimeout(() => router.push("/screener"), 2500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // ── Exchanging code ────────────────────────────────────────────────────────
  if (stage === "exchanging") {
    return (
      <div className="w-full max-w-sm text-center">
        <p className="text-xs tracking-widest" style={{ color: "rgba(0,255,65,0.4)" }}>
          VERIFYING RESET LINK...
        </p>
      </div>
    );
  }

  // ── Invalid / expired link ─────────────────────────────────────────────────
  if (stage === "invalid") {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 text-3xl" style={{ color: "#f87171" }}>✕</div>
        <h2
          className="text-sm font-bold tracking-widest mb-3"
          style={{ color: "#f87171" }}
        >
          LINK EXPIRED
        </h2>
        <p className="text-xs leading-relaxed mb-6" style={{ color: "rgba(0,255,65,0.4)" }}>
          This password reset link is invalid or has expired.
          <br />
          Reset links are single-use and expire after 1 hour.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block font-bold text-xs tracking-widest py-2.5 px-6 rounded transition-colors"
          style={{ background: "#00ff41", color: "#000" }}
        >
          REQUEST A NEW LINK →
        </Link>
        <p className="mt-5 text-xs" style={{ color: "rgba(0,255,65,0.3)" }}>
          <Link href="/login" className="underline" style={{ color: "rgba(0,255,65,0.5)" }}>
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (stage === "success") {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 text-3xl" style={{ color: "#00ff41" }}>✓</div>
        <h2
          className="text-sm font-bold tracking-widest mb-3"
          style={{ color: "#00ff41" }}
        >
          PASSWORD UPDATED
        </h2>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(0,255,65,0.5)" }}>
          Your password has been changed successfully.
          <br />
          Redirecting you to the screener...
        </p>
      </div>
    );
  }

  // ── Password form ──────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-sm">
      <form
        onSubmit={handleSubmit}
        className="rounded p-8"
        style={{
          border: "1px solid rgba(0,255,65,0.3)",
          background: "rgba(0,255,65,0.02)",
        }}
      >
        <h2
          className="text-sm font-bold tracking-widest mb-2"
          style={{ color: "rgba(0,255,65,0.7)" }}
        >
          SET NEW PASSWORD
        </h2>
        <p className="text-xs mb-6" style={{ color: "rgba(0,255,65,0.35)" }}>
          Choose a strong password for your account.
        </p>

        <div className="space-y-4">
          <div>
            <label
              className="block text-xs tracking-widest mb-1.5"
              style={{ color: "rgba(0,255,65,0.5)" }}
            >
              NEW PASSWORD
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded px-3 py-2.5 text-sm focus:outline-none transition-colors"
              style={{
                background: "#000",
                border: "1px solid rgba(0,255,65,0.3)",
                color: "#00ff41",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#00ff41")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(0,255,65,0.3)")}
              placeholder="Min. 8 characters"
            />
          </div>

          <div>
            <label
              className="block text-xs tracking-widest mb-1.5"
              style={{ color: "rgba(0,255,65,0.5)" }}
            >
              CONFIRM PASSWORD
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded px-3 py-2.5 text-sm focus:outline-none transition-colors"
              style={{
                background: "#000",
                border: "1px solid rgba(0,255,65,0.3)",
                color: "#00ff41",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#00ff41")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(0,255,65,0.3)")}
              placeholder="••••••••"
            />
          </div>
        </div>

        {error && (
          <div
            className="mt-4 rounded px-3 py-2.5 text-xs tracking-wide"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.4)",
              color: "#f87171",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full font-bold text-sm tracking-widest py-2.5 rounded transition-colors"
          style={{
            background: loading ? "rgba(0,255,65,0.6)" : "#00ff41",
            color: "#000",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "UPDATING..." : "UPDATE PASSWORD →"}
        </button>
      </form>
    </div>
  );
}
