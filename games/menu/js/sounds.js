// Themed alert sounds — synthesized with WebAudio, zero audio files, zero
// copyrighted material: melodies that NOD to famous cartoon kitchens.
// iOS/iPadOS rule: audio only unlocks after the first user touch on the page.

export const SOUND_CODEPITCH = 0; // CI sentinel: no samples ever

let ctx = null;          // AudioContext (created lazily = unlocked on first tap)
let master = null;       // master gain (volume capping)
let muted = false;       // 🔔 toggle from admin

export function soundEnabled() {
  return !muted;
}

export function setSoundEnabled(v) {
  muted = !v;
}

// call this from ANY first user interaction (click/touch) on the admin page
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7; // medium volume (capped)
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  } catch (e) {
    return false;
  }
}

function tone(freq, t0, dur, type = 'square', gain = 0.5, vib = 0) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (vib) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = vib;
    lg.gain.value = vib * 0.4;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.1);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// 🔔 double ding, bright bells — the "order in!" cue
export function newOrderBell() {
  if (muted || !ctx || !master) return;
  const t = ctx.currentTime + 0.02;
  tone(987.77, t, 0.16, 'sine', 0.5);        // B5
  tone(1318.5, t + 0.02, 0.16, 'triangle', 0.32); // E6 shimmer
  tone(659.25, t + 0.2, 0.3, 'sine', 0.42);  // E5
  tone(987.77, t + 0.21, 0.3, 'triangle', 0.25);
}

// 🍍 rising tropical blip — "served!" chirp A
export function chirpPineapple() {
  if (muted || !ctx || !master) return;
  const t = ctx.currentTime + 0.02;
  tone(523.25, t, 0.09, 'triangle', 0.4);        // C5
  tone(659.25, t + 0.09, 0.09, 'triangle', 0.4); // E5
  tone(783.99, t + 0.18, 0.16, 'triangle', 0.45, 6); // G5 + vibrato
}

// 😂 two-note nasal step-up — "served!" chirp B
export function chirpGiggle() {
  if (muted || !ctx || !master) return;
  const t = ctx.currentTime + 0.02;
  tone(622.25, t, 0.09, 'square', 0.3);       // D#5
  tone(830.61, t + 0.11, 0.15, 'square', 0.32, 5); // F#5
  tone(622.25, t + 0.3, 0.1, 'square', 0.22);
}

// random happy chirp when an order is marked served
export function servedChirp() {
  if (Math.random() < 0.5) chirpPineapple();
  else chirpGiggle();
}

export function vibrate(ms = 60) {
  try {
    if (navigator.vibrate && !muted) navigator.vibrate(ms);
  } catch (e) { /* iOS: no vibration by spec */ }
}
