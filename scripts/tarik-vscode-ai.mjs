// tarik-vscode-ai.mjs — tarik release notes VS Code terbaru & saring fitur AI.
//
// Pakai:  node scripts/tarik-vscode-ai.mjs [mulai] [akhir]
//
// Format halaman berubah sejak 1.99: tidak ada lagi daftar bullet, highlight
// ditulis sebagai paragraf berjudul kategori. Skrip ini mengambil paragraf itu
// apa adanya lalu menyaring kalimat yang berbau AI.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MULAI = Number(process.argv[2] ?? 106);
const AKHIR = Number(process.argv[3] ?? 139);
const OUT = path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'vscode-ai.json');

const AI = /(agent|Agent|chat|Chat|Copilot|copilot|AI\b|language model|Language Model|LLM|MCP|prompt|Prompt|tool call|Tool|instruction|session|Session|model|Model|browser|Browser|skill|Skill|hook|Hook|context|Context|compaction|Fork|debug panel|terminal.*agent|agent.*terminal|inline suggestion|completion|semantic|reasoning|thinking|plan|Plan|BYOK|edit|Edit)/;

const hasil = [];

for (let n = MULAI; n <= AKHIR; n++) {
  const url = `https://code.visualstudio.com/updates/v1_${n}`;
  let html = '';
  try {
    html = execFileSync('curl', ['-sL', '--max-time', '25', url], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  } catch {
    console.log(`  1.${n} gagal`);
    continue;
  }
  if (!html || html.length < 5000) {
    console.log(`  1.${n} kosong`);
    continue;
  }

  let isi = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const m = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(isi);
  if (m) isi = m[1];
  isi = isi.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<');
  isi = isi.replace(/\s+/g, ' ').trim();

  const judul = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s+\(version\s+([\d.]+)\)/i.exec(isi);
  const rilis = /Release date:\s*([A-Z][a-z]+ \d+, \d{4})/i.exec(isi);

  // Blok highlight: dari "key highlights include:" ATAU dari kalimat "This release ..." sampai
  // "If you'd like to read" / "Insiders:"
  let blok = '';
  const h1 = /key highlights include:\s*/i.exec(isi);
  if (h1) {
    blok = isi.slice(h1.index + h1[0].length);
  } else {
    // Format 2026: highlight langsung setelah paragraf "This release ..."
    const h2 = /This release[^.]*\.\s*/i.exec(isi);
    if (h2) blok = isi.slice(h2.index + h2[0].length);
  }
  const akhir = blok.search(/If you'd like to read|Insiders:|release notes are arranged|Happy Coding|Downloads/i);
  if (akhir > 0) blok = blok.slice(0, akhir);
  blok = blok.trim().slice(0, 3000);

  // Pisah per kalimat, ambil yang berbau AI
  const kalimat = blok.split(/(?<=\.)\s+(?=[A-Z])/).map((s) => s.trim()).filter((s) => s.length > 15);
  const ai = kalimat.filter((s) => AI.test(s));

  hasil.push({
    versi: `1.${n}`,
    bulan: judul ? `${judul[1]} ${judul[2]}` : null,
    rilis: rilis ? rilis[1] : null,
    ai: ai.slice(0, 25),
  });

  console.log(`  1.${n}  ${String(judul ? judul[1] + ' ' + judul[2] : '?').padEnd(18)} ${ai.length} kalimat AI`);
}

fs.writeFileSync(OUT, JSON.stringify(hasil, null, 2), 'utf8');
console.log(`\n== ${hasil.length} versi → ${OUT} ==`);
