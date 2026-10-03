/*
 * Kunci untuk toggle avatar di Settings -> Agents.
 *
 * Dua kunci: nama setelannya, dan keterangan yang menjelaskan APA yang berubah
 * di layar. Keterangan itu penting - "Tampilkan avatar" saja membuat pembaca
 * menebak apakah maksudnya daftar pesan, kartu subagent, atau yang lain.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n-extra.ts';
const KODE = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];

const KUNCI = {
  'agents.chatAvatar': {
    ID: 'Avatar di chat',
    EN: 'Chat avatars',
    JA: 'チャットのアバター',
    KO: '채팅 아바타',
    ZH: '聊天头像',
    ES: 'Avatares en el chat',
    FR: 'Avatars dans le chat',
    DE: 'Avatare im Chat',
    PT: 'Avatares no chat',
    AR: 'صور في الدردشة',
  },
  'the robot and your photo beside each message': {
    ID: 'robot dan foto Anda di samping tiap pesan',
    EN: 'the robot and your photo beside each message',
    JA: '各メッセージの横にロボットとあなたの写真',
    KO: '각 메시지 옆에 로봇과 내 사진',
    ZH: '每条消息旁的机器人和你的照片',
    ES: 'el robot y tu foto junto a cada mensaje',
    FR: 'le robot et votre photo à côté de chaque message',
    DE: 'der Roboter und dein Foto neben jeder Nachricht',
    PT: 'o robô e a sua foto ao lado de cada mensagem',
    AR: 'الروبوت وصورتك بجانب كل رسالة',
  },
};

for (const [k, ter] of Object.entries(KUNCI)) {
  for (const b of KODE) if (!ter[b]) throw new Error('terjemahan hilang: ' + b + ' / ' + k);
}

const baris = readFileSync(BERKAS, 'utf8').split('\n');
const peta = {};
for (let i = 0; i < baris.length; i += 1) {
  const m = baris[i].match(/^(?:export\s+)?const\s+([A-Z]{2})\s*(?::[^=]+)?=\s*\{/);
  if (m && KODE.includes(m[1])) {
    for (let j = i + 1; j < baris.length; j += 1) {
      if (baris[j].trim() === '};') { peta[m[1]] = { buka: i, tutup: j }; break; }
    }
  }
}
const takAda = KODE.filter((k) => !peta[k]);
if (takAda.length) { console.log('KAMUS TIDAK DITEMUKAN: ' + takAda.join(', ')); process.exit(1); }

/* Kedua jenis kutip, karena berkas ini memakai keduanya. */
const duaBentuk = (k) => ["'" + k + "':", '"' + k + '":'];
const adaDi = (b, k) => {
  const { buka, tutup } = peta[b];
  for (let j = buka; j < tutup; j += 1) if (duaBentuk(k).some((x) => baris[j].includes(x))) return true;
  return false;
};

const perlu = [];
for (const b of KODE) {
  const kurang = Object.keys(KUNCI).filter((k) => !adaDi(b, k));
  if (kurang.length) perlu.push({ b, kurang });
}
if (!perlu.length) { console.log('semua kunci sudah ada di semua kamus'); process.exit(0); }
console.log('kamus yang perlu ditambah: ' + perlu.length);

/* Dari kamus terakhir ke pertama. */
for (const b of KODE.slice().reverse()) {
  const p = perlu.find((x) => x.b === b);
  if (!p) continue;
  let sisip = '';
  for (const k of p.kurang) sisip += '  ' + JSON.stringify(k) + ': ' + JSON.stringify(KUNCI[k][b]) + ',\n';
  baris.splice(peta[b].tutup, 0, ...sisip.trimEnd().split('\n'));
}

writeFileSync(BERKAS, baris.join('\n'));

/* Verifikasi per kamus + duplikat. */
const s = readFileSync(BERKAS, 'utf8').split('\n');
const p2 = {};
for (let i = 0; i < s.length; i += 1) {
  const m = s[i].match(/^(?:export\s+)?const\s+([A-Z]{2})\s*(?::[^=]+)?=\s*\{/);
  if (m && KODE.includes(m[1])) {
    for (let j = i + 1; j < s.length; j += 1) {
      if (s[j].trim() === '};') { p2[m[1]] = { buka: i, tutup: j }; break; }
    }
  }
}
let gagal = 0;
for (const b of KODE) {
  const { buka, tutup } = p2[b];
  const lihat = new Set();
  let dup = 0;
  let n = 0;
  for (let j = buka; j < tutup; j += 1) {
    const m = s[j].match(/^\s{2}(['"])(.*?)\1\s*:/);
    if (!m) continue;
    if (lihat.has(m[2])) dup += 1;
    lihat.add(m[2]);
    if (KUNCI[m[2]]) n += 1;
  }
  if (n !== Object.keys(KUNCI).length || dup) { gagal += 1; console.log('  ' + b + ': ' + n + '/' + Object.keys(KUNCI).length + ', duplikat ' + dup + '   <- MASALAH'); }
}
console.log(gagal ? 'ADA MASALAH' : 'SEMUA ' + KODE.length + ' KAMUS LENGKAP');
process.exit(gagal ? 1 : 0);
