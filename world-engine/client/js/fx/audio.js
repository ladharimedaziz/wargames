// Procedural soundtrack and effects with WebAudio: no audio files to load.
// The score is a slow drone that grows darker and faster as Global Tension climbs.
let ctx = null, master = null, musicBus = null, sfxBus = null, music = null;
let enabled = { music: false, sfx: true }, volume = 0.7;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const audioReady = () => !!ctx && ctx.state === 'running';
export function unlockAudio() { ac(); }

function reverb(seconds = 3) {
  const c = ac(), len = c.sampleRate * seconds, buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
  const conv = c.createConvolver(); conv.buffer = buf; return conv;
}

// Minor-key pads; the chord pool shifts with tension.
const ROOT = 41.2; // E1
const CHORDS = [
  [0, 7, 12, 15, 19], [0, 7, 12, 14, 19], [-4, 3, 8, 12, 15], [-2, 5, 10, 14, 17],
  [0, 6, 12, 15, 18], [1, 7, 13, 16, 19],
];
const hz = semi => ROOT * Math.pow(2, semi / 12);

function startMusic() {
  const c = ac();
  if (music) return;
  const out = c.createGain(); out.gain.value = 1;
  const verb = reverb(4.5); const wet = c.createGain(); wet.gain.value = 0.55;
  out.connect(musicBus); out.connect(verb); verb.connect(wet); wet.connect(musicBus);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7; lp.connect(out);
  const voices = [];
  for (let i = 0; i < 5; i++) {
    const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o1.type = 'sawtooth'; o2.type = 'triangle'; o2.detune.value = 7 + i;
    g.gain.value = 0;
    o1.connect(g); o2.connect(g); g.connect(lp);
    o1.start(); o2.start();
    voices.push({ o1, o2, g });
  }
  // Sub pulse that quickens with tension.
  const sub = c.createOscillator(), subG = c.createGain(); sub.type = 'sine'; sub.frequency.value = hz(-12); subG.gain.value = 0; sub.connect(subG); subG.connect(out); sub.start();
  // Ticking clock layer for high tension.
  const tickG = c.createGain(); tickG.gain.value = 0; tickG.connect(out);
  music = { voices, lp, sub, subG, tickG, tension: 3, chord: 0, timer: null, beat: 0, out };
  const step = () => {
    if (!music) return;
    const m = music, now = c.currentTime, t = m.tension;
    const pool = t < 4 ? [0, 1, 2, 3] : t < 7 ? [0, 2, 3, 4] : [4, 5, 0, 5];
    m.chord = pool[(pool.indexOf(m.chord) + 1 + Math.floor(Math.random() * 2)) % pool.length] ?? pool[0];
    const notes = CHORDS[m.chord];
    const dur = Math.max(2.6, 9 - t * 0.6);
    m.voices.forEach((v, i) => {
      const f = hz(notes[i] + 12);
      v.o1.frequency.setTargetAtTime(f, now, 0.6); v.o2.frequency.setTargetAtTime(f * 1.002, now, 0.6);
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setTargetAtTime((i === 0 ? 0.05 : 0.028) * (0.7 + t * 0.05), now, 0.8);
    });
    m.lp.frequency.setTargetAtTime(500 + t * 220, now, 2);
    m.subG.gain.setTargetAtTime(t >= 5 ? 0.05 + (t - 5) * 0.02 : 0.02, now, 1);
    m.timer = setTimeout(step, dur * 1000);
  };
  step();
  const pulse = () => {
    if (!music) return;
    const m = music, t = m.tension, now = c.currentTime;
    if (t >= 6) {
      // heartbeat sub thump
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(70, now); o.frequency.exponentialRampToValueAtTime(38, now + 0.25);
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.18 + (t - 6) * 0.04, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      o.connect(g); g.connect(m.out); o.start(now); o.stop(now + 0.4);
    }
    if (t >= 8) blip(m.out, 2400, 0.012, 0.02);
    m.pulseTimer = setTimeout(pulse, Math.max(420, 1500 - t * 100));
  };
  pulse();
}

function stopMusic() {
  if (!music) return;
  const m = music; music = null;
  clearTimeout(m.timer); clearTimeout(m.pulseTimer);
  const now = ctx.currentTime;
  m.voices.forEach(v => { v.g.gain.setTargetAtTime(0, now, 0.5); v.o1.stop(now + 3); v.o2.stop(now + 3); });
  m.sub.stop(now + 3);
}

export function setAudio({ music: mu, sfx, vol, tension }) {
  if (vol !== undefined) { volume = vol; if (master) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.2); }
  if (sfx !== undefined) enabled.sfx = sfx;
  if (mu !== undefined && mu !== enabled.music) {
    enabled.music = mu;
    if (ctx) {
      if (mu) { startMusic(); musicBus.gain.setTargetAtTime(0.9, ctx.currentTime, 1.5); }
      else { musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.8); setTimeout(() => { if (!enabled.music) stopMusic(); }, 3000); }
    }
  }
  if (tension !== undefined && music) music.tension = tension;
  if (tension !== undefined) lastTension = tension;
}
let lastTension = 3;
export function resumeMusic() { if (enabled.music && ctx && !music) { startMusic(); music.tension = lastTension; musicBus.gain.setTargetAtTime(0.9, ctx.currentTime, 1.5); } }

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
