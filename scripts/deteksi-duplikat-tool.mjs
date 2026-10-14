#!/usr/bin/env node
/*
 * DETEKTOR DUPLIKAT TOOL ZEPHYR + GERBANG SUPERSET KAPABILITAS
 * ============================================================================
 * Tujuan (permintaan Ryu: "hapus tool yang duplikat, dan jangan sampai
 * mengurangi jumlah tool"):
 *
 *   Mesin ini LAPOR (tidak menghapus apa pun sendiri) lalu MEMBUKTIKAN secara
 *   terukur bahwa usulan penggabungan TIDAK menghilangkan kapabilitas:
 *
 *     (a) DUP_SEJATI  : dua nama untuk satu kerjaan (kapabilitas sama DAN sinyal
 *                       operasi backend sama).
 *     (b) SUBSET      : kapabilitas/sinyal satu tool himpunan bagian dari tool
 *                       lain, tapi punya nilai tambah sendiri -> jangan asal
 *                       hapus, gabung sebagai nama kanonik + alias.
 *     (c) STUB        : tool yang saat dipanggil TIDAK menyentuh apa pun
 *                       (tanpa batas sistem) tapi tetap mengembalikan kalimat
 *                       "sukses/berhasil/dicatat" — "sukses palsu".
 *
 *   Semua angka & bukti datang dari `buildInventory()` di scripts/inventaris-tool.mjs
 *   yang menurunkan kapabilitas dari SUMBER NYATA (katalog via impor esbuild +
 *   badan handler via parse teks). Skrip ini TIDAK mengarang label.
 *
 * GERBANG SUPERSET
 * ----------------
 *   kapabilitasSesudah(sesudah) ⊇ kapabilitasSebelum(sebelum)  -> EXIT 0 (aman)
 *   kalau ada satu saja kapabilitas hilang                     -> EXIT 1 (merah)
 *
 *   Usulan dibuat HANYA dalam dua bentuk:
 *     - 'gabung-alias'     : nama kanonik + alias nama lama (kapabilitas =
 *                            gabungan; nama lama tetap bisa dipanggil).
 *     - 'pertahankan'      : tidak ada perubahan nama (dipakai untuk stub).
 *   Bentuk 'hapus-tanpa-alias' TIDAK PERNAH diusulkan untuk kode produk; ia ada
 *   di skrip ini semata-mata sebagai bahan UJI DIRI gerbang (supaya terbukti
 *   gerbang bisa berteriak merah).
 *
 * Pakai: node scripts/deteksi-duplikat-tool.mjs [--json]
 * Keluar: 0 = semua usulan aman & uji diri benar; 1 = ada kapabilitas hilang /
 *         uji diri tidak sesuai harapan.
 */

import { buildInventory } from './inventaris-tool.mjs';

/* ===================================================================== */
/* ATURAN KLASIFIKASI (semua diuji atas data inventaris yang berbukti)   */
/* ===================================================================== */

/*
 * DUP_SEJATI — dua nama, satu kerjaan:
 *   1. himpunan kapabilitas SAMA (dan tidak kosong), dan
 *   2. himpunan sinyal backend SAMA (dan tidak kosong) — jadi bukan cuma label
 *      kasarnya yang sama (lsp_hover vs lsp_definition sama-sama `kode:analisis`
 *      tapi metodenya `textDocument/hover` vs `textDocument/definition`), dan
 *   3. parameter kedua tool masih "sejalan" (ada irisan, atau salah satu tanpa
 *      parameter) — kalau parameter sama sekali lepas (`web_search.query` vs
 *      `web_fetch.url,max_chars`) itu bukan duplikat, cuma label yang kasar.
 */
const samaHimpunan = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const irisan = (a, b) => a.filter((x) => b.includes(x));

/**
 * "Beda bentuk": satu tool BERDIKARI (satu kerjaan) vs satu tool DISPATCHER
 * (punya properti `action`/`aksi` dengan daftar nilai). Dua tool begini BUKAN
 * duplikat walau label kapabilitasnya sama, mis. `mcp__zephyr__open_file`
 * (buka berkas) vs `mcp__zephyr__workspace` (aksi switch/create/... yang salah
 * satunya kebetulan juga membuka sesuatu). Bukti perbedaan itu terlihat di
 * `buktiRingkas`: `openPath(path)` vs `.openWorkspace(path)`.
 */
function bedaBentuk(a, b) {
  return !a.enumAksi.length !== !b.enumAksi.length;
}

/** Cuplikan bukti pertama tiap tool (untuk dilihat manusia, bukan disimpulkan mesin). */
function buktiRingkas(t) {
  const keluar = [];
  for (const [lbl, ev] of Object.entries(t.bukti ?? {})) {
    for (const e of ev.slice(0, 2)) keluar.push(`${lbl} @ ${e.sumber}: ${e.potongan}`);
    if (keluar.length >= 2) return keluar;
  }
  return keluar.length ? keluar : [`handler ${t.handlers.join(', ')}`];
}

