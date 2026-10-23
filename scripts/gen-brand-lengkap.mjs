// Lengkapi src/lib/modelBrandIcons.ts dengan semua keluarga model.
//
// Urutan sumber per keluarga:
//   1. simple-icons (lokal, CC0) — mark resmi.
//   2. @lobehub/icons-static-svg (CDN) — pelengkap yang tidak ada di (1).
//
// Yang tidak punya mark resmi sama sekali dibiarkan tanpa entri: pemanggil
// memakai mark inisial (lihat MARK_INISIAL di bawah), yang tetap memberi tiap
// baris penanda sendiri tanpa mengarang logo perusahaan.
//
// Jalankan: node scripts/gen-brand-lengkap.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = join(akar, 'src/lib/modelBrandIcons.ts');
const dirSimple = join(akar, 'node_modules/simple-icons/icons');
/*
 * 1.98.0, bukan 1.95.1: varian `-color` untuk beberapa merek (Google, AWS,
 * Azure, Kimi, Novita, PPIO, SiliconCloud, Volcengine, Alibaba Cloud) baru
 * lengkap di versi ini. Ikon-ikon itu yang membuat daftar provider terbaca
 * seperti daftar merek, bukan deretan siluet satu warna.
 */
const VERSI_LOBE = '1.98.0';

/*
 * Keluarga -> sumber + warna merek.
 *
 * `warna: null` = merek monokrom; mark mengikuti warna teks sekitarnya supaya
 * terbaca di tema terang maupun gelap.
 */
const PETA = {
  gemini: { simple: 'googlegemini', warna: '#8E75B2' },
  /*
   * Baris "Google" di daftar provider memakai mark Google, bukan sparkle
   * Gemini: itu yang dikenali pembaca sebagai perusahaannya (dan yang dipakai
   * acuan TRAE). Sparkle tetap milik keluarga model `gemini`.
   */
  google: { lobe: 'google', color: true, warna: '#4285F4' },
  claude: { simple: 'claude', warna: '#D97757' },
  /* Anthropic bukan Claude: perusahaan memakai "A\\" putih, produknya bintang
     oranye. Dulu baris Anthropic memakai mark Claude — merek yang salah. */
  anthropic: { simple: 'anthropic', warna: null },
  gpt: { lobe: 'openai', warna: null },
  deepseek: { simple: 'deepseek', warna: '#4D6BFE' },
  grok: { simple: 'x', warna: null },
  llama: { simple: 'meta', warna: '#0866FF' },
  mistral: { simple: 'mistralai', warna: '#FA520F' },
  qwen: { simple: 'qwen', warna: '#615CED' },
  kimi: { lobe: 'kimi', color: true, warna: '#1783FF' },
  ollama: { simple: 'ollama', warna: null },
  lmstudio: { simple: 'lmstudio', warna: null },
  huggingface: { simple: 'huggingface', warna: '#FFD21E' },
  perplexity: { simple: 'perplexity', warna: '#1FB8CD' },
  copilot: { lobe: 'githubcopilot', warna: null },
  glm: { lobe: 'zhipu', warna: '#3859FF' },
  /* Z.ai dan Bigmodel memakai mark Z.ai sendiri (huruf Z), bukan logo GLM
     berbentuk titik-titik: dua provider itu menjual model GLM, perusahaannya
     Z.ai. Acuan TRAE juga memakai Z. */
  zai: { lobe: 'zai', warna: null },
  gitee: { simple: 'gitee', warna: '#C71D23' },
  gmicloud: { lobe: 'gmicloud', warna: '#00C58E' },
  /* BytePlus tidak punya mark di simple-icons maupun LobeHub. Yang tersedia
     mark induknya (ByteDance), jadi itu yang dipakai — lebih baik daripada
     logo Doubao (moon) yang selama ini dipinjam dan menyesatkan. */
  byteplus: { simple: 'bytedance', warna: '#2E62F6' },
  volcengine: { lobe: 'volcengine', color: true, warna: '#1664FF' },
  alibabacloud: { lobe: 'alibabacloud', color: true, warna: '#FF6A00' },
  aws: { lobe: 'aws', color: true, warna: '#FF9900' },
  minimax: { lobe: 'minimax', warna: '#EE3D5C' },
  nvidia: { lobe: 'nvidia', warna: '#76B900' },
  tencent: { lobe: 'hunyuan', warna: null },
  /* Tencent Cloud memakai mark perusahaannya sendiri, bukan Hunyuan (itu nama
     model di dalamnya). Baris "Tencent Cloud" dulu memakai logo Hunyuan —
     bentuk P berputar yang terbaca sebagai merek lain. */
  tencentcloud: { lobe: 'tencentcloud', warna: '#0052D9' },
  bytedance: { lobe: 'doubao', warna: '#325AB4' },
  longcat: { lobe: 'longcat', warna: null },
  mimo: { lobe: 'xiaomimimo', warna: '#FF6900' },
  stepfun: { lobe: 'stepfun', warna: null },
  baidu: { lobe: 'wenxin', warna: '#2932E1' },
  spark: { lobe: 'spark', warna: '#0070F0' },
  yi: { lobe: 'yi', warna: null },
  baichuan: { lobe: 'baichuan', warna: null },
  together: { lobe: 'together', warna: null },
  groq: { lobe: 'groq', warna: '#F55036' },
  cerebras: { lobe: 'cerebras', warna: '#F15A29' },
  openrouter: { simple: 'openrouter', warna: null },
  azure: { lobe: 'azure', color: true, warna: '#0078D4' },
  bedrock: { lobe: 'bedrock', warna: null },
  vertexai: { lobe: 'vertexai', warna: '#4285F4' },
  antgroup: { lobe: 'antgroup', warna: '#1677FF' },
  siliconcloud: { lobe: 'siliconcloud', color: true, warna: '#6E29F6' },
  novita: { lobe: 'novita', color: true, warna: '#23D57C' },
  ppio: { lobe: 'ppio', color: true, warna: '#4B5BFF' },
  vercel: { simple: 'vercel', warna: null },
  fireworks: { lobe: 'fireworks', warna: null },
  inclusionai: { lobe: 'inclusionai', warna: null },
};

