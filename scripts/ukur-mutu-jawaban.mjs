/*
 * UKUR-MUTU-JAWABAN - rubrik mutu jawaban Zeph yang MENOLAK mengaku lulus
 * ketika tidak ada bukti jawaban (item 156 + 161 + 149).
 *
 * Aturan dasar skrip ini:
 *   1. Yang diukur hanya JAWABAN TERSIMPAN di `docs/uji-jawaban/*.md`.
 *      Jawaban tidak pernah dikarang di sini - kalau berkasnya tidak ada,
 *      skrip ini mencetak TIDAK DIUJI dan keluar dengan kode 2.
 *   2. Setiap butir yang butuh jaringan/provider nyata tetapi tidak punya
 *      berkas jawaban dicetak TIDAK DIUJI, bukan "lulus".
 *   3. Verdict LULUS hanya keluar kalau ADA berkas jawaban dan semua butir
 *      yang bisa diukur lolos.
 *   4. `--uji-alat` menguji ALATNYA sendiri: contoh jawaban (fixture, bukan
 *      jawaban provider) dimasukkan supaya terbukti rubrik ini benar-benar
 *      menangkap jawaban buruk, bukan cap kosong.
 *
 * YANG BARU (v2):
 *   - 12 PERTANYAAN ACUAN tentang Zephyr sendiri (angka indeks, lokasi berkas,
 *     cara buka Settings, apa yang baru, bentuk tabel) - lihat `--acuan`.
 *   - Harapan setiap acuan DIVERIFIKASI dulu terhadap data repo nyata
 *     (FAKTA_ZEPHYR + FAKTA_INDEKS, diimpor apa adanya dari src/lib). Kalau
 *     sebuah harapan tidak ter-grounding di data itu, skrip menandai RUBRIK
 *     CACAT - bukan menuduh Zeph salah.
 *   - R7 angka indeks : jawaban wajib memuat angka yang benar dari indeks.
 *   - R8 klaim nilai  : `src/lib/pembungkusBahasa.ts` (murni) memindai port/versi
 *                       yang tidak ada di fakta = angka karangan.
 *   - `--uji-klaim-nilai` menguji modul murni itu tanpa app, tanpa model.
 *
 * Cara menyediakan bukti (jalur yang jujur, tidak boleh pakai mock yang
 * mengarang jawaban):
 *   1. Jalankan app Zephyr dengan CDP (lihat scripts/jalankan-zephyr.cmd),
 *      lalu `node scripts/cek-pengetahuan-2lapis.mjs`.
 *   2. Salin blok `--- jawaban Zeph ---` ke berkas baru di `docs/uji-jawaban/`
 *      berikut metadatanya:
 *
 *        <!-- acuan: A1 -->
 *        <!-- pertanyaan: berapa port bawaan MCP -->
 *        <!-- diminta: -->
 *        <!-- bahasa: id -->
 *        <!-- gaya: short -->
 *        <!-- sumber: app-live -->
 *
 *        <isi jawaban apa adanya>
 *
 * Jalan:
 *   node scripts/ukur-mutu-jawaban.mjs                    # ukur docs/uji-jawaban/
 *   node scripts/ukur-mutu-jawaban.mjs --acuan            # daftar 12 pertanyaan acuan
 *   node scripts/ukur-mutu-jawaban.mjs --uji-alat         # uji rubriknya sendiri
 *   node scripts/ukur-mutu-jawaban.mjs --uji-klaim-nilai  # uji modul murni
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AKAR = path.resolve(import.meta.dirname, '..');
const MAP_Jawaban = path.join(AKAR, 'docs', 'uji-jawaban');

const KATA_ID = /\b(yang|dan|dengan|tidak|untuk|adalah|berkas|setelan|jendela|dari|ini|bisa|atau|pada|kalau|sudah|akan|bawah|atas|kanan|kiri|jalankan|jalur|jawaban)\b/gi;
const KATA_EN = /\b(the|and|with|not|for|is|are|file|files|settings|window|from|this|can|or|on|if|already|will|below|above|right|left|run|path|answer|value|list|table)\b/gi;

const MARKA_RAHASIA = [/\bsk-[A-Za-z0-9_-]{12,}/, /\bghp_[A-Za-z0-9]{20,}/, /\bAKIA[0-9A-Z]{12,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bapi[_-]?key\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i];

/* ------------------------------------------------------------------ *
 * 12 pertanyaan acuan tentang Zephyr sendiri.
 * Setiap `harap` WAJIB ditemukan di data repo nyata (FAKTA_ZEPHYR atau
 * FAKTA_INDEKS) sebelum dipakai menilai - lihat `periksaGrounding()`.
 * `harapDariIndeks` DIHITUNG dari jumlah entri indeks, bukan angka hafalan.
 * ------------------------------------------------------------------ */
