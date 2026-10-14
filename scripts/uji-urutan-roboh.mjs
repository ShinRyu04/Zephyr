/**
 * uji-urutan-roboh.mjs - bukti bentuk wire tetap sah setelah balasan HILANG.
 *
 * Ini bug yang ditemukan dari uji tugas panjang yang sungguhan, dan gejalanya
 * menipu:
 *
 *   urutan peran: system -> user -> user -> assistant -> tool -> assistant -> tool
 *                                      ^^ gateway OpenAI-compatible tolak 400
 *
 * Yang bikin berbahaya: ia TIDAK butuh pembaca melakukan kesalahan. Kirim pesan,
 * balasan gagal datang (jaringan putus, dibatalkan, provider menutup stream
 * tanpa teks), kirim pesan lagi -> percakapan itu 400 SELAMANYA. Tidak ada yang
 * rusak di layar, tidak ada pesan yang menjelaskan, dan mengulang tidak menolong.
 *
 * Yang diuji:
 *   1. `user -> user` DIGABUNG jadi satu
 *   2. isi kedua pesan dipertahankan (tidak ada yang dibuang)
 *   3. gambar dari sisi mana pun selamat
 *   4. hanya user berturut-turut yang digabung - assistant/tool tidak tersentuh
 *   5. riwayat yang sudah sah tidak berubah sama sekali (idempoten)
 *   6. pemeriksa Rust MENDETEKSI `user -> user` (sebelumnya bilang "tidak ada
 *      pelanggaran" padahal ada)
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan.
 *
 *   node scripts/uji-urutan-roboh.mjs
 */
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';

const R = reporter('urutan pesan setelah balasan hilang');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/* Cerminan `bentukWireRiwayat` di aiStore.ts — penggabungan user + perbaikan id. */
function bentukWireRiwayat(history) {
  const system = history.filter((m) => m.role === 'system');
  const lain = history.filter((m) => m.role !== 'system');
  const hasil = [];
  for (const m of lain) {
    const sebelum = hasil[hasil.length - 1];
    if (m.role === 'user' && sebelum?.role === 'user') {
      const a = String(sebelum.content ?? '').trimEnd();
      const b = String(m.content ?? '').trim();
      hasil[hasil.length - 1] = {
        ...sebelum,
        content: a && b ? `${a}\n\n${b}` : a || b,
        images: m.images?.length ? m.images : sebelum.images,
      };
      continue;
    }
    if (m.role !== 'assistant') {
      hasil.push(m);
      continue;
    }
    const sebelumnya = hasil[hasil.length - 1];
    if (sebelumnya?.role === 'assistant' && !sebelumnya.toolCalls?.length && m.toolCalls?.length) {
      const isi = (sebelumnya.content ?? '').trim();
      hasil[hasil.length - 1] = isi
        ? { ...sebelumnya, toolCalls: m.toolCalls }
        : { ...m, content: sebelumnya.content };
      continue;
    }
    const kosong = !String(m.content ?? '').trim() && !m.toolCalls?.length;
    if (kosong && hasil.length > 0) continue;
    hasil.push(m);
  }

  /* Jaring terakhir + perbaikan id pasangan assistant↔tool. */
  const bersih = [];
  let idPasangan = 0;
  const idBerikut = () => `zc_${(idPasangan++).toString(36)}`;
  let idToolMenunggu = [];
  for (const m of hasil) {
    if (m.role === 'tool') {
      const idCocok = idToolMenunggu.shift();
      if (!idCocok) continue;
      bersih.push({ ...m, toolCallId: idCocok });
      continue;
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      let punyaHasil = 0;
      for (let i = hasil.indexOf(m) + 1; i < hasil.length && hasil[i].role === 'tool'; i++) {
        punyaHasil += 1;
      }
      const dipakai = m.toolCalls.slice(0, punyaHasil);
      if (dipakai.length === 0) {
        if ((m.content ?? '').trim()) bersih.push({ ...m, toolCalls: undefined });
        idToolMenunggu = [];
        continue;
      }
      const idBaru = dipakai.map(() => idBerikut());
      const dipakaiBerid = dipakai.map((tc, i) => ({ ...tc, id: idBaru[i] }));
      idToolMenunggu = [...idBaru];
      bersih.push({ ...m, toolCalls: dipakaiBerid });
      continue;
    }
    idToolMenunggu = [];
    bersih.push(m);
  }
  return [...system, ...bersih];
}

