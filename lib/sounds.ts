// All sound effects respect the ss_sound localStorage preference (0 = off)
function soundAllowed() {
  try { return typeof window !== "undefined" && localStorage.getItem("ss_sound") !== "0"; }
  catch { return false; }
}

// Reuse a single AudioContext across calls — recreating it each time causes
// iOS Safari to silently drop sounds when the context isn't yet "unlocked".
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC = (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return null;
    if (!_ctx) _ctx = new AC();
    // iOS suspends the context when the page loses focus — resume before use
    if (_ctx.state === "suspended") _ctx.resume();
    return _ctx;
  } catch {
    return null;
  }
}

// Short mechanical click — navigation, button presses, dismissals
export function playClick() {
  if (!soundAllowed()) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
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
    noiseGain.gain.setValueAtTime(0.3, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + 0.04);
  } catch {}
}

// Two-note ascending chime — confirmations, success states
export function playChime() {
  if (!soundAllowed()) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    [1046, 1568].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      const start = ctx.currentTime + i * 0.07;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.1, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
      osc.start(start);
      osc.stop(start + 0.12);
    });
  } catch {}
}

// Single soft tone — subtle confirmations, tour steps advancing
export function playTick() {
  if (!soundAllowed()) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {}
}
