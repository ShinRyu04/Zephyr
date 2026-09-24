// terjemah-otomatis.mjs — terjemahkan teks Indonesia ke sembilan bahasa.
//
// Memakai MyMemory (gratis, tanpa API key) dengan batas harian; hasilnya
// disimpan bertahap ke %LOCALAPPDATA%\Temp\terjemahan-otomatis.json supaya
// proses bisa dilanjutkan kalau berhenti di tengah.
//
// Jalankan: node scripts/terjemah-otomatis.mjs [jumlah]

import fs from 'node:fs';
import path from 'node:path';

const TMP = path.join(process.env.LOCALAPPDATA ?? '.', 'Temp');
const MASUK = path.join(TMP, 'indo-belum.json');
const KELUAR = path.join(TMP, 'terjemahan-otomatis.json');

/** Kode bahasa MyMemory memakai ISO 639-1; ini pemetaan ke kode aplikasi. */
const BAHASA = {
  en: 'en', ja: 'ja', ko: 'ko', zh: 'zh-CN', es: 'es', fr: 'fr', de: 'de', pt: 'pt', ar: 'ar',
};

const batas = Number(process.argv[2] ?? 200);
const sumber = JSON.parse(fs.readFileSync(MASUK, 'utf8'));

// Lanjutkan dari hasil sebelumnya kalau ada.
const hasil = fs.existsSync(KELUAR) ? JSON.parse(fs.readFileSync(KELUAR, 'utf8')) : {};
let dikerjakan = 0;
let gagal = 0;

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Terjemahkan satu teks ke satu bahasa.
 *
 * MyMemory menolak permintaan yang terlalu panjang (batas ~500 byte), jadi
 * teks panjang dipotong per kalimat dan disambung kembali.
 */
async function terjemah(teks, kode) {
  const potongan = teks.length > 480 ? teks.match(/[^.!?]+[.!?]?\s*/g) ?? [teks.slice(0, 480)] : [teks];
  const bagian = [];
  for (const p of potongan) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(p.slice(0, 480))}&langpair=id|${kode}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const t = j?.responseData?.translatedText;
    if (!t || /QUERY LENGTH LIMIT|MYMEMORY WARNING/i.test(t)) throw new Error('kuota/limit');
    bagian.push(t);
    await tidur(120);
  }
  return bagian.join('');
}

for (const teks of sumber) {
  if (hasil[teks]) continue;
  if (dikerjakan >= batas) break;

  const per = { id: teks };
  let ok = true;
  for (const [kodeApp, kodeApi] of Object.entries(BAHASA)) {
    try {
      per[kodeApp] = await terjemah(teks, kodeApi);
    } catch (e) {
      console.log(`  GAGAL ${kodeApp}: ${teks.slice(0, 50)}… (${e.message})`);
      ok = false;
      if (/kuota|limit/i.test(e.message)) {
        console.log('\n  kuota harian habis — hasil sementara disimpan');
        fs.writeFileSync(KELUAR, JSON.stringify(hasil, null, 1));
        process.exit(2);
      }
      break;
    }
  }
  if (!ok) { gagal += 1; continue; }

  hasil[teks] = per;
  dikerjakan += 1;
  if (dikerjakan % 10 === 0) {
    fs.writeFileSync(KELUAR, JSON.stringify(hasil, null, 1));
    console.log(`  ${dikerjakan} selesai (${Object.keys(hasil).length} total)…`);
  }
}

fs.writeFileSync(KELUAR, JSON.stringify(hasil, null, 1));
console.log(`\n# selesai: +${dikerjakan} (gagal ${gagal})`);
console.log(`# total tersimpan: ${Object.keys(hasil).length} / ${sumber.length}`);
console.log(`# -> ${KELUAR}`);