function dupSejati(a, b) {
  if (!a.capabilities.length || !samaHimpunan(a.capabilities, b.capabilities)) return null;
  if (!a.sinyal.length || !samaHimpunan(a.sinyal, b.sinyal)) return null;
  if (bedaBentuk(a, b)) return null;
  const paramSejalan =
    irisan(a.params, b.params).length > 0 || !a.params.length || !b.params.length;
  if (!paramSejalan) return null;
  const alasan = [
    `kapabilitas identik: [${a.capabilities.join(', ')}]`,
    `sinyal backend identik: [${a.sinyal.join(', ')}]`,
    `parameter ${irisan(a.params, b.params).length ? 'beririsan: [' + irisan(a.params, b.params).join(', ') + ']' : 'salah satu kosong'}`,
    `nilai tambah parameter: ${a.name}=${JSON.stringify(a.params)} vs ${b.name}=${JSON.stringify(b.params)}`,
  ];
  return { jenis: 'DUP_SEJATI', a, b, alasan, buktiA: buktiRingkas(a), buktiB: buktiRingkas(b) };
}

/*
 * KANDIDAT_GABUNG — kapabilitas sama tapi bukti sinyal/parameter tidak identik.
 * Dilaporkan, TIDAK diusulkan otomatis: dua tool bisa melayani satu kapabilitas
 * lewat mekanisme berbeda (foreground vs background) dan tetap layak hidup.
 * Kalau nanti digabung, bentuknya "satu nama + parameter mode".
 */
function kandidatGabung(a, b) {
  if (!a.capabilities.length || !samaHimpunan(a.capabilities, b.capabilities)) return null;
  const bedaSinyal = !samaHimpunan(a.sinyal, b.sinyal);
  const alasan = [
    `kapabilitas sama: [${a.capabilities.join(', ')}]`,
    bedaSinyal
      ? `sinyal backend BEDA: ${a.name}=[${a.sinyal.join(', ')}] vs ${b.name}=[${b.sinyal.join(', ')}]`
      : `sinyal sama tapi parameter terpisah: ${JSON.stringify(a.params)} vs ${JSON.stringify(b.params)}`,
  ];
  return { jenis: 'KANDIDAT_GABUNG', a, b, alasan };
}

/*
 * SUBSET — kapabilitas(a) ⊊ kapabilitas(b) DAN sinyal(a) ⊊ sinyal(b) (STRICT).
 * Kenapa harus strict + sinyal TIDAK BOLEH kosong:
 *   - sinyal kosong ⊆ apa pun secara matematis, tapi tidak membuktikan apa-apa:
 *     tanpa syarat ini `mcp__zephyr__state` (jendela:baca) tampak "subset" dari
 *     `browser_click` (jendela:baca, jendela:klik) — dua kerjaan berbeda.
 *   - sinyal sama tapi kapabilitas beda berarti LABEL kasarnya yang beda
 *     (mis. `web_search` vs `browser_read`: sama-sama `cmd.webFetch`), bukan
 *     satu tool bagian dari yang lain.
 * Yang lolos syarat ini benar-benar "satu kerjaan kecil di dalam satu kerjaan
 * besar", dan yang kecil masih punya nilai tambah (parameter/sinyalnya sendiri).
 */
function subset(a, b) {
  const capA = new Set(a.capabilities);
  const capB = new Set(b.capabilities);
  if (!capA.size || !(capA.size < capB.size)) return null;
  if (![...capA].every((c) => capB.has(c))) return null;
  if (bedaBentuk(a, b)) return null;
  const sinA = new Set(a.sinyal);
  const sinB = new Set(b.sinyal);
  if (!sinA.size) return null;
  if (![...sinA].every((s) => sinB.has(s))) return null;
  if (sinA.size === sinB.size) return null; // harus benar-benar di dalam
  const paramUnikKecil = a.params.filter((p) => !b.params.includes(p));
  return {
    jenis: 'SUBSET',
    a,
    b,
    alasan: [
      `kapabilitas ${a.name} ⊂ ${b.name}: [${a.capabilities.join(', ')}] ⊂ [${b.capabilities.join(', ')}]`,
      `sinyal ${a.name} ⊂ ${b.name}: [${a.sinyal.join(', ')}] ⊂ [${b.sinyal.join(', ')}]`,
      paramUnikKecil.length
        ? `nilai tambah ${a.name}: parameter hanya dia yang punya [${paramUnikKecil.join(', ')}]`
        : `nilai tambah ${a.name}: jalur cepat tanpa parameter wajib tambahan`,
    ],
    buktiA: buktiRingkas(a),
    buktiB: buktiRingkas(b),
  };
}