const U = (c, extra = {}) => ({ role: 'user', content: c, ...extra });
const A = (c, tc) => ({ role: 'assistant', content: c, ...(tc ? { toolCalls: tc } : {}) });
const T = (c) => ({ role: 'tool', content: c });
const S = (c) => ({ role: 'system', content: c });

const peran = (h) => h.map((m) => m.role).join(' -> ');

/* ── 1. Kasus yang menabrak gateway ───────────────────────────────────── */

/*
 * Persis bentuk yang muncul di uji nyata: tugas pertama tidak pernah dijawab,
 * lalu tugas kedua dikirim.
 */
const roboh = [S('sys'), U('tugas pertama'), U('tugas kedua')];
const w1 = bentukWireRiwayat(roboh);
R.check('R1', peran(w1) === 'system -> user', `dua user berturut -> satu (${peran(w1)})`);
R.check('R2', !peran(w1).includes('user -> user'), 'TIDAK ada user -> user lagi');
R.check('R3', w1[1].content.includes('tugas pertama'), 'isi pesan pertama dipertahankan');
R.check('R4', w1[1].content.includes('tugas kedua'), 'isi pesan kedua dipertahankan');
R.check('R5', w1[1].content === 'tugas pertama\n\ntugas kedua', `digabung dengan baris kosong (${JSON.stringify(w1[1].content)})`);

/* Tiga berturut-turut. */
const tiga = bentukWireRiwayat([S('s'), U('a'), U('b'), U('c')]);
R.check('R6', peran(tiga) === 'system -> user', `tiga user -> satu (${peran(tiga)})`);
R.check('R7', tiga[1].content === 'a\n\nb\n\nc', `ketiganya utuh (${JSON.stringify(tiga[1].content)})`);

/* ── 2. Gambar selamat ────────────────────────────────────────────────── */

const g1 = bentukWireRiwayat([S('s'), U('a'), U('b', { images: ['img-b'] })]);
R.check('R8', Array.isArray(g1[1].images) && g1[1].images[0] === 'img-b', 'gambar dari pesan KEDUA selamat');

const g2 = bentukWireRiwayat([S('s'), U('a', { images: ['img-a'] }), U('b')]);
R.check('R9', Array.isArray(g2[1].images) && g2[1].images[0] === 'img-a', 'gambar dari pesan PERTAMA selamat');

/* ── 3. Isi kosong ────────────────────────────────────────────────────── */

const k1 = bentukWireRiwayat([S('s'), U(''), U('b')]);
R.check('R10', k1[1].content === 'b', `user kosong + user isi -> isinya saja (${JSON.stringify(k1[1].content)})`);

const k2 = bentukWireRiwayat([S('s'), U('a'), U('   ')]);
R.check('R11', k2[1].content === 'a', `user isi + user spasi -> tanpa spasi tambahan (${JSON.stringify(k2[1].content)})`);

/* ── 4. Hanya user yang digabung ──────────────────────────────────────── */

/*
 * Yang paling penting di sini: `assistant -> assistant` punya penanganannya
 * SENDIRI (digabung hanya kalau yang kedua punya tool call), dan `tool -> tool`
 * tidak boleh disentuh sama sekali. Kalau aturan user bocor ke keduanya, bentuk
 * yang sudah benar jadi rusak.
 */
const a2 = bentukWireRiwayat([S('s'), U('x'), A('satu'), A('dua')]);
R.check('R12', a2.filter((m) => m.role === 'assistant').length === 2, 'dua assistant tanpa tool call TIDAK digabung jadi satu');

