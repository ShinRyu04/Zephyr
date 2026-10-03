/*
 * Menambahkan satu kunci baru ke SEMUA kamus di `i18n-extra.ts`.
 *
 * Kuncinya: "IntelliSense is off. Turn it on above to change the servers below."
 *
 * Kalimat itu muncul di section Language Server saat saklar induknya mati, dan
 * gunanya menjelaskan kenapa seluruh kontrol di bawahnya tidak bisa dipakai.
 * Kalau kalimat penjelas itu sendiri tidak diterjemahkan, pengguna di sembilan
 * bahasa lain mendapat satu-satunya petunjuk yang ada dalam bahasa Inggris -
 * jadi ini bukan kunci yang boleh dilewat.
 *
 * Konvensi berkas ini: KUNCI = kalimat sumber (Inggris), nilai = terjemahan
 * bahasa itu; kamus ID nilainya teks Indonesia.
 *
 * Penjaga: skrip MELEMPAR kalau ada bahasa yang terlewat. Menambahkan ke
 * sebagian kamus adalah bug yang sudah terjadi dua kali di proyek ini
 * (mcp.allowTerminalControl dan agents.*), dan dua-duanya menghasilkan halaman
 * berbahasa Indonesia di sembilan bahasa lain.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n-extra.ts';
const KUNCI = 'IntelliSense is off. Turn it on above to change the servers below.';

const BAHASA = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];

const TERJEMAHAN = {
  ID: 'IntelliSense mati. Nyalakan di atas untuk mengubah server di bawah.',
  EN: 'IntelliSense is off. Turn it on above to change the servers below.',
  JA: 'IntelliSense はオフです。下のサーバーを変更するには、上でオンにしてください。',
  KO: 'IntelliSense가 꺼져 있습니다. 아래 서버를 변경하려면 위에서 켜세요.',
  ZH: 'IntelliSense 已关闭。请在上方开启后再更改下方的服务器。',
  ES: 'IntelliSense está desactivado. Actívalo arriba para cambiar los servidores de abajo.',
  FR: "IntelliSense est désactivé. Activez-le ci-dessus pour modifier les serveurs ci-dessous.",
  DE: 'IntelliSense ist aus. Schalte es oben ein, um die Server unten zu ändern.',
  PT: 'O IntelliSense está desativado. Ative-o acima para alterar os servidores abaixo.',
  AR: 'ميزة IntelliSense معطّلة. شغّلها في الأعلى لتغيير الخوادم أدناه.',
};

/* Penjaga: setiap bahasa WAJIB punya terjemahan. */
for (const b of BAHASA) {
  if (!TERJEMAHAN[b]) throw new Error('terjemahan hilang untuk bahasa: ' + b);
}

const teks = readFileSync(BERKAS, 'utf8');

if (teks.includes("'" + KUNCI + "'")) {
  console.log('kunci sudah ada, tidak disisipkan lagi');
  process.exit(0);
}

/* Titik sisip: tepat sesudah kunci LSP yang sudah ada, supaya kunci-kunci satu
   fitur tetap berdekatan dan mudah ditemukan lagi nanti. */
const PENANDA = "  'No server matches that filter.':";
const idx = teks.indexOf(PENANDA);
if (idx < 0) {
  console.log('PENANDA TIDAK DITEMUKAN - periksa apakah kunci LSP masih ada');
  process.exit(1);
}

/* Akhir baris penanda, supaya penyisipan tidak memotong nilai kunci itu. */
const akhirBaris = teks.indexOf('\n', idx);
if (akhirBaris < 0) {
  console.log('baris penanda tidak punya akhir');
  process.exit(1);
}

let tambah = '';
for (const b of BAHASA) {
  tambah += '  ' + JSON.stringify(KUNCI) + ': ' + JSON.stringify(TERJEMAHAN[b]) + ',\n';
}

/* Setelah baris penanda, jadi kunci baru berdiri sendiri dan penanda tetap utuh. */
const keluaran = teks.slice(0, akhirBaris + 1) + tambah + teks.slice(akhirBaris + 1);
writeFileSync(BERKAS, keluaran);

/* Verifikasi: hitung berapa kamus yang benar-benar memuat kunci ini. */
const sesudah = readFileSync(BERKAS, 'utf8');
const jumlah = (sesudah.match(new RegExp(JSON.stringify(KUNCI).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log('kunci ditambahkan ke ' + jumlah + ' kamus (diharapkan ' + BAHASA.length + ')');
if (jumlah < BAHASA.length) {
  console.log('KURANG - periksa berkasnya');
  process.exit(1);
}