/*
 * STUB "sukses palsu" — dianggap stub bila SEMUA benar:
 *   1. tanpa batas sistem (tidak memanggil cmd.x / invoke / fetch / store / DOM),
 *   2. tanpa kapabilitas terukur,
 *   3. dan entah (a) semua aksi di enum-nya tidak punya cabang nyata sama sekali,
 *      atau (b) handler-nya mengembalikan kalimat klaim sukses ("selesai",
 *      "berhasil", "dicatat", "dijalankan", ...).
 * Tool murni (think/calculator/tool_search) TIDAK kena karena punya kapabilitas.
 */
function klasifikasiStub(t) {
  if (t.adaBatasSistem || t.capabilities.length) return null;
  const aksiKosong = t.enumAksi.length > 0 && t.enumTerimplementasi.length === 0;
  const adaKlaim = t.klaimBukti.length > 0;
  if (!aksiKosong && !adaKlaim) return null;
  const alasan = [];
  if (aksiKosong) {
    alasan.push(
      `semua ${t.enumAksi.length} aksi di enum [${t.enumAksi.join(', ')}] tanpa satu pun cabang nyata`,
    );
  }
  if (adaKlaim) alasan.push(`mengembalikan klaim: ${t.klaimBukti.map((k) => `"${k.potongan}" (${k.sumber})`).join('; ')}`);
  if (!t.enumAksi.length) alasan.push('tidak ada enum aksi, jadi tidak ada aksi lain yang bisa dijalankan');
  return { jenis: 'STUB', t, alasan };
}

/* ===================================================================== */
/* PEMILIHAN NAMA KANONIK (deterministik, bisa diaudit)                  */
/* ===================================================================== */

/*
 * Urutan: (1) kapabilitas terbanyak, (2) dikirimSelalu, (3) aktifDefault,
 * (4) parameter terbanyak, (5) nama terpendek, (6) alfabetis.
 * Tujuannya bukan "nama terbaik" secara rasa bahasa, tapi PICK YANG BISA
 * DIULANG: dua kali jalan, hasilnya sama. Penamaan akhir tetap wewenang lane
 * pemilik zephyrTools/**.
 */
function pilihKanonik(a, b) {
  const skor = (t) => [
    t.capabilities.length,
    t.dikirimSelalu ? 1 : 0,
    t.aktifDefault ? 1 : 0,
    t.params.length,
    -t.name.length,
  ];
  const sa = skor(a);
  const sb = skor(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sa[i] > sb[i] ? a : b;
  }
  return a.name <= b.name ? a : b;
}

/* ===================================================================== */
/* GERBANG SUPERSET                                                      */
/* ===================================================================== */

/** Kapabilitas seluruh himpunan tool (union). */
function kapabilitasDari(tools) {
  return new Set(tools.flatMap((t) => t.capabilities));
}

/**
 * Terapkan usulan ke daftar tool, kembalikan daftar tool "sesudah".
 *   gabung-alias    : kanonik menyerap kapabilitas+SINYAL nama alias; nama alias
 *                     berhenti jadi tool (tetap hidup sebagai alias).
 *   pertahankan     : tidak mengubah apa pun.
 *   hapus-tanpa-alias: nama dibuang sama sekali (HANYA untuk uji diri).
 */
function terapkanUsulan(tools, usulan) {
  let sesudah = tools.map((t) => ({ ...t }));
  for (const u of usulan) {
    if (u.jenisU === 'gabung-alias') {
      const kan = sesudah.find((t) => t.name === u.kanonik);
      if (!kan) continue;
      for (const nm of u.alias) {
        const al = sesudah.find((t) => t.name === nm);
        if (!al) continue;
        kan.capabilities = [...new Set([...kan.capabilities, ...al.capabilities])].sort();
        kan.sinyal = [...new Set([...kan.sinyal, ...al.sinyal])].sort();
        kan.params = [...new Set([...kan.params, ...al.params])];
        kan.aliasDari = [...(kan.aliasDari ?? []), nm];
      }
      sesudah = sesudah.filter((t) => !u.alias.includes(t.name));
    } else if (u.jenisU === 'hapus-tanpa-alias') {
      sesudah = sesudah.filter((t) => t.name !== u.nama);
    }
  }
  return sesudah;
}

/** Inti gerbang: apakah kapabilitas sesudah masih SUPERSET dari sebelum? */
function periksaGerbang(tools, usulan) {
  const sebelum = kapabilitasDari(tools);
  const sesudah = kapabilitasDari(terapkanUsulan(tools, usulan));
  const hilang = [...sebelum].filter((c) => !sesudah.has(c)).sort();
  return {
    sebelum: [...sebelum].sort(),
    sesudah: [...sesudah].sort(),
    jumlahToolSebelum: tools.length,
    jumlahToolSesudah: terapkanUsulan(tools, usulan).length,
    hilang,
    lolos: hilang.length === 0,
  };
}

