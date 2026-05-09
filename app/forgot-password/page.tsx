"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase-browser";

const COOLDOWN = 60;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(COOLDOWN);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    if (!submitted || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [submitted, countdown]);

  async function callSupabase() {
    const supabase = createBrowserSupabase();
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://www.stocksnack.app/reset-password",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: resetError } = await callSupabase();

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSubmitted(true);
      setCountdown(COOLDOWN);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setResendSuccess(false);
    try {
      await callSupabase();
      setResendSuccess(true);
      setCountdown(COOLDOWN);
      setTimeout(() => setResendSuccess(false), 3000);
    } finally {
      setResending(false);
    }
  }

  if (submitted) {
    const canResend = countdown <= 0 && !resending;

    return (
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 text-3xl" style={{ color: "#00ff41" }}>✓</div>
        <h2
          className="text-sm font-bold tracking-widest mb-3"
          style={{ color: "#00ff41" }}
        >
          CHECK YOUR EMAIL
        </h2>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(0,255,65,0.5)" }}>
          If <span style={{ color: "rgba(0,255,65,0.8)" }}>{email}</span> is
          registered, we&apos;ve sent a password reset link.
          <br />
          Click the link in the email to set a new password.
        </p>
        <p className="mt-4 text-xs" style={{ color: "rgba(0,255,65,0.25)" }}>
          Didn&apos;t receive it? Check your spam folder.
        </p>

        <div className="mt-6">
          {resendSuccess ? (
            <p className="text-xs py-2.5" style={{ color: "#00ff41" }}>
              ✓ New link sent!
            </p>
          ) : (
            <button
              onClick={handleResend}
              disabled={!canResend}
              className="w-full font-bold text-xs tracking-widest py-2.5 rounded transition-colors"
              style={{
                background: canResend ? "rgba(0,255,65,0.08)" : "transparent",
                border: `1px solid ${canResend ? "rgba(0,255,65,0.35)" : "rgba(0,255,65,0.12)"}`,
                color: canResend ? "rgba(0,255,65,0.65)" : "rgba(0,255,65,0.22)",
                cursor: canResend ? "pointer" : "default",
              }}
            >
              {resending
                ? "SENDING..."
                : countdown > 0
                ? `RESEND IN ${countdown}s`
                : "RESEND EMAIL →"}
            </button>
          )}
        </div>

        <p className="mt-5 text-xs" style={{ color: "rgba(0,255,65,0.3)" }}>
          <Link href="/login" className="underline" style={{ color: "rgba(0,255,65,0.5)" }}>
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

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
          RESET PASSWORD
        </h2>
        <p className="text-xs mb-6" style={{ color: "rgba(0,255,65,0.35)" }}>
          Enter your email and we&apos;ll send you a reset link.
        </p>

        <div>
          <label
            className="block text-xs tracking-widest mb-1.5"
            style={{ color: "rgba(0,255,65,0.5)" }}
          >
            EMAIL
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded px-3 py-2.5 text-sm focus:outline-none transition-colors"
            style={{
              background: "#000",
              border: "1px solid rgba(0,255,65,0.3)",
              color: "#00ff41",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#00ff41")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(0,255,65,0.3)")}
            placeholder="you@example.com"
          />
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
          {loading ? "SENDING..." : "SEND RESET LINK →"}
        </button>
      </form>

      <p className="mt-5 text-center text-xs" style={{ color: "rgba(0,255,65,0.3)" }}>
        <Link
          href="/login"
          className="underline transition-colors"
          style={{ color: "rgba(0,255,65,0.5)" }}
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
