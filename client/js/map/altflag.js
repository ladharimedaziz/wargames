// Fictional flags for governments that take power in a coup. A flag is {pat, c:[a,b,c]}; it renders as SVG.
export const FLAG_PATTERNS = ['hband', 'vband', 'cross', 'canton', 'diagonal', 'sun', 'chevron', 'stripe-star'];
const star = (cx, cy, r, fill) => `<polygon fill="${fill}" points="${[...Array(10)].map((_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`; }).join(' ')}"/>`;

export function altFlagSvg(f) {
  const [a, b, c] = f?.c || ['#444', '#ddd', '#a22'];
  const W = 192, H = 128;
  const body = {
    hband: `<rect width="${W}" height="${H / 3}" fill="${a}"/><rect y="${H / 3}" width="${W}" height="${H / 3}" fill="${b}"/><rect y="${H * 2 / 3}" width="${W}" height="${H / 3 + 1}" fill="${c}"/>`,
    vband: `<rect width="${W / 3}" height="${H}" fill="${a}"/><rect x="${W / 3}" width="${W / 3}" height="${H}" fill="${b}"/><rect x="${W * 2 / 3}" width="${W / 3 + 1}" height="${H}" fill="${c}"/>`,
    cross: `<rect width="${W}" height="${H}" fill="${a}"/><rect x="56" width="26" height="${H}" fill="${b}"/><rect y="51" width="${W}" height="26" fill="${b}"/><rect x="63" width="12" height="${H}" fill="${c}"/><rect y="58" width="${W}" height="12" fill="${c}"/>`,
    canton: `<rect width="${W}" height="${H}" fill="${b}"/><rect width="${W}" height="${H / 2}" fill="${a}"/><rect width="86" height="68" fill="${c}"/>${star(43, 34, 22, b)}`,
    diagonal: `<rect width="${W}" height="${H}" fill="${a}"/><polygon points="0,${H} ${W},0 ${W},${H}" fill="${c}"/><polygon points="0,${H - 22} ${W - 33},0 ${W},0 ${W},22 33,${H} 0,${H}" fill="${b}" opacity="0.95"/>`,
    sun: `<rect width="${W}" height="${H}" fill="${a}"/>${[...Array(12)].map((_, i) => { const t = i * Math.PI / 6; return `<polygon points="96,64 ${(96 + Math.cos(t - .12) * 150).toFixed(1)},${(64 + Math.sin(t - .12) * 150).toFixed(1)} ${(96 + Math.cos(t + .12) * 150).toFixed(1)},${(64 + Math.sin(t + .12) * 150).toFixed(1)}" fill="${i % 2 ? b : a}"/>`; }).join('')}<circle cx="96" cy="64" r="30" fill="${c}"/><circle cx="96" cy="64" r="20" fill="${b}"/>`,
    chevron: `<rect width="${W}" height="${H}" fill="${a}"/><polygon points="0,0 80,64 0,${H}" fill="${b}"/><polygon points="0,18 56,64 0,${H - 18}" fill="${c}"/>`,
    'stripe-star': `${[...Array(7)].map((_, i) => `<rect y="${i * H / 7}" width="${W}" height="${H / 7 + 1}" fill="${i % 2 ? b : a}"/>`).join('')}<rect width="84" height="${H * 4 / 7}" fill="${c}"/>${star(42, 37, 20, b)}`,
  }[f?.pat] || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>`;
}
export const altFlagUrl = f => `data:image/svg+xml;utf8,${encodeURIComponent(altFlagSvg(f))}`;
export const flagSig = f => (f ? `${f.pat}${(f.c || []).join('')}` : '');

const PALETTE = ['#b3202a', '#1f4e9c', '#1e8a4c', '#f0c419', '#111111', '#f4f4f0', '#e07b1a', '#6a2c91', '#0e8a9b'];
export function randomFlag() {
  const pick = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];
  let c = [pick(), pick(), pick()]; while (new Set(c).size < 3) c = [pick(), pick(), pick()];
  return { pat: FLAG_PATTERNS[Math.floor(Math.random() * FLAG_PATTERNS.length)], c };
}
