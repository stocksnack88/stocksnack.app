"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const COUNTRIES = [
  { label: "MY +60",  code: "+60"  },
  { label: "US +1",   code: "+1"   },
  { label: "UK +44",  code: "+44"  },
  { label: "SG +65",  code: "+65"  },
  { label: "AU +61",  code: "+61"  },
  { label: "IN +91",  code: "+91"  },
  { label: "CA +1",   code: "+1"   },
  { label: "PH +63",  code: "+63"  },
  { label: "ID +62",  code: "+62"  },
  { label: "TH +66",  code: "+66"  },
  { label: "HK +852", code: "+852" },
  { label: "NZ +64",  code: "+64"  },
  { label: "JP +81",  code: "+81"  },
  { label: "CN +86",  code: "+86"  },
];

export default function VerifyPhonePage() {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState("+60");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const digits = phone.replace(/[\s\-\(\)]/g, "");
    if (!digits || !/^\d+$/.test(digits)) {
      setError("Please enter a valid phone number (digits only).");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/trial/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: countryCode + digits }),
      });
      const data = await r.json();
      if (r.ok) {
        router.push("/screener");
        router.refresh();
      } else {
        setError(data.error ?? "Verification failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm" style={{ animation: "fadeInUp 400ms ease-out both" }}>
      <form
        onSubmit={handleVerify}
        className="rounded p-8"
        style={{
          border: "1px solid rgba(0,255,65,0.3)",
          background: "rgba(0,255,65,0.02)",
        }}
      >
        <p
          className="text-[10px] tracking-[0.3em] mb-1"
          style={{ color: "rgba(0,255,65,0.4)" }}
        >
          FREE TRIAL
        </p>
        <h2
          className="text-sm font-bold tracking-widest mb-2"
          style={{ color: "#00ff41" }}
        >
          GET 15 MORE MINUTES FREE
        </h2>
        <p className="text-xs mb-6" style={{ color: "rgba(0,255,65,0.5)" }}>
          Verify your phone number to extend your trial.
        </p>

        <div>
          <label
            className="block text-xs tracking-widest mb-1.5"
            style={{ color: "rgba(0,255,65,0.5)" }}
          >
            PHONE NUMBER
          </label>
          <div className="flex gap-2">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="rounded px-2 py-2.5 text-sm focus:outline-none"
              style={{
                background: "#000",
                border: "1px solid rgba(0,255,65,0.3)",
                color: "#00ff41",
                minWidth: "96px",
              }}
            >
              {COUNTRIES.map((c) => (
                <option key={c.label} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="tel"
              required
              placeholder="123456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 rounded px-3 py-2.5 text-sm focus:outline-none transition-colors"
              style={{
                background: "#000",
                border: "1px solid rgba(0,255,65,0.3)",
                color: "#00ff41",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#00ff41")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(0,255,65,0.3)")}
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
          {loading ? "VERIFYING..." : "VERIFY →"}
        </button>
      </form>

      <p className="mt-5 text-center text-xs" style={{ color: "rgba(0,255,65,0.25)" }}>
        <Link
          href="/pricing"
          className="transition-colors hover:opacity-70"
          style={{ color: "rgba(0,255,65,0.35)" }}
        >
          Skip → Upgrade to Pro
        </Link>
      </p>
    </div>
  );
}