const a3 = bentukWireRiwayat([S('s'), U('x'), A('satu'), A('', [{ id: 'c1', name: 'read_file' }]), T('hasil')]);
R.check('R13', a3.filter((m) => m.role === 'assistant').length === 1, 'asisten terpecah (teks + tool call) tetap digabung satu');
R.check('R14', a3.filter((m) => m.role === 'tool').length === 1, 'hasil tool tidak tersentuh');

/*
 * Dua tool call pada SATU assistant harus menyisakan dua hasil tool yang
 * dipasangkan. (Dulu uji ini memakai satu tool call dengan dua hasil tool dan
 * mengharap keduanya bertahan — tetapi satu tool_call hanya boleh punya SATU
 * hasil; hasil kedua tanpa pemanggil justru ditolak gateway. Perbaikan id
 * sekarang membuang yatim itu, yang memang benar.)
 */
const t2 = bentukWireRiwayat([
  S('s'),
  U('x'),
  A('', [{ id: 'c1', name: 'a' }, { id: 'c2', name: 'b' }]),
  T('r1'),
  T('r2'),
]);
R.check('R15', t2.filter((m) => m.role === 'tool').length === 2, 'dua tool call -> dua hasil tool dipasangkan');

/* Dan satu tool call dengan hasil berlebih: hasil kedua (yatim) dibuang. */
const t2b = bentukWireRiwayat([S('s'), U('x'), A('', [{ id: 'c1', name: 'a' }]), T('r1'), T('r2')]);
R.check('R15b', t2b.filter((m) => m.role === 'tool').length === 1, 'satu tool call -> hasil tool kedua yang yatim dibuang');

/* ── 5. Idempoten: yang sudah sah tidak berubah ───────────────────────── */

const sah = [S('s'), U('tanya'), A('', [{ id: 'c1', name: 'read_file' }]), T('isi'), A('jawab')];
const sekali = bentukWireRiwayat(sah);
const duaKali = bentukWireRiwayat(sekali);
R.check('R16', peran(sekali) === peran(sah), `riwayat sah tidak berubah (${peran(sekali)})`);
R.check('R17', JSON.stringify(sekali) === JSON.stringify(duaKali), 'idempoten: dijalankan dua kali hasilnya sama');

/* ── 6. Pemeriksa Rust mendeteksi ─────────────────────────────────────── */

const rs = (() => {
  try {
    return fs.readFileSync('src-tauri/src/ai.rs', 'utf8');
  } catch {
    return '';
  }
})();

R.check('R18', /dua pesan user berurutan/.test(rs), 'ai.rs mendeteksi user -> user');
R.check('R19', /peran\[i\] == "user" && peran\[i - 1\] == "user"/.test(rs), 'perbandingan peran user ada di ai.rs');
R.check('R20', /dua pesan assistant berurutan/.test(rs), 'deteksi assistant berurutan masih ada (tidak tertimpa)');

/* Dan penggabungannya benar-benar ada di sumber frontend. */
const ts = (() => {
  try {
    return fs.readFileSync('src/lib/aiStore.ts', 'utf8');
  } catch {
    return '';
  }
})();
R.check('R21', /m\.role === 'user' && sebelum\?\.role === 'user'/.test(ts), 'aiStore menggabung user -> user');
R.check('R22', /a && b \? `\$\{a\}\\n\\n\$\{b\}` : a \|\| b/.test(ts), 'penggabungan mempertahankan kedua isi');

/* ── 7. Perbaikan id pasangan assistant↔tool (bug 400 dari cancel) ─────── */

/*
 * Bug nyata dari screenshot: run dibatalkan di tengah tool-call meninggalkan
 * riwayat yang urutannya sah tapi id-nya rusak — id tool tidak cocok dengan id
 * tool_call pemanggilnya, dan satu id tool_call dipakai dua kali. Gateway
 * OpenAI-compatible menolaknya 400 permanen. `bentukWireRiwayat` kini menulis
 * ulang id pasangan berdasarkan posisi menjadi unik dan cocok.
 */