/*
 * Satu mark bisa terdiri dari BEBERAPA path.
 *
 * simple-icons selalu satu path monokrom, tapi varian `-color` LobeHub
 * menggambar huruf G Google dari empat path berwarna, Kimi dari dua, dan Azure
 * dengan gradient. Mark seperti itu tidak bisa diringkas jadi satu `d` tanpa
 * kehilangan justru bagian yang membuatnya dikenali. Jadi parser mengembalikan
 * SEMUA path beserta `fill` miliknya, dan generator memutuskan apakah hasilnya
 * perlu disimpan sebagai berlapis (`lapis`) atau cukup satu path + warna merek.
 */
function lapisDariSvg(svg) {
  const hasil = [];
  for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
    const atr = m[1];
    const d = /(?:^|\s)d="([^"]+)"/.exec(atr)?.[1];
    if (!d) continue;
    const fill = /(?:^|\s)fill="([^"]+)"/.exec(atr)?.[1] ?? null;
    hasil.push({ d, warna: fill && /^#[0-9a-fA-F]{3,8}$/.test(fill) ? fill : null });
  }
  if (!hasil.length) throw new Error('tidak ada path');
  return hasil;
}

function lapisDariSimple(nama) {
  return lapisDariSvg(readFileSync(join(dirSimple, `${nama}.svg`), 'utf8'));
}

async function lapisDariLobe(nama, color) {
  const berkas = color ? `${nama}-color` : nama;
  const url = `https://unpkg.com/@lobehub/icons-static-svg@${VERSI_LOBE}/icons/${berkas}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} (${berkas})`);
  return lapisDariSvg(await res.text());
}

/**
 * Ringkas lapis-lapis path jadi satu entri mark.
 *
 * Aturan:
 * - lebih dari satu path DAN ada path yang membawa warnanya sendiri → simpan
 *   semua lapis, biarkan renderer memakai warna masing-masing (Google, Kimi,
 *   Alibaba Cloud);
 * - selain itu satu path sudah cukup: warnanya dari tabel PETA, atau dari
 *   `fill` path itu sendiri kalau varian berwarnanya cuma satu path (Novita).
 */
function ringkas(lapis, warnaMerek) {
  /*
   * Lebih dari satu path SELALU disimpan seluruhnya — termasuk mark monokrom
   * dua path (GMI Cloud, SiliconCloud). Dulu syaratnya "dan ada path yang
   * berwarna", sehingga mark seperti itu kehilangan separuh bentuknya dan
   * hanya menyisakan potongan pertama. Lapis tanpa warna sendiri memakai warna
   * merek di renderer, jadi tidak ada yang hilang.
   */
  if (lapis.length > 1) {
    const warna = warnaMerek ?? lapis.find((l) => l.warna)?.warna ?? null;
    return { d: lapis[0].d, warna, lapis };
  }
  return { d: lapis[0].d, warna: warnaMerek ?? lapis[0].warna ?? null };
}

const entri = {};
const gagal = [];

for (const [fam, src] of Object.entries(PETA)) {
  try {
    const lapis = src.simple
      ? lapisDariSimple(src.simple)
      : await lapisDariLobe(src.lobe, Boolean(src.color));
    entri[fam] = ringkas(lapis, src.warna ?? null);
  } catch (e) {
    gagal.push(`${fam}: ${e.message}`);
  }
}

const baris = Object.entries(entri).map(([fam, { d, warna, lapis }]) => {
  const dasar = `  ${fam}: {\n    d: '${d}',\n    warna: ${warna ? `'${warna}'` : 'null'},`;
  if (!lapis) return `${dasar}\n  },`;
  const isiLapis = lapis
    .map((l) => `      { d: '${l.d}', warna: ${l.warna ? `'${l.warna}'` : 'null'} },`)
    .join('\n');
  return `${dasar}\n    lapis: [\n${isiLapis}\n    ],\n  },`;
});

const isi = `// GENERATED by scripts/gen-brand-lengkap.mjs - jangan diedit manual.
//
// Mark merek resmi untuk keluarga model di katalog. Path diambil dari
// simple-icons (CC0) dan @lobehub/icons-static-svg; keduanya 24x24 sehingga
// semua mark berbagi satu viewBox dan berskala bersih.
//
// \`warna: null\` memang disengaja, bukan data hilang: merek itu digambar satu
// warna netral dan terlihat salah kalau diwarnai.

export interface BrandMark {
  /** Path pertama. Mark satu warna hanya memakai ini. */
  d: string;
  /** Warna merek, atau null untuk mengikuti warna teks sekitarnya. */
  warna: string | null;
  /**
   * Mark berlapis (logo penuh warna seperti Google, Kimi, Alibaba Cloud).
   *
   * Tiap lapis boleh membawa warnanya sendiri (warna: null = pakai warna
   * merek/sisa teks). Kalau ada, renderer menggambar SEMUA lapis dan d di
   * atas hanya menjadi lapis pertama untuk pemakaian yang butuh satu path.
   */
  lapis?: { d: string; warna: string | null }[];
}

export const BRAND_MARKS: Record<string, BrandMark> = {
${baris.join('\n')}
};
`;

writeFileSync(P, isi, 'utf8');
console.log(`  ${Object.keys(entri).length} mark ditulis`);
if (gagal.length) console.log(`  gagal: ${gagal.join(' | ')}`);
