"use client";

import { useEffect, useState } from "react";
import { playClick, playChime } from "@/lib/sounds";

const SEEN_KEY = "ss_onboarding_seen";
const INTENT_KEY = "ss_tour_intent";

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function finish(choice: "start" | "skip") {
    if (choice === "start") { playChime(); } else { playClick(); }
    try {
      localStorage.setItem(SEEN_KEY, "1");
      localStorage.setItem(INTENT_KEY, choice);
    } catch {}
    setVisible(false);
    window.dispatchEvent(new Event("onboarding-dismissed"));
    window.dispatchEvent(new CustomEvent("stocksnack:onboarding-choice", { detail: choice }));
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 px-4">
      <div className="relative flex min-h-[330px] w-full max-w-[560px] flex-col rounded-xl border border-[#00ff41]/25 bg-[#050505] px-7 pb-7 pt-6 shadow-[0_0_60px_rgba(0,255,65,0.08)] sm:min-h-[400px] sm:px-10 sm:pb-9 sm:pt-8">
        <div className="flex items-start justify-between gap-4">
          <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-[#00ff41]/45">STOCKSNACK</span>
          <button
            onClick={() => finish("skip")}
            className="min-h-11 rounded px-3 font-mono text-[10px] tracking-[0.12em] text-[#00ff41]/30 transition-colors hover:text-[#00ff41]/70"
          >
            SKIP TOUR
          </button>
        </div>

        <div className="flex flex-1 flex-col justify-center py-7">
          <p className="max-w-[470px] font-mono text-[28px] font-bold leading-[1.08] tracking-[-0.02em] text-[#00ff41] sm:text-[42px]">
            FIND THE BEST S&amp;P 500 STOCK.
          </p>
          <p className="mt-5 max-w-[470px] font-mono text-[12px] leading-7 text-[#00ff41]/55 sm:text-[14px]">
            StockSnack ranks all 500 using projected return, growth quality, and financial health—so you can find the strongest opportunities faster.
          </p>
        </div>

        <button
          onClick={() => finish("start")}
          className="w-full rounded-md border border-[#00ff41] bg-[#00ff41] px-5 py-3 font-mono text-xs font-bold tracking-[0.16em] text-[#001a08] shadow-[0_0_18px_rgba(0,255,65,0.28)] transition-colors hover:bg-[#00dd38] sm:w-auto sm:self-end"
        >
          SHOW ME HOW →
        </button>
      </div>
    </div>
  );
}