/* ===================================================================== */
/* UJI DIRI (self-test) — bukti gerbang BISA berteriak merah             */
/* ===================================================================== */

function contohTool(name, capabilities, sinyal = [], params = []) {
  return {
    name,
    capabilities,
    sinyal,
    params,
    dikirimSelalu: true,
    aktifDefault: true,
    adaBatasSistem: capabilities.length > 0,
    enumAksi: [],
    enumTerimplementasi: [],
    klaimBukti: [],
  };
}

function ujiDiri() {
  const kasus = [
    {
      nama: 'AMAN: dua tool kapabilitas identik, digabung jadi kanonik + alias',
      tools: [
        contohTool('alpha_baca', ['berkas:baca'], ['cmd.fsRead'], ['path']),
        contohTool('alpha_lengkap', ['berkas:baca'], ['cmd.fsRead'], ['path']),
      ],
      usulan: [{ jenisU: 'gabung-alias', kanonik: 'alpha_baca', alias: ['alpha_lengkap'] }],
      harapLolos: true,
    },
    {
      nama: 'HILANG: alias membawa kapabilitas yang tidak dimiliki kanonik',
      tools: [
        contohTool('beta_baca', ['berkas:baca'], ['cmd.fsRead'], ['path']),
        contohTool('beta_web', ['web:ambil'], ['fetch'], ['url']),
      ],
      usulan: [{ jenisU: 'gabung-alias', kanonik: 'beta_baca', alias: ['beta_web'] }],
      // kanonik serap kapabilitas alias -> aman; untuk kasus HILANG pakai hapus:
      usulanHilang: [{ jenisU: 'hapus-tanpa-alias', nama: 'beta_web' }],
      harapLolos: false,
    },
    {
      nama: 'HAPUS TANPA ALIAS: tool dengan kapabilitas unik dibuang',
      tools: [
        contohTool('gamma_hapus', ['berkas:tulis'], ['cmd.fsWrite'], ['path', 'content']),
        contohTool('gamma_lain', ['cari:isi'], ['cmd.searchGrep'], ['pattern']),
      ],
      usulan: [{ jenisU: 'hapus-tanpa-alias', nama: 'gamma_hapus' }],
      harapLolos: false,
    },
  ];

  const hasil = [];
  for (const k of kasus) {
    const usulan = k.usulanHilang ?? k.usulan;
    const g = periksaGerbang(k.tools, usulan);
    hasil.push({
      nama: k.nama,
      harapLolos: k.harapLolos,
      dapatLolos: g.lolos,
      hilang: g.hilang,
      benar: g.lolos === k.harapLolos,
    });
  }
  return hasil;
}

/* ===================================================================== */
/* UJI DIRI DETEKSI DUPLIKAT (kontrol POSITIF & NEGATIF)                 */
/* ===================================================================== */

/*
 * Membuktikan `dupSejati()` bisa MENYALA dan bisa DIAM memakai fungsi yang SAMA
 * dengan jalur nyata (bukan salinan logika) — supaya kalau kelak `dupSejati`
 * dilonggarkan sampai tidak pernah memerah, uji ini ikut GAGAL.
 *   POSITIF : dua spec sintetis KEMBAR (kapabilitas + sinyal + parameter sama)
 *             HARUS terdeteksi sebagai duplikat sejati.
 *   NEGATIF : dua spec MIRIP TAPI BEDA (kapabilitas beda; sinyal backend beda;
 *             parameter terpisah; atau satu dispatcher vs berdirikari) TIDAK
 *             boleh terdeteksi.
 */
function contohSpec(name, capabilities, sinyal, params, enumAksi = []) {
  return {
    name,
    capabilities,
    sinyal,
    params,
    enumAksi,
    handlers: [`contoh@${name}`],
    bukti: {},
  };
}

