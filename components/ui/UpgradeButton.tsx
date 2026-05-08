"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UpgradeButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    // Navigate to the subscribe route — it handles auth check and Stripe redirect server-side
    router.push("/api/subscribe");
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-block px-6 py-2.5 bg-[#00ff41] text-black font-bold text-sm tracking-widest rounded hover:bg-[#00ff41]/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      {loading ? "REDIRECTING..." : "UPGRADE TO PRO →"}
    </button>
  );
}
