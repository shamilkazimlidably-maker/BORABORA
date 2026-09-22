// Synthesized UI sounds (no asset files): wood click, ceramic slide, coin tick, marimba.
let ctx = null;
let on = true;
export function setSound(v) { on = v !== false; }
function ac() {
  if (!on || typeof window === 'undefined') return null;
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function noiseBurst(dur, freq, q, gain) {
  const c = ac(); if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(c.destination); src.start();
}
function tone(freq, dur, type = 'sine', gain = 0.18, delay = 0) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t = c.currentTime + delay;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
export const sfx = {
  tap: () => noiseBurst(0.035, 1800, 3, 0.35),
  place: () => { noiseBurst(0.06, 900, 2.2, 0.9); tone(180, 0.08, 'triangle', 0.12); },
  draw: () => noiseBurst(0.18, 3200, 0.8, 0.18),
  coin: () => { tone(1568, 0.07, 'square', 0.05); tone(2093, 0.09, 'square', 0.04, 0.05); },
  turn: () => { noiseBurst(0.05, 700, 4, 0.6); },
  warn: () => { noiseBurst(0.08, 420, 5, 0.8); },
  found: () => { tone(523, 0.18, 'sine', 0.2); tone(784, 0.26, 'sine', 0.2, 0.12); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.16, i * 0.09)); },
  loss: () => { tone(160, 0.25, 'sine', 0.22); },
  level: () => { [659, 784, 988].forEach((f, i) => tone(f, 0.3, 'sine', 0.18, i * 0.12)); },
  pass: () => noiseBurst(0.05, 500, 3, 0.4),
};