function ujiDiriDuplikat() {
  const kasus = [];
  const panggil = (a, b) => dupSejati(a, b);

  /* POSITIF 1: kembar persis -> DUP_SEJATI. */
  {
    const a = contohSpec('sintetis_kembar_a', ['berkas:baca'], ['cmd.fsRead'], ['path']);
    const b = contohSpec('sintetis_kembar_b', ['berkas:baca'], ['cmd.fsRead'], ['path']);
    const d = panggil(a, b);
    kasus.push({
      nama: 'POSITIF: dua spec KEMBAR (kapabilitas+sinyal+parameter identik) TERDETEKSI duplikat',
      harapTerdeteksi: true,
      dapatTerdeteksi: !!d,
      jenis: d ? d.jenis : '(tidak terdeteksi)',
    });
  }
  /* POSITIF 2: kembar, hanya urutan daftar berbeda (himpunan sama) -> tetap DUP_SEJATI. */
  {
    const a = contohSpec('sintetis_urutan_a', ['berkas:baca', 'berkas:tulis'], ['cmd.fsRead', 'cmd.fsWrite'], ['path']);
    const b = contohSpec('sintetis_urutan_b', ['berkas:tulis', 'berkas:baca'], ['cmd.fsWrite', 'cmd.fsRead'], ['path']);
    const d = panggil(a, b);
    kasus.push({
      nama: 'POSITIF: kembar beda urutan daftar (himpunan sama) TERDETEKSI duplikat',
      harapTerdeteksi: true,
      dapatTerdeteksi: !!d,
      jenis: d ? d.jenis : '(tidak terdeteksi)',
    });
  }
  /* NEGATIF 1: kapabilitas sama, sinyal backend BEDA -> bukan duplikat. */
  {
    const a = contohSpec('sintetis_beda_sinyal_a', ['berkas:baca'], ['cmd.fsRead'], ['path']);
    const b = contohSpec('sintetis_beda_sinyal_b', ['berkas:baca'], ['cmd.fsStat'], ['path']);
    const d = panggil(a, b);
    kasus.push({
      nama: 'NEGATIF: kapabilitas sama tapi sinyal backend beda -> TIDAK terdeteksi',
      harapTerdeteksi: false,
      dapatTerdeteksi: !!d,
      jenis: d ? d.jenis : '(tidak terdeteksi)',
    });
  }
  /* NEGATIF 2: kapabilitas & sinyal sama, tapi PARAMETER terpisah (disjoint) -> bukan duplikat. */
  {
    const a = contohSpec('sintetis_param_a', ['cari:isi'], ['cmd.searchGrep'], ['pattern']);
    const b = contohSpec('sintetis_param_b', ['cari:isi'], ['cmd.searchGrep'], ['glob']);
    const d = panggil(a, b);
    kasus.push({
      nama: 'NEGATIF: kapabilitas+sinyal sama tapi parameter terpisah -> TIDAK terdeteksi',
      harapTerdeteksi: false,
      dapatTerdeteksi: !!d,
      jenis: d ? d.jenis : '(tidak terdeteksi)',
    });
  }
  /* NEGATIF 3: satu dispatcher (enumAksi) vs satu berdirikari -> beda bentuk, bukan duplikat. */
  {
    const a = contohSpec('sintetis_berdikari', ['jendela:baca'], ['cmd.winRead'], ['id']);
    const b = contohSpec('sintetis_dispatcher', ['jendela:baca'], ['cmd.winRead'], ['id'], ['lihat', 'tutup']);
    const d = panggil(a, b);
    kasus.push({
      nama: 'NEGATIF: satu tool dispatcher vs berdirikari (beda bentuk) -> TIDAK terdeteksi',
      harapTerdeteksi: false,
      dapatTerdeteksi: !!d,
      jenis: d ? d.jenis : '(tidak terdeteksi)',
    });
  }
  /* NEGATIF 4: kapabilitas tak sama -> bukan duplikat walau sinyal/param sama. */
  {
    const a = contohSpec('sintetis_cap_a', ['berkas:baca'], ['cmd.fsRead'], ['path']);
    const b = contohSpec('sintetis_cap_b', ['web:ambil'], ['cmd.fsRead'], ['path']);
    const d = panggil(a, b);
    kasus.push({
      nama: 'NEGATIF: kapabilitas tak sama -> TIDAK terdeteksi',
      harapTerdeteksi: false,
      dapatTerdeteksi: !!d,
      jenis: d ? d.jenis : '(tidak terdeteksi)',
    });
  }

  return kasus.map((k) => ({ ...k, benar: k.dapatTerdeteksi === k.harapTerdeteksi }));
}

/* ===================================================================== */
/* SUSUN LAPORAN                                                         */
/* ===================================================================== */

