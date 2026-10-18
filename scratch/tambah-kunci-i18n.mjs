/**
 * Add the new i18n key to all 10 language blocks in one pass.
 *
 * The key is `Screenshot attached ({path})` - the toast that now reports the
 * temp file a pasted screenshot was written to, so `modlens` can open it.
 *
 * Placement matters: each entry goes right AFTER the existing
 * `Screenshot pasted as an attachment` line in the same block, because the file
 * is sorted alphabetically per language and a key dropped at the end of a block
 * would still work but break the order the file is kept in.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n-extra.ts';
const KUNCI_LAMA = "'Screenshot pasted as an attachment'";

/** One translation per block, in the order the blocks appear in the file. */
const TERJEMAHAN = [
  // id
  "'Screenshot attached ({path})': 'Screenshot dilampirkan ({path})',",
  // en
  "'Screenshot attached ({path})': 'Screenshot attached ({path})',",
  // ja
  "'Screenshot attached ({path})': 'スクリーンショットを添付しました（{path}）',",
  // ko
  "'Screenshot attached ({path})': '스크린샷이 첨부되었습니다 ({path})',",
  // zh
  "'Screenshot attached ({path})': '截图已作为附件添加（{path}）',",
  // es
  "'Screenshot attached ({path})': 'Captura de pantalla adjuntada ({path})',",
  // fr
  "'Screenshot attached ({path})': 'Capture d’écran jointe ({path})',",
  // de
  "'Screenshot attached ({path})': 'Screenshot angehängt ({path})',",
  // pt
  "'Screenshot attached ({path})': 'Captura de tela anexada ({path})',",
  // ar
  "'Screenshot attached ({path})': 'أُرفقت لقطة الشاشة ({path})',",
];

const baris = readFileSync(BERKAS, 'utf8').split(/\r?\n/);
const keluar = [];
let sudah = 0;
for (const b of baris) {
  keluar.push(b);
  if (b.trim().startsWith(KUNCI_LAMA) && sudah < TERJEMAHAN.length) {
    /* Same indentation as the line we are following. */
    const indent = /^\s*/.exec(b)[0];
    keluar.push(indent + TERJEMAHAN[sudah]);
    sudah++;
  }
}
if (sudah !== TERJEMAHAN.length) {
  console.error(`GAGAL: cuma ${sudah} dari ${TERJEMAHAN.length} blok ditemukan`);
  process.exit(1);
}
writeFileSync(BERKAS, keluar.join('\n'));
console.log(`ok: ${sudah} kunci ditambahkan`);
