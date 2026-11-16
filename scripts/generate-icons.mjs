// Genera los iconos PNG de la PWA a partir de un SVG propio.
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

// Ticket con borde dentado y línea de escaneo sobre fondo verde.
function iconSvg({ size = 512, padding = 0, rounded = true }) {
  const s = 512;
  const inner = s - padding * 2;
  const k = inner / 512;
  const tx = padding;
  const r = rounded ? 112 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#17B986"/>
      <stop offset="1" stop-color="#0A6E4F"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" rx="${r}" fill="url(#bg)"/>
  <g transform="translate(${tx} ${tx}) scale(${k})">
    <path d="M150 96 h212 a18 18 0 0 1 18 18 v284 l-26 -18 -26 18 -26 -18 -26 18 -26 -18 -26 18 -26 -18 -26 18 -26 -18 -26 18 v-284 a18 18 0 0 1 18 -18z" fill="#FFFFFF"/>
    <rect x="182" y="150" width="148" height="18" rx="9" fill="#0E1726" opacity="0.85"/>
    <rect x="182" y="196" width="96" height="14" rx="7" fill="#9AA3B2"/>
    <rect x="296" y="196" width="34" height="14" rx="7" fill="#9AA3B2"/>
    <rect x="182" y="230" width="110" height="14" rx="7" fill="#9AA3B2"/>
    <rect x="304" y="230" width="26" height="14" rx="7" fill="#9AA3B2"/>
    <rect x="182" y="264" width="80" height="14" rx="7" fill="#9AA3B2"/>
    <rect x="296" y="264" width="34" height="14" rx="7" fill="#9AA3B2"/>
    <rect x="182" y="312" width="70" height="18" rx="9" fill="#0B8A61"/>
    <rect x="282" y="312" width="48" height="18" rx="9" fill="#0B8A61"/>
    <rect x="112" y="240" width="288" height="10" rx="5" fill="#34E0A8" opacity="0.9"/>
  </g>
</svg>`;
}

const tasks = [
  ['icon-192.png', 192, iconSvg({ rounded: false })],
  ['icon-512.png', 512, iconSvg({ rounded: false })],
  ['maskable-512.png', 512, iconSvg({ rounded: false, padding: 64 })],
  ['apple-touch-icon.png', 180, iconSvg({ rounded: false })],
];

for (const [name, size, svg] of tasks) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(out, name));
}
writeFileSync(join(root, 'public', 'favicon.svg'), iconSvg({ size: 64 }));
console.log('Iconos generados en public/icons');