function bangunLaporan(inv) {
  const tools = inv.tools;

  /* --- (a) duplikat sejati & kandidat --- */
  const dup = [];
  const kandidat = [];
  for (let i = 0; i < tools.length; i++) {
    for (let j = i + 1; j < tools.length; j++) {
      const a = tools[i];
      const b = tools[j];
      const d = dupSejati(a, b);
      if (d) {
        dup.push(d);
        continue;
      }
      const k = kandidatGabung(a, b);
      if (k) kandidat.push(k);
    }
  }

  /* --- (b) subset --- */
  const subs = [];
  for (const a of tools) {
    for (const b of tools) {
      if (a.name === b.name) continue;
      const s = subset(a, b);
      if (s) subs.push(s);
    }
  }

  /* --- kandidat, dikelompokkan per tanda-tangan kapabilitas ---
   * 16 pasangan LSP sebetulnya SATU keluarga; daftar pasangan bikin bising dan
   * menyembunyikan pola. Grup = satu baris keluarga dengan sinyal masing-masing,
   * supaya perbedaan backend (dokumen vs hover vs referensi) terbaca langsung. */
  const petakKandidat = new Map();
  for (const k of kandidat) {
    const ttd = k.a.capabilities.join('|');
    if (!petakKandidat.has(ttd)) {
      petakKandidat.set(ttd, { kapabilitas: k.a.capabilities, anggota: new Map() });
    }
    const g = petakKandidat.get(ttd);
    for (const t of [k.a, k.b]) {
      if (!g.anggota.has(t.name)) {
        g.anggota.set(t.name, { nama: t.name, sinyal: t.sinyal, params: t.params, handlers: t.handlers });
      }
    }
  }
  const grupKandidat = [...petakKandidat.values()].map((g) => ({
    kapabilitas: g.kapabilitas,
    anggota: [...g.anggota.values()],
  }));

  /* --- (c) stub --- */
  const stub = tools.map(klasifikasiStub).filter(Boolean);

  /* --- usulan aman --- */
  const usulan = [];
  for (const d of dup) {
    const kan = pilihKanonik(d.a, d.b);
    const al = kan.name === d.a.name ? d.b : d.a;
    usulan.push({
      jenisU: 'gabung-alias',
      temuan: 'DUP_SEJATI',
      kanonik: kan.name,
      alias: [al.name],
      kapabilitasKanonik: kan.capabilities,
      kapabilitasAlias: al.capabilities,
      bukti: [
        `handler ${kan.name}: ${kan.handlers.join(', ')}`,
        `handler ${al.name}: ${al.handlers.join(', ')}`,
        `sinyal identik: [${kan.sinyal.join(', ')}]`,
      ],
      catatan:
        'satu nama kanonik + alias nama lama; kapabilitas kanonik disatukan (aman karena sudah identik)',
    });
  }
  for (const s of subs) {
    const kan = s.b;
    usulan.push({
      jenisU: 'gabung-alias',
      temuan: 'SUBSET',
      kanonik: kan.name,
      alias: [s.a.name],
      kapabilitasKanonik: kan.capabilities,
      kapabilitasAlias: s.a.capabilities,
      bukti: [
        `handler ${kan.name}: ${kan.handlers.join(', ')}`,
        `handler ${s.a.name}: ${s.a.handlers.join(', ')}`,
        `sinyal ${kan.name}: [${kan.sinyal.join(', ')}] ⊇ ${s.a.name}: [${s.a.sinyal.join(', ')}]`,
      ],
      catatan:
        'gabung sebagai alias; nilai tambah nama lama dipertahankan sebagai parameter/mode, nama lama tetap bisa dipanggil',
    });
  }
  for (const s of stub) {
    usulan.push({
      jenisU: 'pertahankan',
      temuan: 'STUB',
      kanonik: s.t.name,
      alias: [],
      kapabilitasKanonik: s.t.capabilities,
      kapabilitasAlias: [],
      bukti: s.t.handlers.map((h) => `handler ${s.t.name}: ${h}`),
      catatan:
        'JANGAN hapus: perbaiki jadi pemanggilan nyata, ATAU petakan sebagai alias ke tool nyata yang sudah mengerjakan hal sama. Usulan ini sengaja tidak mengubah daftar tool.',
    });
  }

  /* --- gerbang --- */
  const gerbang = periksaGerbang(tools, usulan);
  const selfTest = ujiDiri();
  const ujiDuplikat = ujiDiriDuplikat();

  /* --- klaim stub yang belum terlayani (temuan MERAH terpisah) --- */
  const klaimStub = stub.map((s) => ({
    tool: s.t.name,
    aksiDiklaim: s.t.enumAksi,
    aksiTerlayani: s.t.enumTerimplementasi,
    // kapabilitas yang DIJANJIKAN spec tapi belum ada implementasinya
    kapabilitasDiklaimBelumAda: s.t.enumAksi.filter((x) => !s.t.enumTerimplementasi.includes(x)),
    bukti: s.t.handlers.join(', '),
  }));

  return { inv, dup, kandidat, grupKandidat, subs, stub, usulan, gerbang, selfTest, ujiDuplikat, klaimStub };
}

/* ===================================================================== */
/* CETAK                                                                 */
/* ===================================================================== */

