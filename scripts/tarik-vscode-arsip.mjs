import { writeFileSync, existsSync } from 'node:fs';

const OUT = process.env.LOCALAPPDATA + '\\Temp\\vscode-archive.json';

// Versi kunci: fondasi 2018-2020, kematangan 2021-2022, AI 2023-2026
const VERSI = [];
// 2018: 1.19-1.30
for (let v = 19; v <= 30; v++) VERSI.push(`v1_${String(v).padStart(2, '0')}`);
// 2019-2020: 1.31-1.52
for (let v = 31; v <= 52; v++) VERSI.push(`v1_${v}`);
// 2021-2022: 1.53-1.74
for (let v = 53; v <= 74; v++) VERSI.push(`v1_${v}`);
// 2023-2024: 1.75-1.96
for (let v = 75; v <= 96; v++) VERSI.push(`v1_${v}`);
// 2025-2026: 1.97-1.132
for (let v = 97; v <= 132; v++) VERSI.push(`v1_${v}`);

const hasil = [];

for (const slug of VERSI) {
  const url = `https://code.visualstudio.com/updates/${slug}`;
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (research)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) { continue; }
    const html = await r.text();

    // judul versi
    const tJudul = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? slug;

    // Paragraf + list item
    const bersih = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

    const baris = bersih
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 12 && s.length < 400);

    // Ambil yang mengandung kata kunci fitur (buang navigasi/versi)
    const kata = /\b(api|editor|terminal|git|debug|search|extension|theme|setting|command|remote|notebook|live share|profile|sync|timeline|codebase|symbol|refactor|format|test|container|docker|virtual|workspace|snippet|emmet|task|problem|multi-cursor|multi-root|breadcrumb|minimap|outline|task|chat|ai|copilot|agent|voice|model|mcp|prompt|diff|merge|stash|blame)\b/i;
    const nav = /^(Downloads|Version|Previous|Next|See also|Read more|Learn more|Windows|Linux|macOS|Code of Conduct|Privacy|Terms|Sponsor|Resources|Community|GitHub|Microsoft|Azure|Visual Studio|Java|Python|Insiders|Questions|Feedback|Report|Update|Subscribe|News|Archive|April|May|June|July|August|September|October|November|December|January|February|March|Monday|Tuesday|Wednesday|Thursday|Friday|Week|All rights|Patents|Terms of Use|Trademark|Third-party|Microsoft Visual Studio|Additional information|Get started|Download now|Extension|Themes|Snippets|Blog|Stack Overflow|GitHub Issues|Twitter)\s*$/i;

    const fitur = [...new Set(baris.filter(b => kata.test(b) && !nav.test(b)))].slice(0, 40);

    if (fitur.length) hasil.push({ slug, judul: tJudul, fitur });
    process.stdout.write('.');
  } catch {
    process.stdout.write('x');
  }
}

writeFileSync(OUT, JSON.stringify(hasil, null, 1), 'utf8');
console.log('\n\nTersimpan:', hasil.length, 'versi →', OUT);
console.log('Total butir fitur:', hasil.reduce((a, b) => a + b.fitur.length, 0));