const idRusak = [
  S('s'),
  U('tugas'),
  A('', [{ id: 'DUP', name: 'browser_read' }]),
  { role: 'tool', content: 'hasil-1', toolCallId: 'TIDAK-COCOK' },
  A('', [{ id: 'DUP', name: 'browser_read' }]),
  { role: 'tool', content: 'hasil-2', toolCallId: 'DUP' },
];
const diperbaiki = bentukWireRiwayat(idRusak);
const asisten = diperbaiki.filter((m) => m.role === 'assistant');
const toolMsg = diperbaiki.filter((m) => m.role === 'tool');
R.check('R23', asisten.length === 2 && toolMsg.length === 2, `kedua pasangan tetap ada (${peran(diperbaiki)})`);
const semuaId = asisten.map((a) => a.toolCalls[0].id);
R.check('R24', new Set(semuaId).size === semuaId.length, `id tool_call unik, tidak ada duplikat (${JSON.stringify(semuaId)})`);
const cocok = diperbaiki
  .map((m, i) => ({ m, i }))
  .filter(({ m }) => m.role === 'tool')
  .every(({ m, i }) => {
    const pemanggil = diperbaiki[i - 1];
    return pemanggil && pemanggil.role === 'assistant' && pemanggil.toolCalls[0].id === m.toolCallId;
  });
R.check('R25', cocok, 'setiap tool_call_id cocok dengan id tool_call assistant tepat sebelumnya');

/* Sumbernya benar-benar ada di frontend. */
R.check('R26', /idToolMenunggu/.test(ts), 'aiStore memasangkan ulang id assistant↔tool');

/* ── 8. Jalur chat memakai perbaikan bentuk yang sama ─────────────────── */

/*
 * Perbaikan `user -> user` dulu hanya menutup jalur agent. Jalur chat menyusun
 * riwayatnya sendiri dan mengirimnya mentah, jadi bug 400 permanen itu masih
 * hidup di sana - dan chat adalah jalur yang paling sering dipakai.
 */
const kirimChat = ts.slice(ts.indexOf('const mentah: AgentMsg[]'), ts.indexOf('const bhsJawab'));
R.check(
  'R27',
  /bentukWireRiwayat/.test(kirimChat),
  'jalur chat memakai bentukWireRiwayat (dulu mengirim riwayat mentah)',
);
R.check(
  'R28',
  /bentukWireRiwayat\(ringkasUkuran\(dirApi\)\)/.test(ts),
  'chat: rapikan -> potong -> rapikan lagi (urutan yang sama dengan agent)',
);

/* ── 9. Cancel tidak boleh meninggalkan tool call tanpa hasil ─────────── */

/*
 * Menekan Stop saat tool berjalan dulu `break` sebelum hasil tool di-push,
 * sementara assistant(toolCalls)-nya sudah terlanjur masuk riwayat. Riwayat
 * berakhir dengan tool call yang tidak dijawab apa pun - bentuk yang ditolak
 * gateway 400, pada SETIAP permintaan sesudahnya.
 */
const blokBatal = ts.slice(ts.indexOf("(dibatalkan sebelum tool ini selesai dijalankan)") - 700, ts.indexOf("(dibatalkan sebelum tool ini selesai dijalankan)") + 200);
R.check(
  'R29',
  /role: 'tool'/.test(blokBatal) && /toolCallId: tc\.id/.test(blokBatal),
  'cancel mengisi hasil tool yang belum jalan, jadi pasangan tetap utuh',
);

/* ── 10. Kompaksi otomatis tidak boleh menggeser langkahRiwayat ───────── */

/*
 * `history` dan `langkahRiwayat` di-zip berdasarkan jumlah assistant. Kalau
 * kompaksi memangkas `history` tanpa menyentuh `langkahRiwayat`, langkah ke-N
 * membawa tool call milik langkah lain - 400 permanen, dan hanya pada run
 * PANJANG karena hanya di situ kompaksi menyala.
 */