const ACUAN = [
  {
    id: 'A1',
    jenis: 'angka indeks',
    pertanyaan: 'Berapa port bawaan server MCP Zephyr, dan port mana yang dicadangkan untuk debug WebView2/CDP?',
    harap: ['9222', '9223'],
    diminta: '',
  },
  {
    id: 'A2',
    jenis: 'angka + lokasi berkas',
    pertanyaan: 'Port berapa dev server UI Zephyr jalan, dan dari berkas mana nilainya datang?',
    harap: ['5173', 'vite.config.ts'],
    diminta: '',
  },
  {
    id: 'A3',
    jenis: 'angka setelan',
    pertanyaan: 'Berapa nilai bawaan agents.maxPanes, dan di grup setelan mana kunci itu?',
    harap: ['maxPanes', '6', 'agents'],
    diminta: '',
  },
  {
    id: 'A4',
    jenis: 'lokasi berkas',
    pertanyaan: 'Di jalur mana setelan global Zephyr disimpan, dan apa nama berkasnya?',
    harap: ['settings.json', '%APPDATA%'],
    diminta: '',
  },
  {
    id: 'A5',
    jenis: 'cara buka Settings',
    pertanyaan: 'Bagaimana cara user membuka halaman Settings di Zephyr, dan lewat pintasan apa?',
    harap: ['Ctrl+,'],
    diminta: '',
  },
  {
    id: 'A6',
    jenis: 'apa yang baru',
    pertanyaan: 'Versi Zephyr yang sedang berjalan berapa, dan di mana user bisa melihatnya sendiri?',
    harap: ['1.1.13', 'About'],
    diminta: '',
  },
  {
    id: 'A7',
    jenis: 'jumlah tool',
    pertanyaan: 'Berapa banyak tool yang dibawa Zephyr, dan bagaimana user melihat daftarnya dari dalam app?',
    harap: ['zephyr_self'],
    harapDariIndeks: { kategori: 'tool' },
    diminta: '',
  },
  {
    id: 'A8',
    jenis: 'jumlah setelan + pintasan',
    pertanyaan: 'Berapa kunci setelan dan berapa pintasan bawaan yang dibawa Zephyr?',
    harap: ['124', '34'],
    diminta: '',
  },
  {
    id: 'A9',
    jenis: 'tabel',
    pertanyaan: 'Buat tabel perbandingan port Zephyr: MCP, CDP WebView2, dan dev server UI (kolom nama + nomor port).',
    harap: ['9222', '9223', '5173'],
    diminta: 'tabel',
  },
  {
    id: 'A10',
    jenis: 'daftar + cara buka Settings',
    pertanyaan: 'Sebutkan langkah-langkah mengganti bahasa jawaban AI Zephyr, mulai dari membuka Settings.',
    harap: ['Ctrl+,', 'answerLang'],
    diminta: 'daftar',
  },
  {
    id: 'A11',
    jenis: 'tabel',
    pertanyaan: 'Buat tabel tab panel bawah Zephyr beserta status tampil bawaannya.',
    harap: ['terminal', 'problems', 'output', 'debug', 'ports', 'ai', 'subagents'],
    diminta: 'tabel',
  },
  {
    id: 'A12',
    jenis: 'negatif (anti-karangan)',
    pertanyaan: 'Apakah Zephyr punya kunci setelan bernama mcp.host, dan berapa nilai bawaannya?',
    harap: [],
    // Kontrol negatif: jawaban benar HANYA kalau tidak mengarang nilai untuk
    // kunci yang (diverifikasi) tidak ada di indeks setelan.
    larangNilai: /mcp\.host\s*[=:]\s*\S+/i,
    kunciTidakAda: 'mcp.host',
    diminta: '',
  },
];

/* ------------------------------------------------------------------ *
 * Data ground-truth: diimpor dari src/lib APA ADANYA.
 * Node di sini (v26) membuang tipe TS sendiri, jadi modul yang sama dengan
 * yang dibundel aplikasi yang dipakai - bukan salinan angka di skrip ini.
 * ------------------------------------------------------------------ */
async function muatGround() {
  const fakta = await import(pathToFileURL(path.join(AKAR, 'src/lib/zephyrFakta.ts')).href);
  const indeks = await import(pathToFileURL(path.join(AKAR, 'src/lib/zephyrIndeks.ts')).href);
  const pbb = await import(pathToFileURL(path.join(AKAR, 'src/lib/pembungkusBahasa.ts')).href);
  return { fakta, indeks, pbb };
}

function korpusGround(g) {
  const bagian = [g.fakta.FAKTA_ZEPHYR || ''];
  for (const entri of g.indeks.FAKTA_INDEKS || []) bagian.push(String(entri[1] ?? ''), String(entri[2] ?? ''));
  bagian.push(readFileSync(path.join(AKAR, 'src/lib/zephyrIndeks.ts'), 'utf8'));
  return bagian.join('\n');
}

function hitungKategori(g, kategori) {
  return (g.indeks.FAKTA_INDEKS || []).filter((e) => e[0] === kategori).length;
}

/** Cek bahwa harapan tiap acuan benar-benar ada di data repo. */
function periksaGrounding(g, korpus) {
  const laporan = [];
  for (const a of ACUAN) {
    const wajib = [...(a.harap || [])];
    const kurang = wajib.filter((t) => !korpus.includes(t));
    let nilaiIndeks = null;
    if (a.harapDariIndeks) {
      nilaiIndeks = hitungKategori(g, a.harapDariIndeks.kategori);
      if (!nilaiIndeks) kurang.push(`indeks kategori '${a.harapDariIndeks.kategori}' kosong`);
    }
    if (a.kunciTidakAda) {
      const ada = (g.indeks.FAKTA_INDEKS || []).some((e) => e[0] === 'setelan' && String(e[1]).includes(a.kunciTidakAda));
      if (ada) kurang.push(`kontrol negatif batal: '${a.kunciTidakAda}' ADA di indeks setelan`);
    }
    laporan.push({ acuan: a, kurang, nilaiIndeks, wajib });
  }
  return laporan;
}

