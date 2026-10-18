/**
 * Add the `Auto (use the first provider with a key)` label to all 10 language
 * blocks in `i18n-extra.ts`, right after `models.active`'s existing neighbour.
 *
 * Placement rule: entries go after the LAST existing key that sorts before the
 * new one alphabetically, per block. The file is kept alphabetical per language,
 * so appending at the end of a block would still work but break that order.
 *
 * Anchor used here is a key that exists in every block and sorts just before:
 * `Automatic` is not present, so we anchor on the `models.active` label value's
 * key if present, else the block's `B` boundary. Simpler and robust: insert
 * before the first key starting with 'B' (case-insensitive) in each block.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BERKAS = 'src/lib/i18n-extra.ts';
const KUNCI = 'Auto (use the first provider with a key)';

const TERJEMAHAN = [
  'Otomatis (pakai provider pertama yang punya key)',
  'Auto (use the first provider with a key)',
  '自動（キーがある最初のプロバイダーを使用）',
  '자동 (키가 있는 첫 번째 공급자 사용)',
  '自动（使用第一个有密钥的提供方）',
  'Automático (usar el primer proveedor con clave)',
  'Automatique (utiliser le premier fournisseur avec une clé)',
  'Automatisch (ersten Anbieter mit Schlüssel verwenden)',
  'Automático (usar o primeiro provedor com chave)',
  'تلقائي (استخدم أول مزوّد لديه مفتاح)',
];

const baris = readFileSync(BERKAS, 'utf8').split(/\r?\n/);

/*
 * Find each block's insertion point: the first line whose key starts with 'B'
 * (the new key starts with 'A' + 'u', so it sorts before 'B' and after 'A').
 * Blocks are separated by the object literal boundaries, but scanning linearly
 * and inserting once per block in order is enough - there are exactly 10.
 */
const keluar = [];
let disisip = 0;
let sudahLewatAnchor = false;
for (let i = 0; i < baris.length; i++) {
  const b = baris[i];
  const m = /^\s*'([^']+)':/.exec(b);
  if (m && !sudahLewatAnchor && disisip < TERJEMAHAN.length) {
    const kunci = m[1];
    /* First 'B…' key after we have passed the 'A' region. */
    if (/^b/i.test(kunci)) {
      const indent = /^\s*/.exec(b)[0];
      keluar.push(`${indent}'${KUNCI}': '${TERJEMAHAN[disisip]}',`);
      disisip++;
      sudahLewatAnchor = true;
    }
  }
  keluar.push(b);
  /* Reset the anchor at a block boundary (a line that closes an object). */
  if (/^\s*\},?\s*$/.test(b) || /^\s*\};?\s*$/.test(b)) sudahLewatAnchor = false;
}

if (disisip !== TERJEMAHAN.length) {
  console.error(`GAGAL: cuma ${disisip} dari ${TERJEMAHAN.length} blok`);
  process.exit(1);
}
writeFileSync(BERKAS, keluar.join('\n'));
console.log(`ok: ${disisip} kunci ditambahkan`);
