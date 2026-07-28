// Simple WebAudio success chime — no asset downloads needed.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function beep(audio: AudioContext, freq: number, start: number, dur: number, gainPeak = 0.18) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, audio.currentTime + start);
  gain.gain.setValueAtTime(0.0001, audio.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(gainPeak, audio.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + dur);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(audio.currentTime + start);
  osc.stop(audio.currentTime + start + dur + 0.02);
}

/** Two-tone ascending success chime. */
export function playSuccessChime() {
  try {
    const audio = getCtx();
    if (!audio) return;
    beep(audio, 880, 0, 0.14);
    beep(audio, 1318.5, 0.13, 0.24);
  } catch {
    /* audio blocked — silent fallback */
  }
}

export function playErrorBeep() {
  try {
    const audio = getCtx();
    if (!audio) return;
    beep(audio, 220, 0, 0.3, 0.14);
  } catch {
    /* ignore */
  }
}