function cetakAcuan(laporan) {
  console.log('12 PERTANYAAN ACUAN (item 156) - acuan tetap untuk jawaban tentang Zephyr sendiri');
  console.log('Harapan tiap acuan diverifikasi ke data repo nyata (zephyrFakta.ts + zephyrIndeks.ts).');
  console.log('');
  let cacat = 0;
  for (const { acuan, kurang, nilaiIndeks, wajib } of laporan) {
    const harapCetak = [...wajib];
    if (nilaiIndeks != null) harapCetak.push(`${nilaiIndeks} (dihitung dari indeks kategori '${acuan.harapDariIndeks.kategori}')`);
    if (acuan.larangNilai) harapCetak.push(`TIDAK boleh mengarang nilai ${acuan.kunciTidakAda}`);
    const status = kurang.length ? 'RUBRIK CACAT' : 'TER-GROUNDING';
    if (kurang.length) cacat++;
    console.log(`  ${acuan.id} [${acuan.jenis}] ${status}`);
    console.log(`      tanya : ${acuan.pertanyaan}`);
    console.log(`      harap : ${harapCetak.join(' | ') || '(kontrol negatif)'}`);
    if (kurang.length) console.log(`      kurang: ${kurang.join('; ')} - perbaiki rubrik, JANGAN salahkan Zeph`);
    console.log(`      status: TIDAK DIUJI (butuh jawaban model nyata di docs/uji-jawaban/)`);
  }
  console.log('');
  console.log(`  RINGKAS: ${ACUAN.length} acuan | ${ACUAN.length - cacat} ter-grounding | ${cacat} cacat rubrik`);
  console.log('  Butir mana pun yang butuh jawaban model tetap TIDAK DIUJI sampai ada berkas bukti.');
  return cacat;
}

/* ------------------------------------------------------------------ *
 * Util
 * ------------------------------------------------------------------ */
