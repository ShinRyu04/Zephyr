/*
 * Menambahkan 9 kunci UI Language Server ke SEMUA kamus.
 *
 * Kunci-kunci ini dipakai oleh tampilan LSP yang baru: penanda "terpasang",
 * dialog pemasangan, dan tombol periksa-ulang. Kalau salah satunya tidak
 * diterjemahkan, pengguna bahasa itu melihat kalimat Inggris di tengah UI-nya -
 * dan untuk DIALOG, itu bagian yang paling perlu dipahami.
 *
 * CARA KERJA yang benar, dan bedanya dari percobaan yang gagal:
 * setiap kamus adalah objek dengan pembuka `const XX: Dict = {`. Kunci baru
 * disisipkan tepat SEBELUM baris penutup objek kamus itu, sehingga terhitung
 * per kamus. Percobaan sebelumnya menyisipkan pada satu kalimat penanda yang
 * kebetulan hanya ada di satu kamus, sehingga 10 terjemahan masuk ke satu
 * kamus dan `tsc` melaporkan TS1117 (properti bernama sama berulang).
 *
 * Penjaga: setelah menulis, skrip MEMBACA ULANG dan memastikan setiap kamus
 * memuat setiap kunci. Kalau ada yang kurang, ia melempar - dan berkasnya tidak
 * ditinggalkan dalam keadaan setengah jadi.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n-extra.ts';
const KODE = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];

/* Kunci -> terjemahan per bahasa. Kunci = kalimat sumber (Inggris). */
const KUNCI = {
  'IntelliSense is off. Turn it on above to change the servers below.': {
    ID: 'IntelliSense mati. Nyalakan di atas untuk mengubah server di bawah.',
    EN: 'IntelliSense is off. Turn it on above to change the servers below.',
    JA: 'IntelliSense はオフです。下のサーバーを変更するには、上でオンにしてください。',
    KO: 'IntelliSense가 꺼져 있습니다. 아래 서버를 변경하려면 위에서 켜세요.',
    ZH: 'IntelliSense 已关闭。请在上方开启后再更改下方的服务器。',
    ES: 'IntelliSense está desactivado. Actívalo arriba para cambiar los servidores de abajo.',
    FR: 'IntelliSense est désactivé. Activez-le ci-dessus pour modifier les serveurs ci-dessous.',
    DE: 'IntelliSense ist aus. Schalte es oben ein, um die Server unten zu ändern.',
    PT: 'O IntelliSense está desativado. Ative-o acima para alterar os servidores abaixo.',
    AR: 'ميزة IntelliSense معطّلة. شغّلها في الأعلى لتغيير الخوادم أدناه.',
  },
  'Installed on this machine': {
    ID: 'Terpasang di komputer ini',
    EN: 'Installed on this machine',
    JA: 'このマシンにインストール済み',
    KO: '이 컴퓨터에 설치됨',
    ZH: '已安装在此计算机上',
    ES: 'Instalado en esta máquina',
    FR: 'Installé sur cette machine',
    DE: 'Auf diesem Rechner installiert',
    PT: 'Instalado nesta máquina',
    AR: 'مثبَّت على هذا الجهاز',
  },
  'Install the language server': {
    ID: 'Pasang language server',
    EN: 'Install the language server',
    JA: 'language server をインストール',
    KO: 'language server 설치',
    ZH: '安装 language server',
    ES: 'Instalar el language server',
    FR: 'Installer le language server',
    DE: 'language server installieren',
    PT: 'Instalar o language server',
    AR: 'تثبيت خادم اللغة',
  },
  'language server': {
    ID: 'language server',
    EN: 'language server',
    JA: 'language server',
    KO: 'language server',
    ZH: 'language server',
    ES: 'language server',
    FR: 'language server',
    DE: 'language server',
    PT: 'language server',
    AR: 'خادم اللغة',
  },
  'Zephyr could not find': {
    ID: 'Zephyr tidak menemukan',
    EN: 'Zephyr could not find',
    JA: 'Zephyr は次を見つけられませんでした:',
    KO: 'Zephyr가 다음을 찾지 못했습니다:',
    ZH: 'Zephyr 找不到',
    ES: 'Zephyr no encontró',
    FR: "Zephyr n'a pas trouvé",
    DE: 'Zephyr konnte nicht finden:',
    PT: 'O Zephyr não encontrou',
    AR: 'لم يتمكن Zephyr من العثور على',
  },
  'on your PATH. Install it, then check again to enable this server.': {
    ID: 'di PATH Anda. Pasang dulu, lalu periksa ulang untuk mengaktifkan server ini.',
    EN: 'on your PATH. Install it, then check again to enable this server.',
    JA: 'が PATH にありません。インストールしてから、もう一度確認してください。',
    KO: 'PATH에 없습니다. 설치한 뒤 다시 확인하세요.',
    ZH: '不在你的 PATH 中。请先安装，然后重新检查以启用此服务器。',
    ES: 'en tu PATH. Instálalo y vuelve a comprobar para activar este servidor.',
    FR: 'dans votre PATH. Installez-le, puis vérifiez à nouveau pour activer ce serveur.',
    DE: 'in deinem PATH. Installiere es und prüfe erneut, um diesen Server zu aktivieren.',
    PT: 'no seu PATH. Instale-o e verifique novamente para ativar este servidor.',
    AR: 'في PATH لديك. ثبّته ثم أعد الفحص لتفعيل هذا الخادم.',
  },
  'Found it. Switch this server on to use it.': {
    ID: 'Ketemu. Nyalakan server ini untuk memakainya.',
    EN: 'Found it. Switch this server on to use it.',
    JA: '見つかりました。このサーバーをオンにして使用してください。',
    KO: '찾았습니다. 이 서버를 켜서 사용하세요.',
    ZH: '已找到。开启此服务器即可使用。',
    ES: 'Encontrado. Activa este servidor para usarlo.',
    FR: 'Trouvé. Activez ce serveur pour l’utiliser.',
    DE: 'Gefunden. Schalte diesen Server ein, um ihn zu nutzen.',
    PT: 'Encontrado. Ative este servidor para usá-lo.',
    AR: 'تم العثور عليه. شغّل هذا الخادم لاستخدامه.',
  },
  'Checking...': {
    ID: 'Memeriksa...',
    EN: 'Checking...',
    JA: '確認中...',
    KO: '확인 중...',
    ZH: '正在检查...',
    ES: 'Comprobando...',
    FR: 'Vérification...',
    DE: 'Wird geprüft...',
    PT: 'Verificando...',
    AR: 'جارٍ الفحص...',
  },
  'Check again': {
    ID: 'Periksa lagi',
    EN: 'Check again',
    JA: '再確認',
    KO: '다시 확인',
    ZH: '重新检查',
    ES: 'Comprobar de nuevo',
    FR: 'Vérifier à nouveau',
    DE: 'Erneut prüfen',
    PT: 'Verificar novamente',
    AR: 'أعد الفحص',
  },
};