/*
 * Dicari dari `langkah - autoCompactStep` (baris KONDISI di dalam loop), bukan
 * dari `autoCompactStep = langkah`: deklarasi variabel di kepala berkas memakai
 * teks yang sama, dan `indexOf` akan menemukan deklarasi itu lebih dulu -
 * sehingga blok yang diperiksa bukan blok yang dimaksud.
 */
const jangkar = ts.indexOf('langkah - autoCompactStep >= AUTO_COMPACT_COOLDOWN_STEPS');
/* Jendela lebar: blok ini memuat komentar panjang sebelum perbaikannya, dan
   jendela sempit membuat tes gagal pada kode yang sebenarnya sudah benar. */
const blokKompak = ts.slice(jangkar, jangkar + 4000);
R.check('R30', jangkar > 0, 'blok kompaksi ditemukan di sumber');
R.check(
  'R30b',
  /langkahRiwayat\.length = 0/.test(blokKompak),
  'kompaksi membuang langkahRiwayat seiring history (dulu tidak, indeks bergeser)',
);

/* Dan ambangnya diukur dari riwayat ASLI, bukan yang sudah dipangkas 40 KB. */
/*
 * Yang diperiksa adalah BARIS KODE-nya, bukan penyebutan di komentar.
 * Komentar di atas perbaikan ini sengaja mengutip bentuk lamanya supaya
 * alasannya terbaca, jadi mencocokkan seluruh berkas akan selalu "menemukan"
 * pola yang justru sedang dihindari.
 */
const barisKode = ts
  .split('\n')
  .filter((l) => !/^\s*(?:\/\*|\*|\/\/)/.test(l))
  .join('\n');
R.check(
  'R31',
  !/perkiraanKonteks\(ringkasRiwayat\(history\)\)/.test(barisKode) &&
    /const dipakai = perkiraanKonteks\(history\)/.test(barisKode),
  'ambang kompaksi diukur dari riwayat asli (dulu dari yang sudah dipangkas, jadi tidak pernah menyala)',
);

/* ── 11. Gangguan stream dianggap bisa diulang ────────────────────────── */

/*
 * Rust melaporkan stream putus sebagai "stream terputus"/"invalid stream
 * response", dan dua kalimat itu tidak cocok pola retry mana pun - jadi
 * gangguan yang paling sering dialami kerja berat justru diklasifikasi
 * PERMANEN dan langsung mematikan run.
 */
const blokRetry = ts.slice(ts.indexOf('function isRetryableAgentProviderError'), ts.indexOf('function tungguRetryAgent'));
R.check(
  'R32',
  /stream terputus/.test(blokRetry) && /invalid stream response/.test(blokRetry),
  'stream putus / frame rusak dikenali sebagai error yang bisa diulang',
);

/* ── 12. Batas waktu yang mematikan kerja berat ───────────────────────── */

const rsExec = (() => {
  try {
    return fs.readFileSync('src-tauri/src/agent_exec.rs', 'utf8');
  } catch {
    return '';
  }
})();
R.check(
  'R33',
  /const DEFAULT_TIMEOUT_MS: u64 = 300_000/.test(rsExec),
  'bash_run default 5 menit (dulu 30 detik, membunuh build/install)',
);
R.check(
  'R34',
  /out_buf/.test(rsExec) && !/\(-1, true, String::new\(\), String::new\(\)\)/.test(rsExec),
  'timeout mengembalikan output parsial, bukan stdout/stderr kosong',
);
R.check(
  'R35',
  /const AGENT_NO_PROGRESS_MS = 300_000/.test(ts),
  'watchdog tanpa-kemajuan 5 menit (dulu 2 menit, memotong model yang menalar panjang)',
);

console.log('\n  catatan: aturan di atas mencerminkan aiStore.ts + ai.rs');
R.selesai();
process.exit(gagal ? 1 : 0);