function muatBerkasJawaban(jalur) {
  const isi = readFileSync(jalur, 'utf8');
  const meta = {};
  let badan = isi;
  const barisMeta = [];
  for (const baris of isi.split(/\r?\n/)) {
    const m = baris.match(/^\s*<!--\s*([a-zA-Z-]+)\s*:\s*(.*?)\s*-->\s*$/);
    if (m) {
      meta[m[1].toLowerCase()] = m[2];
      barisMeta.push(baris);
    }
  }
  for (const baris of barisMeta) badan = badan.replace(baris, '');
  badan = badan.replace(/^#[^\n]*\n/, '').trim();
  return { meta, badan, jalur: path.relative(AKAR, jalur).split(path.sep).join('/') };
}

const adaTabelGfm = (teks) => {
  const baris = teks.split(/\r?\n/);
  for (let i = 0; i < baris.length - 1; i++) {
    const a = baris[i];
    const b = baris[i + 1];
    if (a.includes('|') && /^\s*\|?[\s:|-]*-[\s:|-]*\|?[\s:|-]*$/.test(b) && (b.match(/-/g) || []).length >= 3) return true;
  }
  return false;
};
const hitungButirDaftar = (teks) => teks.split(/\r?\n/).filter((b) => /^\s*([-*]|\d+\.)\s+\S/.test(b)).length;

/* ------------------------------------------------------------------ *
 * Rubrik
 * ------------------------------------------------------------------ */
function ukurJawaban({ meta, badan, jalur }, ground) {
  const hasil = [];
  const diminta = (meta.diminta || '').toLowerCase();
  const bahasa = (meta.bahasa || '').toLowerCase();

  const kata = badan.split(/\s+/).filter(Boolean).length;
  if (kata < 20) {
    hasil.push(['TIDAK DIUJI', 'R1 bahasa', `jawaban hanya ${kata} kata - terlalu pendek untuk menilai bahasa`]);
  } else {
    const id = (badan.match(KATA_ID) || []).length;
    const en = (badan.match(KATA_EN) || []).length;
    if (en > id) {
      hasil.push(['MERAH', 'R1 bahasa', `minta '${bahasa || 'ikuti user'}' tapi penanda Inggris (${en}) > Indonesia (${id}) - jawaban beralih bahasa`]);
    } else {
      hasil.push(['LULUS', 'R1 bahasa', `penanda Indonesia ${id} vs Inggris ${en}`]);
    }
  }

  if (diminta.includes('tabel')) {
    hasil.push(adaTabelGfm(badan) ? ['LULUS', 'R2 tabel markdown', 'ada baris tabel + baris pemisah'] : ['MERAH', 'R2 tabel markdown', 'diminta tabel, jawaban tidak memuat tabel markdown']);
  } else {
    hasil.push(['TIDAK DIUJI', 'R2 tabel markdown', `pertanyaan tidak minta tabel (diminta='${diminta}')`]);
  }

  if (diminta.includes('daftar') || diminta.includes('list')) {
    const n = hitungButirDaftar(badan);
    hasil.push(n >= 3 ? ['LULUS', 'R3 daftar', `${n} butir`] : ['MERAH', 'R3 daftar', `diminta daftar, hanya ${n} butir`]);
  } else {
    hasil.push(['TIDAK DIUJI', 'R3 daftar', `pertanyaan tidak minta daftar (diminta='${diminta}')`]);
  }

  const jalurDisebut = [...new Set((badan.match(/(?:src|scripts|docs|src-tauri)\/[A-Za-z0-9_./-]+/g) || []))];
  if (!jalurDisebut.length) {
    hasil.push(['TIDAK DIUJI', 'R4 sitasi jalur', 'jawaban tidak menyebut jalur berkas - tidak ada yang bisa diverifikasi']);
  } else {
    const adaDiDisk = jalurDisebut.filter((p) => existsSync(path.join(AKAR, p)));
    const palsu = jalurDisebut.filter((p) => !existsSync(path.join(AKAR, p)));
    if (palsu.length) {
      hasil.push(['MERAH', 'R4 sitasi jalur', `${palsu.length} jalur TIDAK ADA di disk: ${palsu.join(', ')}`]);
    } else {
      hasil.push(['LULUS', 'R4 sitasi jalur', `${adaDiDisk.length} jalur disebut, semuanya ada di disk`]);
    }
  }

  const rahasia = MARKA_RAHASIA.filter((r) => r.test(badan));
  hasil.push(rahasia.length ? ['MERAH', 'R5 rahasia', `${rahasia.length} pola rahasia terdeteksi (nilainya TIDAK dicetak, sesuai aturan)`] : ['LULUS', 'R5 rahasia', 'tidak ada pola kunci/token']);

  if (meta.gaya) {
    const judul = badan.split(/\r?\n/).filter((b) => /^#{1,6}\s/.test(b)).length;
    const maks = meta.gaya === 'detail' ? 8 : 4;
    hasil.push(judul <= maks ? ['LULUS', 'R6 bentuk', `${judul} judul untuk gaya '${meta.gaya}'`] : ['MERAH', 'R6 bentuk', `${judul} judul > ${maks} untuk gaya '${meta.gaya}'`]);
  } else {
    hasil.push(['TIDAK DIUJI', 'R6 bentuk', 'metadata `gaya` tidak diisi']);
  }

  /* R7: angka yang benar dari indeks/fakta (butuh ground + metadata acuan). */
  const acuan = ACUAN.find((a) => a.id === (meta.acuan || '').trim());
  if (!ground) {
    hasil.push(['TIDAK DIUJI', 'R7 angka indeks', 'data ground (src/lib) tidak bisa dimuat - angka tidak bisa diverifikasi']);
  } else if (!acuan) {
    hasil.push(['TIDAK DIUJI', 'R7 angka indeks', `metadata 'acuan' tidak diisi/tidak dikenal ('${meta.acuan || ''}')`]);
  } else {
    const wajib = [...(acuan.harap || [])];
    if (acuan.harapDariIndeks) wajib.push(String(hitungKategori(ground, acuan.harapDariIndeks.kategori)));
    const hilang = wajib.filter((t) => !badan.includes(t));
    let status = hilang.length ? 'MERAH' : wajib.length ? 'LULUS' : 'TIDAK DIUJI';
    let pesan = hilang.length
      ? `acuan ${acuan.id}: ${wajib.length - hilang.length}/${wajib.length} nilai benar muncul; HILANG: ${hilang.join(', ')}`
      : wajib.length
        ? `acuan ${acuan.id}: ${wajib.length}/${wajib.length} nilai benar muncul`
        : `acuan ${acuan.id}: tidak ada angka wajib (kontrol negatif)`;
    if (acuan.larangNilai) {
      if (acuan.larangNilai.test(badan)) {
        status = 'MERAH';
        pesan += ` | MENGARANG nilai untuk ${acuan.kunciTidakAda}`;
      } else {
        pesan += ` | tidak mengarang nilai ${acuan.kunciTidakAda}`;
      }
    }
    hasil.push([status, 'R7 angka indeks', pesan]);
  }

  /* R8: klaim nilai - port/versi yang tidak ada di fakta (modul murni). */
  if (!ground || !ground.pbb) {
    hasil.push(['TIDAK DIUJI', 'R8 klaim nilai', 'src/lib/pembungkusBahasa.ts tidak bisa dimuat']);
  } else {
    const korpus = ground.korpus || '';
    const angkaFakta = [...new Set((korpus.match(/\b\d{1,5}\b/g) || []).map(Number))];
    const versiFakta = [...new Set(korpus.match(/\b\d+\.\d+\.\d+\b/g) || [])];
    const pelanggaran = ground.pbb.periksaKlaimNilai(badan, {
      angka: angkaFakta,
      versi: versiFakta,
      jalur: [...jalurDisebut, 'vite.config.ts', 'settings.json'],
    });
    if (pelanggaran.length) {
      const ringkas = pelanggaran.map((p) => `${p.jenis}:${p.token}`).join(', ');
      hasil.push(['MERAH', 'R8 klaim nilai', `${pelanggaran.length} nilai di luar fakta -> ${ringkas}`]);
    } else {
      hasil.push(['LULUS', 'R8 klaim nilai', `${angkaFakta.length} angka fakta diakui; tidak ada port/versi asing`]);
    }
  }

  hasil.push(['INFO', 'R9 ukuran', `${kata} kata, ${badan.length} char, sumber='${meta.sumber || '(tidak diisi)'}'`]);
  return hasil;
}

function cetakUkuran(namaBerkas, hasil) {
  console.log(`\n  berkas: ${namaBerkas}`);
  let merah = 0;
  let takUji = 0;
  for (const [status, butir, pesan] of hasil) {
    if (status === 'MERAH') merah++;
    if (status === 'TIDAK DIUJI') takUji++;
    console.log(`    ${status.padEnd(10)} ${butir.padEnd(20)} ${pesan}`);
  }
  console.log(`    -> ${merah ? `MERAH (${merah})` : takUji ? `SEBAGIAN TIDAK DIUJI (${takUji})` : 'LULUS'}`);
  return { merah, takUji };
}

/* ------------------------------------------------------------------ *
 * Mode --uji-tabel-perender (item 149): rendukan NYATA.
 * Kode override diambil APA ADANYA dari berkas perender jawaban
 * (src/components/ai/ChatMessage.tsx), diubah TSX->JS dengan esbuild repo ini,
 * lalu dipakai merender tabel lewat react-markdown + remark-gfm + react-dom/server.
 * Tidak ada app, tidak ada browser, tidak ada jaringan, tidak ada mock HTML.
 * ------------------------------------------------------------------ */
async function ujiTabelPerender() {
  console.log('UJI TABEL PERENDER (--uji-tabel-perender) - render nyata, tanpa app/browser');
  const berkas = path.join(AKAR, 'src/components/ai/ChatMessage.tsx');
  const sumber = readFileSync(berkas, 'utf8');
  const rel = 'src/components/ai/ChatMessage.tsx';

  const blok = (sumber.match(/const MdTabel[\s\S]*?\r?\n\);\r?\n/) || [])[0];
  if (!blok) {
    console.log(`  TIDAK DIUJI - tidak menemukan override tabel di ${rel}`);
    console.log('  (dicari: const MdTabel ... );) - perender mungkin belum ditambal.');
    process.exit(2);
  }
  console.log(`  sumber override: ${rel} (${blok.split('\n').length} baris)`);
  const barisBlok = sumber.slice(0, sumber.indexOf(blok)).split('\n').length;
  console.log(`  baris awal blok: ${barisBlok}`);

  const hasilCek = [];
  const catat = (nama, benar, pesan) => {
    hasilCek.push(benar);
    console.log(`    ${benar ? 'LULUS' : 'GAGAL'}  ${nama.padEnd(42)} ${pesan}`);
  };
  catat('override tabel ada di perender', /const MdTabel/.test(sumber), 'MdTabel');
  catat('MD_NARASI memakai override tabel', /const MD_NARASI: Components = \{[\s\S]{0,120}?table: MdTabel,/.test(sumber), 'table: MdTabel');
  catat('MD_JAWABAN memakai override tabel', /const MD_JAWABAN: Components = \{[\s\S]{0,120}?table: MdTabel,/.test(sumber), 'table: MdTabel');
  catat('perender jawaban punya plugin GFM', /const MD_PLUGINS = \[remarkGfm\]/.test(sumber), 'MD_PLUGINS = [remarkGfm]');

  const KERJA = path.join(AKAR, 'scratch', 'uji-tabel-perender');
  mkdirSync(KERJA, { recursive: true });
  const modul = path.join(KERJA, 'perender.tsx');
  writeFileSync(
    modul,
    `import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';

${blok}
const MD_UJI: Components = { table: MdTabel };
export function render(md: string) {
  return renderToStaticMarkup(<Markdown remarkPlugins={[remarkGfm]} components={MD_UJI}>{md}</Markdown>);
}
`,
    'utf8',
  );

  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch (e) {
    console.log(`  TIDAK DIUJI - esbuild tidak bisa dimuat: ${e.message}`);
    process.exit(2);
  }
  const outJs = esbuild.transformSync(readFileSync(modul, 'utf8'), { loader: 'tsx', format: 'esm', jsx: 'automatic' }).code;
  const outMjs = path.join(KERJA, 'perender.mjs');
  writeFileSync(outMjs, outJs, 'utf8');

  let render;
  try {
    ({ render } = await import(pathToFileURL(outMjs).href));
  } catch (e) {
    console.log(`  TIDAK DIUJI - perender tidak bisa dijalankan: ${e.message}`);
    process.exit(2);
  }

  const kasus = [
    ['tabel didahului baris kosong', 'Berikut tabelnya:\n\n| nama | port |\n| --- | --- |\n| MCP | 9222 |\n| CDP | 9223 |\n'],
    ['tabel menempel teks (tanpa baris kosong)', 'Berikut tabelnya:\n| nama | port |\n| --- | --- |\n| MCP | 9222 |\n'],
  ];
  for (const [nama, md] of kasus) {
    const html = render(md);
    const adaTabel = /<table[^>]*>/.test(html) && /<td[^>]*>/.test(html);
    const adaBungkus = /data-testid="ai-tabel-bungkus"/.test(html) && /ai-tabel-bungkus/.test(html);
    const adaGeser = /overflow-x:\s*auto/.test(html);
    catat(`${nama}: jadi <table> nyata`, adaTabel, adaTabel ? 'ada <table><td>' : 'pipa tampil mentah');
    catat(`${nama}: dibungkus pembungkus geser`, adaBungkus && adaGeser, `bungkus=${adaBungkus} overflow-x=${adaGeser}`);
    console.log(`      struktur keluaran: ${html.slice(0, 160).replace(/\n/g, '')} ...`);
  }

  const lulus = hasilCek.filter(Boolean).length;
  console.log('');
  console.log(`  PERENDER: ${lulus}/${hasilCek.length} lulus`);
  console.log(`  VERDICT: ${lulus === hasilCek.length ? 'LULUS - tabel markdown jadi tabel nyata dan bisa digeser' : 'MERAH - ada yang tidak sesuai'}`);
  process.exit(lulus === hasilCek.length ? 0 : 1);
}

/* ------------------------------------------------------------------ *
 * Mode --uji-klaim-nilai: uji MURNI src/lib/pembungkusBahasa.ts.
 * Tanpa app, tanpa model, tanpa jaringan.
 * ------------------------------------------------------------------ */
async function ujiKlaimNilai() {
  console.log('UJI KLAIM NILAI (--uji-klaim-nilai) - murni, tanpa app/model/jaringan');
  let pbb;
  try {
    pbb = await import(pathToFileURL(path.join(AKAR, 'src/lib/pembungkusBahasa.ts')).href);
  } catch (e) {
    console.log(`  TIDAK DIUJI - src/lib/pembungkusBahasa.ts tidak bisa diimpor: ${e.message}`);
    process.exit(2);
  }

  const kasus = [
    ['6 aturan ID', () => pbb.ATURAN_NILAI_ID.length === 6, `dapat ${pbb.ATURAN_NILAI_ID.length}`],
    ['6 aturan EN', () => pbb.ATURAN_NILAI_EN.length === 6, `dapat ${pbb.ATURAN_NILAI_EN.length}`],
    ['aturan ID menyebut tabel + larangan menaksir', () => /tabel/i.test(pbb.ATURAN_NILAI_ID.join(' ')) && /menaksir/i.test(pbb.ATURAN_NILAI_ID.join(' ')), 'cek kata kunci'],
    ['blokKlaimNilai(id) berjudul + 6 butir', () => {
      const b = pbb.blokKlaimNilai('id');
      return b.startsWith('## ') && b.split('\n').filter((l) => /^\d+\. /.test(l)).length === 6;
    }, 'bentuk blok'],
    ['blokKlaimNilai(en) berbahasa Inggris', () => /Every number/.test(pbb.blokKlaimNilai('en')), 'cek kalimat pertama'],
    ['blokPenutup(id) menekankan bentuk diminta + angka nyata', () => /tabel/i.test(pbb.blokPenutup('id')) && /nyata/i.test(pbb.blokPenutup('id')), 'cek kata kunci'],
    ['blokPenutup id != en', () => pbb.blokPenutup('id') !== pbb.blokPenutup('en'), 'cek bahasa'],
    ['port karangan tertangkap', () => pbb.periksaKlaimNilai('MCP mendengarkan di port 9444.', { angka: [9222] }).some((p) => p.jenis === 'port-asing' && p.token === '9444'), 'port 9444'],
    ['port nyata diterima', () => pbb.periksaKlaimNilai('MCP mendengarkan di port 9222.', { angka: [9222] }).length === 0, 'port 9222'],
    ['versi karangan tertangkap', () => pbb.periksaKlaimNilai('Versi Zephyr 9.9.9 terbaru.', { versi: ['1.1.13'] }).some((p) => p.jenis === 'versi-asing'), 'versi 9.9.9'],
    ['versi nyata diterima', () => pbb.periksaKlaimNilai('Versi Zephyr 1.1.13.', { versi: ['1.1.13'] }).length === 0, 'versi 1.1.13'],
    ['rujukan baris bukan pelanggaran', () => pbb.periksaKlaimNilai('Lihat src/lib/aiStore.ts:2034 untuk jeda retry.', { angka: [9222] }).length === 0, 'aiStore.ts:2034'],
    ['deterministik', () => pbb.blokKlaimNilai('id') === pbb.blokKlaimNilai('id') && JSON.stringify(pbb.periksaKlaimNilai('port 9444', { angka: [9222] })) === JSON.stringify(pbb.periksaKlaimNilai('port 9444', { angka: [9222] })), 'dua pemanggilan sama'],
  ];

  let lulus = 0;
  for (const [nama, fn, catatan] of kasus) {
    let ok = false;
    let err = '';
    try {
      ok = !!fn();
    } catch (e) {
      err = ` -> ${e.message}`;
    }
    if (ok) lulus++;
    console.log(`    ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${ok ? '' : `  (${catatan})${err}`}`);
  }
  console.log('');
  console.log(`  MODUL MURNI: ${lulus}/${kasus.length} lulus`);
  console.log('  Catatan: ini menguji ATURAN + pemindai nilai, bukan mutu jawaban model.');
  process.exit(lulus === kasus.length ? 0 : 1);
}

/* ------------------------------------------------------------------ *
 * Mode --uji-alat: buktikan rubriknya menangkap jawaban buruk.
 * FIXTURE - bukan jawaban provider, bukan bukti mutu Zeph.
 * ------------------------------------------------------------------ */
function ujiAlat(ground) {
  console.log('UJI ALAT (--uji-alat): apakah rubrik ini menangkap jawaban buruk?');
  const fixture = [
    {
      nama: 'FIXTURE 1: pertanyaan Indonesia dijawab Inggris (keluhan Ryu)',
      harap: 'R1 MERAH',
      data: {
        meta: { pertanyaan: 'bandingkan setelan editor dan terminal', diminta: 'tabel', bahasa: 'id', gaya: 'short', sumber: 'fixture' },
        badan: 'The editor settings live under the editor group while the terminal settings live under the panel group. You can change the values in the settings file and then restart the app so the new values take effect. There is no table here because this answer is written as a paragraph instead.',
        jalur: 'fixture-1.md',
      },
    },
    {
      nama: 'FIXTURE 2: diminta tabel/daftar, dijawab prosa',
      harap: 'R2 + R3 MERAH',
      data: {
        meta: { pertanyaan: 'bandingkan dan daftarkan setelan AI', diminta: 'tabel daftar', bahasa: 'id', gaya: 'short', sumber: 'fixture' },
        badan: 'Setelan AI ada di beberapa tempat dan masing-masing mengubah hal yang berbeda. Yang pertama mengatur model, yang kedua mengatur bahasa jawaban, dan yang ketiga mengatur gaya jawaban. Kalau kamu mengubah salah satunya, jalankan ulang aplikasi supaya nilainya terbaca lagi oleh Zeph.',
        jalur: 'fixture-2.md',
      },
    },
    {
      nama: 'FIXTURE 3: jawaban sehat (ID + tabel + jalur nyata)',
      harap: 'semua LULUS',
      data: {
        meta: { pertanyaan: 'bandingkan setelan editor dan terminal', diminta: 'tabel', bahasa: 'id', gaya: 'short', sumber: 'fixture' },
        badan: '| setelan | grup | efek |\n| --- | --- | --- |\n| tabSize | editor | jumlah spasi per tab |\n| fontSize | editor | ukuran huruf |\n| shell | panel | program terminal |\n\nNilai bawaannya dibaca dari settings.json; kalau ribet, lihat juga src/lib/systemPrompt.ts untuk teks yang dikirim ke model.',
        jalur: 'fixture-3.md',
      },
    },
    {
      nama: 'FIXTURE 4: jalur berkas karangan + kunci bocor',
      harap: 'R4 + R5 MERAH',
      data: {
        meta: { pertanyaan: 'di mana setelan AI disimpan?', diminta: '', bahasa: 'id', gaya: 'short', sumber: 'fixture' },
        badan: 'Setelan AI disimpan di src/lib/berkasYangTidakAda.ts dan bisa kamu ubah lewat berkas itu. Contohnya apiKey=AKIAIOSFODNN7EXAMPLE yang dipakai provider utama kamu.',
        jalur: 'fixture-4.md',
      },
    },
    {
      nama: 'FIXTURE 5: angka karangan (port 9444/9555 + versi 9.9.9) pada acuan A1',
      harap: 'MERAH (R7 + R8)',
      data: {
        meta: { pertanyaan: 'port MCP dan versi Zephyr?', diminta: 'tabel', bahasa: 'id', gaya: 'short', sumber: 'fixture', acuan: 'A1' },
        badan: '| hal | nilai |\n| --- | --- |\n| port MCP | 9444 |\n| port CDP | port 9555 |\n| versi app | 9.9.9 |\n\nNilai itu dibaca dari setelan mcp.port dan tidak pernah berubah sejak lama, jadi kamu bisa memakainya langsung untuk menyambung ke server Zephyr kamu.',
        jalur: 'fixture-5.md',
      },
    },
    {
      nama: 'FIXTURE 6: angka indeks benar + tabel pada acuan A9',
      harap: 'semua LULUS',
      data: {
        meta: { pertanyaan: 'tabel port Zephyr', diminta: 'tabel', bahasa: 'id', gaya: 'short', sumber: 'fixture', acuan: 'A9' },
        badan: '| port | fungsi |\n| --- | --- |\n| 9222 | port bawaan server MCP |\n| 9223 | dicadangkan untuk debug WebView2/CDP |\n| 5173 | dev server UI |\n\nPort MCP diatur oleh kunci mcp.port dan bawaannya mati (mcp.enabled=false), jadi tidak ada port yang benar-benar mendengarkan sampai kamu menyalakannya sendiri.',
        jalur: 'fixture-6.md',
      },
    },
  ];
  let benar = 0;
  for (const f of fixture) {
    const hasil = ukurJawaban(f.data, ground);
    const { merah } = cetakUkuran(f.nama, hasil);
    const ok = f.harap === 'semua LULUS' ? merah === 0 : merah >= 1;
    if (ok) benar++;
    console.log(`    harap: ${f.harap} | nyata: ${ok ? 'tertangkap sesuai harapan' : 'TIDAK sesuai harapan'}`);
  }
  console.log('');
  console.log(`  ALAT: ${benar}/${fixture.length} fixture tertangkap sesuai harapan`);
  console.log(`  VERDICT ALAT: ${benar === fixture.length ? 'LULUS - rubrik bukan cap kosong' : 'GAGAL - rubrik loloskan jawaban buruk'}`);
  console.log('  Catatan: fixture di atas KARANGAN UJI ALAT, bukan jawaban Zeph dan bukan bukti mutu.');
  process.exit(benar === fixture.length ? 0 : 1);
}

/* ------------------------------------------------------------------ *
 * Jalan utama
 * ------------------------------------------------------------------ */
let ground = null;
let groundError = '';
try {
  ground = await muatGround();
  ground.korpus = korpusGround(ground);
} catch (e) {
  groundError = e.message;
}

const laporanGround = ground ? periksaGrounding(ground, ground.korpus) : [];

if (process.argv.includes('--acuan')) {
  if (!ground) {
    console.log(`ACUAN: TIDAK DIUJI - data ground tidak bisa dimuat (${groundError})`);
    console.log('  Skrip menolak menilai angka tanpa ground; tidak ada klaim apa pun yang dibuat.');
    process.exit(2);
  }
  process.exit(cetakAcuan(laporanGround) ? 1 : 0);
}
if (process.argv.includes('--uji-klaim-nilai')) await ujiKlaimNilai();
if (process.argv.includes('--uji-tabel-perender')) await ujiTabelPerender();
if (process.argv.includes('--uji-alat')) ujiAlat(ground);

const argBerkas = process.argv.indexOf('--berkas');
let berkas = [];
if (argBerkas >= 0 && process.argv[argBerkas + 1]) {
  berkas = [path.resolve(AKAR, process.argv[argBerkas + 1])];
} else {
  mkdirSync(MAP_Jawaban, { recursive: true });
  berkas = readdirSync(MAP_Jawaban)
    .filter((n) => n.endsWith('.md'))
    .map((n) => path.join(MAP_Jawaban, n));
}

console.log('UKUR MUTU JAWABAN ZEPH (156+161)');
console.log(`  sumber bukti: docs/uji-jawaban/*.md  (ketemu ${berkas.length} berkas)`);
if (ground) {
  const cacat = laporanGround.filter((l) => l.kurang.length).length;
  console.log(`  data ground: src/lib/zephyrFakta.ts + zephyrIndeks.ts termuat (versi ${ground.indeks.FAKTA_VERSI.aplikasi})`);
  console.log(`  12 acuan    : ${ACUAN.length - cacat}/${ACUAN.length} ter-grounding di data repo${cacat ? ` (${cacat} CACAT RUBRIK)` : ''}`);
} else {
  console.log(`  data ground: GAGAL DIMUAT (${groundError}) -> R7/R8 akan TIDAK DIUJI`);
}

if (!berkas.length) {
  console.log('');
  console.log('  TIDAK DIUJI - tidak ada berkas jawaban. Tidak ada satu butir pun yang bisa');
  console.log('  dinilai, jadi skrip ini MENOLAK menyimpulkan LULUS maupun MERAH.');
  console.log('');
  console.log('  Yang butuh jawaban nyata dan karena itu TIDAK DIUJI:');
  console.log('    R1 bahasa jawaban      - perlu jawaban nyata untuk dilihat bahasanya');
  console.log('    R2 bentuk tabel        - perlu jawaban nyata atas pertanyaan bertabel');
  console.log('    R3 bentuk daftar       - perlu jawaban nyata atas pertanyaan berdaftar');
  console.log('    R4 sitasi jalur        - perlu jawaban nyata untuk dicek jalurnya');
  console.log('    R5 rahasia             - perlu jawaban nyata untuk dipindai');
  console.log('    R6 bentuk/panjang      - perlu jawaban nyata + metadata `gaya`');
  console.log('    R7 angka indeks        - perlu jawaban nyata + metadata `acuan` (lihat --acuan)');
  console.log('    R8 klaim nilai         - perlu jawaban nyata untuk dipindai nilai asingnya');
  console.log('');
  console.log('  Cara mengisi bukti: jalankan app dengan CDP, lalu');
  console.log('    node scripts/cek-pengetahuan-2lapis.mjs');
  console.log('  dan salin blok `--- jawaban Zeph ---` ke docs/uji-jawaban/<nama>.md');
  console.log('  dengan metadata <!-- pertanyaan/diminta/bahasa/gaya/sumber --> di atasnya.');
  console.log('');
  console.log('  Alat ini sendiri sudah diuji:');
  console.log('    node scripts/ukur-mutu-jawaban.mjs --uji-alat');
  console.log('    node scripts/ukur-mutu-jawaban.mjs --uji-klaim-nilai');
  console.log('    node scripts/ukur-mutu-jawaban.mjs --acuan');
  process.exit(2);
}

let totalMerah = 0;
let totalTakUji = 0;
for (const b of berkas) {
  const { merah, takUji } = cetakUkuran(path.relative(AKAR, b), ukurJawaban(muatBerkasJawaban(b), ground));
  totalMerah += merah;
  totalTakUji += takUji;
}
console.log('');
console.log(`  ${berkas.length} berkas jawaban | ${totalMerah} butir merah | ${totalTakUji} butir tidak diuji`);
if (totalMerah) {
  console.log('  VERDICT: MERAH - ada butir yang gagal pada jawaban nyata.');
  process.exit(1);
}
if (totalTakUji) {
  console.log('  VERDICT: SEBAGIAN TIDAK DIUJI - butir merah nol, tapi butir di atas belum punya bukti.');
  process.exit(2);
}
console.log('  VERDICT: LULUS - semua butir diukur dari jawaban tersimpan dan lolos.');
process.exit(0);