/* Penjaga: setiap kunci harus punya kesepuluh bahasa, sebelum menyentuh berkas. */
for (const [k, ter] of Object.entries(KUNCI)) {
  for (const b of KODE) {
    if (!ter[b]) throw new Error('terjemahan hilang: ' + b + ' untuk kunci: ' + k);
  }
}

const teks = readFileSync(BERKAS, 'utf8');
const baris = teks.split('\n');

/* Batas tiap kamus: dari baris pembukanya sampai baris penutupnya. Penutup
 * adalah baris `};` pada level indentasi nol.
 *
 * Dibandingkan setelah `\r` dipangkas: berkas ini memakai akhir baris CRLF, jadi
 * barisnya berbunyi `};\r` dan pencocokan `=== '};'` tidak pernah kena - itu
 * kesalahan yang sempat membuat kamus tidak ditemukan sama sekali. */
const peta = {};
for (let i = 0; i < baris.length; i += 1) {
  const m = baris[i].match(/^(?:export\s+)?const\s+([A-Z]{2})\s*(?::[^=]+)?=\s*\{/);
  if (m && KODE.includes(m[1])) {
    for (let j = i + 1; j < baris.length; j += 1) {
      if (baris[j].trim() === '};') { peta[m[1]] = { buka: i, tutup: j }; break; }
    }
  }
}

const kurangBahasa = KODE.filter((k) => !peta[k]);
if (kurangBahasa.length) {
  console.log('KAMUS TIDAK DITEMUKAN: ' + kurangBahasa.join(', '));
  process.exit(1);
}
console.log('batas kamus: ' + KODE.map((k) => k + '(' + peta[k].buka + '-' + peta[k].tutup + ')').join(' '));

/* Kunci mana yang belum ada di kamus mana pun. */
const belum = [];
for (const k of Object.keys(KUNCI)) {
  const adaDi = KODE.filter((b) => {
    const { buka, tutup } = peta[b];
    for (let j = buka; j < tutup; j += 1) {
      if (baris[j].includes(JSON.stringify(k) + ':') || baris[j].includes("'" + k + "':")) return true;
    }
    return false;
  });
  if (adaDi.length === 0) belum.push(k);
  else console.log('sudah ada di ' + adaDi.length + ' kamus: ' + k.slice(0, 50));
}

if (!belum.length) {
  console.log('semua kunci sudah ada');
  process.exit(0);
}
console.log('\nakan ditambahkan: ' + belum.length + ' kunci');

/* Disisipkan dari kamus TERAKHIR ke pertama, supaya nomor baris kamus yang belum
 * disentuh tidak bergeser. Menyisipkan dari depan akan membuat batas kamus
 * berikutnya salah dan kunci masuk ke kamus yang keliru. */
const urut = KODE.slice().reverse();
for (const b of urut) {
  const { tutup } = peta[b];
  let sisip = '';
  for (const k of belum) {
    sisip += '  ' + JSON.stringify(k) + ': ' + JSON.stringify(KUNCI[k][b]) + ',\n';
  }
  baris.splice(tutup, 0, ...sisip.trimEnd().split('\n'));
}

writeFileSync(BERKAS, baris.join('\n'));

/* ---------- verifikasi: baca ulang, hitung PER KAMUS ---------- */
const sesudah = readFileSync(BERKAS, 'utf8').split('\n');
const peta2 = {};
for (let i = 0; i < sesudah.length; i += 1) {
  const m = sesudah[i].match(/^(?:export\s+)?const\s+([A-Z]{2})\s*(?::[^=]+)?=\s*\{/);
  if (m && KODE.includes(m[1])) {
    for (let j = i + 1; j < sesudah.length; j += 1) {
      if (sesudah[j].trim() === '};') { peta2[m[1]] = { buka: i, tutup: j }; break; }
    }
  }
}

let gagal = 0;
console.log('\nverifikasi per kamus:');
for (const b of KODE) {
  const { buka, tutup } = peta2[b];
  const kurang = belum.filter((k) => {
    for (let j = buka; j < tutup; j += 1) if (sesudah[j].includes(JSON.stringify(k) + ':')) return false;
    return true;
  });
  /* Duplikat juga diperiksa: kunci yang sama dua kali dalam satu objek adalah
   * TS1117, dan itu kesalahan yang pernah terjadi di berkas ini. */
  const lihat = new Set();
  let dup = 0;
  for (let j = buka; j < tutup; j += 1) {
    const m = sesudah[j].match(/^\s{2}(['"])(.*?)\1\s*:/);
    if (!m) continue;
    if (lihat.has(m[2])) dup += 1;
    lihat.add(m[2]);
  }
  if (kurang.length || dup) gagal += 1;
  console.log('  ' + b + ': kurang ' + kurang.length + ', duplikat ' + dup + (kurang.length || dup ? '   <- MASALAH' : ''));
}

if (gagal) {
  console.log('\nADA MASALAH - jalankan npx tsc --noEmit dan periksa berkasnya');
  process.exit(1);
}
console.log('\nSEMUA KAMUS LENGKAP');
