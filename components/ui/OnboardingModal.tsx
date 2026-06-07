"use client";
import { useState, useEffect } from "react";

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [cur, setCur] = useState(0);
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('ss_sound');
    return stored === null ? true : stored === '1';
  });
  const total = 7;

  useEffect(() => {
    const seen = localStorage.getItem("ss_onboarding_seen");
    if (!seen) setVisible(true);
  }, []);

  function close() {
    playBonus();
    localStorage.setItem("ss_onboarding_seen", "1");
    setVisible(false);
    window.dispatchEvent(new Event("onboarding-dismissed"));
  }

  function playClick() {
    if (!soundOn) return;
    try {
      const AudioCtx = (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!;
      const ctx = new AudioCtx();

      const bufferSize = ctx.sampleRate * 0.04;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 8);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1800;
      filter.Q.value = 0.8;
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseGain.gain.setValueAtTime(0.4, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      noise.start(ctx.currentTime);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.03);
      oscGain.gain.setValueAtTime(0.2, ctx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.03);

    } catch {}
  }

  function playBonus() {
    try {
      const AudioCtx = (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!;
      const ctx = new AudioCtx();
      const notes = [880, 1100, 1320, 1760];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        const start = ctx.currentTime + i * 0.08;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
        osc.start(start);
        osc.stop(start + 0.15);
      });
    } catch {}
  }

  function go(dir: number) {
    if (cur === total - 1 && dir === 1) { close(); return; }
    playClick();
    setCur(c => Math.max(0, Math.min(total - 1, c + dir)));
  }

  if (!visible) return null;

  const slides = [
    <div key={0} className="flex flex-col flex-1 justify-center gap-0">
      <p className="text-[15px] text-white/35 leading-snug">You are here to <span className="text-[#00ff41]">find</span> the</p>
      <p className="text-[32px] sm:text-[48px] font-medium text-[#00ff41] leading-[1.05] tracking-[-0.03em] whitespace-nowrap">BEST STOCKS.</p>
    </div>,

    <div key={1} className="flex flex-col flex-1 justify-center gap-0">
      <p className="text-[30px] sm:text-[44px] font-medium text-[#00ff41] leading-[1.0] tracking-tight">STOCKSNACK</p>
      <p className="text-[16px] sm:text-[20px] text-white/60 leading-snug mt-0.5">does all the work for you.</p>
      <p className="text-[11px] text-white/20 tracking-[0.1em] font-mono mt-3">NO SPREADSHEETS. NO GUESSING.</p>
    </div>,

    <div key={2} className="flex flex-col flex-1 justify-center gap-0">
      <p className="text-[15px] text-white/35 leading-snug">We estimate your</p>
      <p className="text-[28px] sm:text-[38px] font-medium text-[#00ff41] leading-[1.0] tracking-[-0.02em]">POTENTIAL RETURN</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[13px] text-white/50 pb-0.5">using</span>
        <span className="text-[28px] sm:text-[38px] font-medium text-[#00ff41] leading-[1.0] tracking-[-0.02em]">3 METHODS.</span>
      </div>
    </div>,

    <div key={3} className="flex flex-col flex-1 justify-center">
      <p className="text-[14px] text-white/35 mb-1">The 3 methods.</p>
      <div className="flex flex-col gap-2.5">
        {["EBITDA", "FREE CASH FLOW", "DIVIDEND"].map((m, i) => (
          <div key={m} className="flex items-center gap-3 bg-[#00ff41]/[0.06] border border-[#00ff41]/30 rounded-lg px-5 py-3">
            <span className="text-[13px] text-[#00ff41]/40 font-mono min-w-[20px]">0{i+1}</span>
            <span className="text-[15px] font-medium text-[#00ff41] font-mono tracking-[0.04em]">{m}</span>
          </div>
        ))}
      </div>
    </div>,

    <div key={4} className="flex flex-col flex-1 justify-center gap-0">
      <p className="text-[15px] text-white/35 leading-snug mb-0.5">Then we check</p>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[26px] sm:text-[34px] font-medium text-[#00ff41] leading-[1.05] tracking-tight">GROWTH QUALITY</span>
        <span className="text-[13px] text-white/35 pb-0.5">and</span>
      </div>
      <p className="text-[26px] sm:text-[34px] font-medium text-[#00ff41] leading-[1.05] tracking-tight">FINANCIAL HEALTH.</p>
      <p className="text-[12px] text-white/25 mt-3">To identify risk in your investment.</p>
    </div>,

    <div key={5} className="flex flex-col flex-1 justify-center gap-0">
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[16px] text-white/45">We</span>
        <span className="text-[16px] font-medium text-[#00ff41]">RANK</span>
        <span className="text-[16px] text-white/45">all stocks, and put in a</span>
      </div>
      <p className="text-[36px] sm:text-[52px] font-medium text-[#00ff41] leading-[1.0] tracking-tight mt-0.5">SCREENER.</p>
    </div>,

    <div key={6} className="flex flex-col flex-1 justify-center gap-0">
      <p className="text-[15px] text-white/35 leading-snug mb-0.5">Identify the</p>
      <div className="flex items-baseline gap-2">
        <span className="text-[32px] sm:text-[42px] font-medium text-[#00ff41] leading-[1.0] tracking-tight">POTENTIAL</span>
        <span className="text-[13px] text-white/35 pb-0.5">and</span>
      </div>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[32px] sm:text-[42px] font-medium text-[#ff4444] leading-[1.0] tracking-tight">RISK</span>
        <span className="text-[13px] text-white/35 pb-1">with StockSnack.</span>
      </div>
    </div>,
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4">
      <div className="relative bg-[#050505] border border-[#00ff41]/20 rounded-xl w-full max-w-[520px] min-h-[400px] flex flex-col px-6 sm:px-10 pt-8 sm:pt-6 pb-8 sm:pb-6">

        {/* Top bar — STOCKSNACK wordmark left, SKIP right */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-[11px] font-medium text-[#00ff41]/40 tracking-[0.15em] font-mono">STOCKSNACK</span>
          <button onClick={close} className="text-[11px] text-white/20 hover:text-white/40 font-mono tracking-[0.08em]">SKIP</button>
        </div>

        {/* Slide content */}
        <div className="flex flex-col flex-1 py-2 sm:py-0">
          {slides[cur]}
        </div>

        {/* Nav */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.07]">
          <button
            onClick={() => go(-1)}
            className={`text-[13px] px-4 py-1 rounded border border-white/[0.18] text-white/50 hover:border-[#00ff41]/40 hover:text-[#00ff41] transition-all ${cur === 0 ? "invisible" : ""}`}
          >← Back</button>
          <div className="flex items-center gap-2">
            {Array.from({length: total}).map((_, i) => (
              <button key={i} onClick={() => setCur(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === cur ? "bg-[#00ff41] scale-125" : "bg-white/15"}`} />
            ))}
            <button
              onClick={() => setSoundOn(v => !v)}
              className="text-white/25 hover:text-white/50 transition-all flex items-center justify-center w-6 h-6 ml-1"
            >
              {soundOn ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1,5 5,5 9,1 9,15 5,11 1,11" />
                  <path d="M11.5 5.5 Q13.5 8 11.5 10.5" />
                  <path d="M13 3.5 Q16 8 13 12.5" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1,5 5,5 9,1 9,15 5,11 1,11" />
                  <line x1="12" y1="5" x2="16" y2="11" />
                  <line x1="16" y1="5" x2="12" y2="11" />
                </svg>
              )}
            </button>
          </div>
          <button
            onClick={() => go(1)}
            className={`text-[13px] px-4 py-1 rounded border transition-all whitespace-nowrap ${cur === total-1 ? "bg-[#00ff41] border-[#00ff41] text-black font-medium hover:bg-[#00dd38]" : "border-white/[0.18] text-white/50 hover:border-[#00ff41]/40 hover:text-[#00ff41]"}`}
          >
            {cur === total - 1 ? "Screener →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