function cetak(L) {
  const p = (s = '') => console.log(s);
  p('=============================================================');
  p(' DETEKTOR DUPLIKAT TOOL ZEPHYR + GERBANG SUPERSET KAPABILITAS');
  p(' sumber angka: inventaris-tool.mjs (katalog impor nyata + parse handler)');
  p('=============================================================');
  p('');
  p(`TOOL             : ${L.inv.total} (builtin ${L.inv.perSumber.builtin} / mcp ${L.inv.perSumber.mcp} / web ${L.inv.perSumber.web})`);
  p(`KAPABILITAS UNIK : ${L.inv.jumlahKapabilitasUnik}`);
  p('');

  p(`--- (a) DUPLIKAT SEJATI (kapabilitas + sinyal identik): ${L.dup.length} ---`);
  for (const d of L.dup) {
    p(`  * ${d.a.name} == ${d.b.name}`);
    for (const x of d.alasan) p(`      - ${x}`);
    p(`      handler: ${d.a.name}=[${d.a.handlers.join(', ')}]  ${d.b.name}=[${d.b.handlers.join(', ')}]`);
  }
  p('');
  p(`--- KANDIDAT GABUNG (kapabilitas sama, bukan duplikat sejati): ${L.kandidat.length} pasangan / ${L.grupKandidat.length} keluarga ---`);
  for (const g of L.grupKandidat) {
    p(`  * keluarga [${g.kapabilitas.join(', ')}]  (${g.anggota.length} tool)`);
    for (const t of g.anggota) {
      p(`      - ${t.nama}  sinyal=[${t.sinyal.join(', ') || '-'}]  params=[${t.params.join(', ') || '-'}]  handler=[${t.handlers.join(', ')}]`);
    }
  }
  p('');

  p(`--- (b) SUBSET (kapabilitas himpunan bagian, ada nilai tambah): ${L.subs.length} ---`);
  for (const s of L.subs) {
    p(`  * ${s.a.name} ⊂ ${s.b.name}`);
    for (const x of s.alasan) p(`      - ${x}`);
    p(`      handler: ${s.a.name}=[${s.a.handlers.join(', ')}]`);
    p(`      handler: ${s.b.name}=[${s.b.handlers.join(', ')}]`);
  }
  p('');

  p(`--- (c) STUB "sukses palsu" (tanpa efek nyata saat dipanggil): ${L.stub.length} ---`);
  for (const s of L.stub) {
    p(`  * ${s.t.name}   efek_katalog=${s.t.effect}  handler=[${s.t.handlers.join(', ')}]`);
    for (const x of s.alasan) p(`      - ${x}`);
    p(`      enum aksi: [${s.t.enumAksi.join(', ')}]  terimplementasi: [${s.t.enumTerimplementasi.join(', ') || 'TIDAK ADA'}]`);
  }
  p('');

  p(`--- USULAN AMAN (gabung jadi satu nama kanonik + alias nama lama): ${L.usulan.length} ---`);
  for (const u of L.usulan) {
    if (u.jenisU === 'gabung-alias') {
      p(`  * [${u.temuan}] kanonik="${u.kanonik}"  alias=[${u.alias.join(', ')}]`);
    } else {
      p(`  * [${u.temuan}] pertahankan="${u.kanonik}" (perbaiki / petakan jadi alias ke tool nyata)`);
    }
    for (const b of u.bukti) p(`      bukti: ${b}`);
  }
  p('');

  p('--- RINGKASAN ANGKA ---');
  p(`  duplikat-sejati      : ${L.dup.length}`);
  p(`  kandidat-gabung      : ${L.kandidat.length}`);
  p(`  subset               : ${L.subs.length}`);
  p(`  stub sukses-palsu    : ${L.stub.length}`);
  p(`  jumlah usulan        : ${L.usulan.length}`);
  p('');
  p('--- GERBANG SUPERSET (kapabilitas sebelum vs sesudah usulan) ---');
  p(`  nama tool  : ${L.gerbang.jumlahToolSebelum} -> ${L.gerbang.jumlahToolSesudah}  (nama boleh turun)`);
  p(`  kapabilitas: ${L.gerbang.sebelum.length} -> ${L.gerbang.sesudah.length}`);
  p(`  kapabilitas yang BISA HILANG: ${L.gerbang.hilang.length} (WAJIB 0) ${L.gerbang.hilang.length ? '-> ' + L.gerbang.hilang.join(', ') : ''}`);
  p(`  verdict    : ${L.gerbang.lolos ? 'AMAN (superset)' : 'MERAH (kapabilitas hilang)'}`);
  if (typeof ujiHilang !== 'undefined' && ujiHilang) {
    p('  mode       : --uji-hilang (usulan sengaja tidak aman disuntikkan; EXIT 1 diharapkan)');
  }
  p('');
  p('--- UJI DIRI GERBANG (3 kasus umpan) ---');
  for (const h of L.selfTest) {
    p(`  [${h.benar ? 'BENAR' : 'SALAH'}] ${h.nama}`);
    p(`         harap ${h.harapLolos ? 'LOLOS' : 'MERAH'} -> dapat ${h.dapatLolos ? 'LOLOS' : 'MERAH'}${h.hilang.length ? ` (hilang: ${h.hilang.join(', ')})` : ''}`);
  }
  p('');
  p(`--- UJI DIRI DETEKSI DUPLIKAT (kontrol positif/negatif, ${L.ujiDuplikat.length} kasus) ---`);
  for (const k of L.ujiDuplikat) {
    p(`  [${k.benar ? 'BENAR' : 'SALAH'}] ${k.nama}`);
    p(`         harap ${k.harapTerdeteksi ? 'TERDETEKSI' : 'TIDAK terdeteksi'} -> dapat ${k.dapatTerdeteksi ? 'TERDETEKSI' : 'TIDAK terdeteksi'} ${k.jenis}`);
  }
  p('');
  p('--- MERAH: KAPABILITAS DIKLAIM STUB TAPI BELUM TERLAYANI ---');
  if (!L.klaimStub.length) p('  (tidak ada)');
  for (const k of L.klaimStub) {
    p(`  * ${k.tool}: aksi diklaim [${k.aksiDiklaim.join(', ')}] -> terlayani [${k.aksiTerlayani.join(', ') || 'TIDAK ADA'}]`);
    p(`      bukti: ${k.bukti}`);
  }
}

