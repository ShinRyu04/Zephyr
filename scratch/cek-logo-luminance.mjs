import { readFileSync } from 'node:fs';
const s = readFileSync('src/components/terminal/logoMerek.ts', 'utf8');
const m = [...s.matchAll(/'([a-z0-9-]+)':\s*\{\s*title: "([^"]+)",\s*hex: '(#[0-9a-fA-F]{6})',\s*path: "([^"]+)"/g)];
for (const x of m) {
  const hex = x[3];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  console.log(`${x[1].padEnd(12)} ${hex}  lum=${lum.toFixed(1).padStart(6)}  pathLen=${String(x[4].length).padStart(5)}  ${x[2]}`);
}
