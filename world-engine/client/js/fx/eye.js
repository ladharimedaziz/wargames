// "KRONOS IS WATCHING..." — a small eye at the top of every screen of a committee, shown only when Kronos turns it on.
import { html, useState, useEffect, useRef } from '../lib.js';

const TEXT = 'KRONOS IS WATCHING...';

export function KronosEye({ on, big = false }) {
  const [phase, setPhase] = useState(on ? 'in' : 'off');
  const prev = useRef(on);
  useEffect(() => {
    if (on && !prev.current) setPhase('in');
    if (!on && prev.current) { setPhase('leaving'); const t = setTimeout(() => setPhase('off'), 600); prev.current = on; return () => clearTimeout(t); }
    prev.current = on;
  }, [on]);
  // Occasionally the text glitches harder for a moment.
  const [glitch, setGlitch] = useState(false);
  useEffect(() => {
    if (phase === 'off') return;
    let t;
    const loop = () => { t = setTimeout(() => { setGlitch(true); setTimeout(() => setGlitch(false), 160); loop(); }, 2500 + Math.random() * 4000); };
    loop();
    return () => clearTimeout(t);
  }, [phase]);
  if (phase === 'off') return null;
  return html`
    <div class=${`kronos-eye ${big ? 'big' : ''} ${phase === 'leaving' ? 'leaving' : ''}`} aria-label="Kronos is watching">
      <svg viewBox="0 0 120 64">
        <defs>
          <radialGradient id="kiris" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#fff3c4" />
            <stop offset="30%" stop-color="#ffb224" />
            <stop offset="70%" stop-color="#c2311f" />
            <stop offset="100%" stop-color="#3a0606" />
          </radialGradient>
          <clipPath id="keye"><path d="M4 32 Q60 -10 116 32 Q60 74 4 32 Z" /></clipPath>
        </defs>
        <g class="lid">
          <path d="M4 32 Q60 -10 116 32 Q60 74 4 32 Z" fill="#120406" stroke="#ffb224" stroke-width="2.2" />
          <g clip-path="url(#keye)">
            <g class="iris">
              <circle cx="60" cy="32" r="19" fill="url(#kiris)" />
              <ellipse cx="60" cy="32" rx="4.2" ry="15" fill="#050000" />
              <circle cx="66" cy="25" r="3" fill="rgba(255,255,255,.75)" />
            </g>
          </g>
        </g>
        <path d="M2 30 L-6 26 M118 30 L126 26 M60 4 L60 -4 M30 12 L26 5 M90 12 L94 5" stroke="#ffb224" stroke-width="2" stroke-linecap="round" opacity=".7" />
      </svg>
      <div class="text" style=${glitch ? 'filter: blur(.6px); transform: skewX(-8deg); opacity: .8' : ''}>
        ${[...TEXT].map((ch, i) => html`<span key=${i}>${ch === ' ' ? ' ' : ch}</span>`)}
      </div>
    </div>`;
}