/* ===================================================================== */
/* MAIN                                                                  */
/* ===================================================================== */

const inv = await buildInventory();
const L = bangunLaporan(inv);

/*
 * --uji-hilang: suntikkan SATU usulan yang sengaja tidak aman
 * (hapus tool yang kapabilitasnya unik, TANPA alias) lalu periksa ulang gerbang.
 * Gunanya: membuktikan gerbang benar-benar EXIT 1 di jalur nyata, bukan cuma di
 * uji diri. Jalur ini TIDAK dipakai untuk usulan sungguhan.
 */
let ujiHilang = false;
if (process.argv.includes('--uji-hilang')) {
  ujiHilang = true;
  const korban = inv.tools.find((t) => t.capabilities.includes('berkas:hapus'));
  L.usulan.push({
    jenisU: 'hapus-tanpa-alias',
    temuan: 'UJI-HILANG',
    kanonik: korban.name,
    nama: korban.name, // dipakai terapkanUsulan() untuk 'hapus-tanpa-alias'
    alias: [],
    kapabilitasKanonik: korban.capabilities,
    kapabilitasAlias: [],
    bukti: [`handler ${korban.name}: ${korban.handlers.join(', ')}`],
    catatan: 'SENGAJA TIDAK AMAN (uji gerbang): kapabilitas unik ikut terbuang',
  });
  L.gerbang = periksaGerbang(inv.tools, L.usulan);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    total: inv.total,
    jumlahKapabilitasUnik: inv.jumlahKapabilitasUnik,
    dupSejati: L.dup.map((d) => ({ a: d.a.name, b: d.b.name, alasan: d.alasan, bukti: [...d.a.handlers, ...d.b.handlers], sinyal: d.a.sinyal, params: [d.a.params, d.b.params] })),
    kandidatGabung: L.kandidat.map((k) => ({ a: k.a.name, b: k.b.name, alasan: k.alasan })),
    grupKandidat: L.grupKandidat,
    subset: L.subs.map((s) => ({ kecil: s.a.name, besar: s.b.name, kapabilitasKecil: s.a.capabilities, kapabilitasBesar: s.b.capabilities, alasan: s.alasan, buktiKecil: s.buktiA, buktiBesar: s.buktiB })),
    stub: L.stub.map((s) => ({ nama: s.t.name, alasan: s.alasan, handler: s.t.handlers, enumAksi: s.t.enumAksi, enumTerimplementasi: s.t.enumTerimplementasi, buktiKlaim: s.t.klaimBukti })),
    usulan: L.usulan.map((u) => ({ temuan: u.temuan, kanonik: u.kanonik, alias: u.alias, kapabilitasKanonik: u.kapabilitasKanonik, kapabilitasAlias: u.kapabilitasAlias, bukti: u.bukti, jenisU: u.jenisU })),
    gerbang: L.gerbang,
    selfTest: L.selfTest,
    ujiDuplikat: L.ujiDuplikat,
    ujiHilang,
    klaimStubBelumTerlayani: L.klaimStub,
  }, null, 2));
} else {
  cetak(L);
}

const gagal =
  !L.gerbang.lolos ||
  L.selfTest.some((h) => !h.benar) ||
  L.ujiDuplikat.some((k) => !k.benar) ||
  (ujiHilang && L.gerbang.hilang.length === 0); // hook uji harus benar-benar memerah
process.exit(gagal ? 1 : 0);
