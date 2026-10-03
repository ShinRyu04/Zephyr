/*
 * Menyisipkan `mcp.allowTerminalControl` + Hint ke setiap kamus yang belum
 * memilikinya.
 *
 * Kenapa lewat skrip, bukan suntingan tangan: kamus berisi aksara non-Latin
 * (Jepang, Korea, Cina, Arab) dan menyuntingnya lewat alat yang menormalkan
 * encoding merusak aksara itu. Skrip ini membaca sebagai UTF-8, menyisipkan
 * baris ASCII, dan menulis kembali sebagai UTF-8 tanpa menyentuh byte lain.
 *
 * Cara kerja: cari tiap kunci 'mcp.enable' di berkas, lalu sisipkan dua kunci
 * baru tepat sesudahnya. 'mcp.enable' dipilih sebagai jangkar karena ia ada di
 * SEMUA kamus - itu satu-satunya kunci mcp.* yang dimiliki kesepuluhnya.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n.ts';
const asli = readFileSync(BERKAS, 'utf8');

/* Terjemahan per bahasa, diambil dari urutan kamus di berkas. */
const PESAN = {
  en: [
    'Allow terminal control',
    'Let MCP clients run commands in the terminal. Off by default: this gives an outside program the ability to run anything on this machine.',
  ],
  ja: [
    'ターミナル制御を許可',
    'MCPクライアントがターミナルでコマンドを実行することを許可します。既定は無効です。外部プログラムがこのマシン上で何でも実行できるようになります。',
  ],
  ko: [
    '터미널 제어 허용',
    'MCP 클라이언트가 터미널에서 명령을 실행하도록 허용합니다. 기본값은 꺼짐입니다. 외부 프로그램이 이 컴퓨터에서 무엇이든 실행할 수 있게 됩니다.',
  ],
  zh: [
    '允许终端控制',
    '允许 MCP 客户端在终端中运行命令。默认关闭：这会让外部程序能够在这台机器上运行任何东西。',
  ],
  es: [
    'Permitir control de terminal',
    'Permite que los clientes MCP ejecuten comandos en la terminal. Desactivado por defecto: esto da a un programa externo la capacidad de ejecutar cualquier cosa en esta maquina.',
  ],
  fr: [
    'Autoriser le controle du terminal',
    "Autorise les clients MCP a executer des commandes dans le terminal. Desactive par defaut : cela donne a un programme externe la capacite d'executer n'importe quoi sur cette machine.",
  ],
  de: [
    'Terminalsteuerung erlauben',
    'Erlaubt MCP-Clients, Befehle im Terminal auszufuehren. Standardmaessig aus: ein externes Programm kann damit alles auf diesem Rechner ausfuehren.',
  ],
  pt: [
    'Permitir controle do terminal',
    'Permite que clientes MCP executem comandos no terminal. Desativado por padrao: isso da a um programa externo a capacidade de executar qualquer coisa nesta maquina.',
  ],
  ar: [
    'السماح بالتحكم في الطرفية',
    'السماح لعملاء MCP بتشغيل الأوامر في الطرفية. معطل افتراضيا: هذا يمنح برنامجا خارجيا القدرة على تشغيل أي شيء على هذا الجهاز.',
  ],
};

/*
 * Batas kamus ditentukan nomor baris `const XX: Dict = {`, bukan pencocokan
 * teks kunci - kunci yang sama muncul di SEPULUH kamus, jadi pencocokan teks
 * akan menyisipkan ke kamus pertama berkali-kali dan melewatkan sisanya.
 */
const batas = [...asli.matchAll(/^const ([A-Z]{2}): Dict = \{/gm)].map((m) => ({
  bahasa: m[1].toLowerCase(),
  mulai: m.index,
}));

console.log('Kamus ditemukan: ' + batas.map((b) => b.bahasa).join(', '));

const baris = asli.split('\n');
/* Kumpulkan sisipan per nomor baris, lalu kerjakan dari bawah ke atas supaya
   nomor baris di atasnya tidak bergeser. */
const sisipan = [];

for (let i = 0; i < batas.length; i++) {
  const mulai = batas[i].mulai;
  const akhir = i + 1 < batas.length ? batas[i + 1].mulai : asli.length;
  const blok = asli.slice(mulai, akhir);

  if (blok.includes("'mcp.allowTerminalControl'")) {
    console.log('  ' + batas[i].bahasa + ': sudah ada, dilewati');
    continue;
  }

  const pesan = PESAN[batas[i].bahasa];
  if (!pesan) {
    console.log('  ' + batas[i].bahasa + ': TIDAK ADA terjemahan, dilewati (harus diisi manual)');
    continue;
  }

  /*
   * Nomor baris jangkar dihitung dari daftar baris, dengan batas nomor baris
   * awal dan akhir kamus ini. Cara ini sederhana dan tidak bisa salah seperti
   * perhitungan lewat offset karakter: satu baris selalu satu elemen.
   */
  const barisMulai = asli.slice(0, mulai).split('\n').length - 1;
  const barisAkhir = i + 1 < batas.length ? asli.slice(0, akhir).split('\n').length - 1 : baris.length;
  const nomorBaris = baris.findIndex(
    (l, n) => n > barisMulai && n < barisAkhir && l.includes("'mcp.enable'"),
  );
  if (nomorBaris < 0) {
    console.log('  ' + batas[i].bahasa + ': jangkar mcp.enable tidak ketemu di blok ini, dilewati');
    continue;
  }

  const kutip = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  sisipan.push({
    nomorBaris,
    bahasa: batas[i].bahasa,
    teks: [
      `  'mcp.allowTerminalControl': ${kutip(pesan[0])},`,
      `  'mcp.allowTerminalControlHint':`,
      `    ${kutip(pesan[1])},`,
    ],
  });
}

sisipan.sort((a, b) => b.nomorBaris - a.nomorBaris);
for (const s of sisipan) {
  baris.splice(s.nomorBaris + 1, 0, ...s.teks);
  console.log('  ' + s.bahasa + ': disisipkan setelah baris ' + (s.nomorBaris + 1));
}

if (!sisipan.length) {
  console.log('Tidak ada yang perlu diubah.');
  process.exit(0);
}

writeFileSync(BERKAS, baris.join('\n'), 'utf8');
console.log('');
console.log('Selesai: ' + sisipan.length + ' kamus diperbarui. Berkas ditulis UTF-8.');
