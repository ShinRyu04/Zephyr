import { writeFileSync } from 'node:fs';

const OUT = process.env.LOCALAPPDATA + '\\Temp\\vscode-fitur.json';

const VERSI = [];
for (let v = 19; v <= 132; v++) VERSI.push(v);

const hasil = [];

for (const v of VERSI) {
  const slug = `v1_${v}`;
  const url = `https://code.visualstudio.com/updates/${slug}`;
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) continue;
    const html = await r.text();

    const judul = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? slug;

    // 1) Heading level 2/3 = nama section fitur (Workbench, Editor, Debugging, ...)
    const sections = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
      .filter(s => s && s.length < 45 && !/Downloads|See also|Read more/i.test(s));

    // 2) Bullet yang diawali <strong> = nama fitur ("**Indent guides** - Helps ...")
    const bullets = [...html.matchAll(/<li>\s*<strong>([^<]{3,70})<\/strong>\s*[-–—]?\s*([^<]{0,240})/gi)]
      .map(m => ({
        nama: m[1].trim(),
        ket: m[2].trim().replace(/\s+/g, ' '),
      }))
      .filter(b => b.nama.length >= 4);

    // 3) "key highlights include:" — daftar fitur utama
    const highlights = [];
    const idx = html.search(/key highlights include/i);
    if (idx > 0) {
      const blok = html.slice(idx, idx + 3500);
      for (const m of blok.matchAll(/<strong>([^<]{3,70})<\/strong>\s*[-–—]?\s*([^<]{0,180})/gi)) {
        highlights.push({ nama: m[1].trim(), ket: m[2].trim().replace(/\s+/g, ' ') });
      }
    }

    hasil.push({ v, slug, judul, sections: [...new Set(sections)], bullets, highlights });
    process.stdout.write('.');
  } catch {
    process.stdout.write('x');
  }
}

writeFileSync(OUT, JSON.stringify(hasil, null, 1), 'utf8');
const totB = hasil.reduce((a, b) => a + b.bullets.length, 0);
const totH = hasil.reduce((a, b) => a + b.highlights.length, 0);
console.log(`\n\nversi: ${hasil.length} | bullets: ${totB} | highlights: ${totH}`);
console.log('→', OUT);
