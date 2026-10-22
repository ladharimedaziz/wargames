// Procedural sound effects with WebAudio: no audio files to load. There is no music.
let ctx = null, master = null, sfxBus = null;
let enabled = { sfx: true }, volume = 0.7;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const audioReady = () => !!ctx && ctx.state === 'running';
export function unlockAudio() { ac(); }

export function setAudio({ sfx, vol }) {
  if (vol !== undefined) { volume = vol; if (master) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.2); }
  if (sfx !== undefined) enabled.sfx = sfx;
}

function blip(dest, f, len, gain) {
  const c = ac(), now = c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(gain, now); g.gain.exponentialRampToValueAtTime(0.0001, now + len);
  o.connect(g); g.connect(dest); o.start(now); o.stop(now + len + 0.02);
}
function noise(len, { type = 'lowpass', freq = 800, q = 1, gain = 0.5, attack = 0.005, decay } = {}) {
  const c = ac(), now = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(gain, now + attack); g.gain.exponentialRampToValueAtTime(0.0001, now + (decay || len));
  src.connect(f); f.connect(g); g.connect(sfxBus); src.start(now); src.stop(now + len);
  return { f, g, now };
}
function tone(freq, len, { type = 'sine', gain = 0.3, attack = 0.01, slide, delay = 0 } = {}) {
  const c = ac(), now = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, now); if (slide) o.frequency.exponentialRampToValueAtTime(slide, now + len);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(gain, now + attack); g.gain.exponentialRampToValueAtTime(0.0001, now + len);
  o.connect(g); g.connect(sfxBus); o.start(now); o.stop(now + len + 0.05);
}

export const sfx = {
  whoosh() { if (!enabled.sfx) return; const n = noise(1.4, { type: 'bandpass', freq: 300, q: 0.8, gain: 0.35, attack: 0.6, decay: 1.4 }); n.f.frequency.exponentialRampToValueAtTime(3000, n.now + 1.2); },
  boom(big = 1) { if (!enabled.sfx) return; noise(2.5 * big, { freq: 160, gain: 0.7 * big, decay: 2.4 * big }); tone(55, 1.6 * big, { gain: 0.5 * big, slide: 28 }); },
  impact() { if (!enabled.sfx) return; noise(0.7, { freq: 420, gain: 0.25, decay: 0.6 }); tone(90, 0.4, { gain: 0.2, slide: 40 }); },
  alarm() { if (!enabled.sfx) return; for (let i = 0; i < 4; i++) { tone(880, 0.32, { type: 'sawtooth', gain: 0.08, delay: i * 0.45, slide: 660 }); } },
  ping() { if (!enabled.sfx) return; tone(1320, 0.5, { gain: 0.12 }); tone(1980, 0.4, { gain: 0.05, delay: 0.05 }); },
  tick() { if (!enabled.sfx) return; tone(2200, 0.03, { type: 'square', gain: 0.04 }); },
  type() { if (!enabled.sfx) return; tone(1600 + Math.random() * 600, 0.02, { type: 'square', gain: 0.02 }); },
  news() { if (!enabled.sfx) return; [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.1, delay: i * 0.09 })); },
  breaking() { if (!enabled.sfx) return; [392, 523, 392, 659].forEach((f, i) => tone(f, 0.35, { type: 'sawtooth', gain: 0.07, delay: i * 0.16 })); noise(0.8, { type: 'highpass', freq: 3000, gain: 0.05 }); },
  gavel() { if (!enabled.sfx) return; [0, 0.28].forEach(d => setTimeout(() => { noise(0.25, { type: 'bandpass', freq: 900, q: 2, gain: 0.8, decay: 0.2 }); tone(180, 0.2, { gain: 0.35, slide: 90 }); }, d * 1000)); },
  objection() { if (!enabled.sfx) return; noise(0.5, { type: 'lowpass', freq: 1200, gain: 0.9, decay: 0.45 }); tone(140, 0.6, { type: 'square', gain: 0.25, slide: 70 }); tone(420, 0.25, { type: 'sawtooth', gain: 0.12 }); },
  stamp(good) { if (!enabled.sfx) return; noise(0.3, { freq: 700, gain: 0.7, decay: 0.25 }); tone(good ? 660 : 220, 0.5, { type: 'triangle', gain: 0.18, delay: 0.05 }); },
  reveal() { if (!enabled.sfx) return; noise(3, { type: 'bandpass', freq: 200, q: 0.5, gain: 0.3, attack: 2.2, decay: 3 }); [65, 98, 131].forEach((f, i) => tone(f, 4, { type: 'sawtooth', gain: 0.08, attack: 1.8, delay: 0.2 * i })); setTimeout(() => sfx.boom(1.3), 2300); },
  glitch() { if (!enabled.sfx) return; for (let i = 0; i < 8; i++) tone(200 + Math.random() * 3000, 0.04, { type: 'square', gain: 0.05, delay: i * 0.05 }); },
  timerEnd() { if (!enabled.sfx) return; [880, 880, 880].forEach((f, i) => tone(f, 0.22, { type: 'square', gain: 0.1, delay: i * 0.3 })); },
  heartbeat() { if (!enabled.sfx) return; tone(60, 0.25, { gain: 0.4, slide: 40 }); tone(55, 0.25, { gain: 0.3, slide: 38, delay: 0.22 }); },
  chime() { if (!enabled.sfx) return; [784, 988, 1175].forEach((f, i) => tone(f, 1.2, { type: 'sine', gain: 0.08, delay: i * 0.12 })); },
  dm() { tone(988, 0.15, { gain: 0.12 }); tone(1319, 0.25, { gain: 0.1, delay: 0.1 }); },
};
