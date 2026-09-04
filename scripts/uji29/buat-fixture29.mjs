// buat-fixture29.mjs — fixture fase 29 (multi-root + workspace trust).
//
// Membuat DUA folder root terpisah supaya multi-root benar-benar diuji:
//   .zephyr/uji29/root-a/   (repo git palsu: ada folder .git)
//   .zephyr/uji29/root-b/
// plus file .code-workspace yang menunjuk keduanya dengan path RELATIF.

import fs from 'node:fs';
import path from 'node:path';

const akar = path.resolve(import.meta.dirname, '..', '..');
const dir = path.join(akar, '.zephyr', 'uji29');

// Bersihkan dulu: uji sebelumnya bisa meninggalkan settings folder.
//
// JEBAKAN: `rmSync` gagal EBUSY (rmdir) kalau app masih memegang folder ini —
// file watcher fase 04 menahan handle direktori, dan pindah workspace pun tidak
// selalu melepasnya seketika. Jadi folder TIDAK dihapus; isinya saja yang
// ditulis ulang. Fixture ini deterministik (nama file tetap), jadi menulis
// ulang cukup — yang perlu dibersihkan hanya file yang mungkin ditambah uji.
fs.mkdirSync(dir, { recursive: true });
for (const sisa of ['hasil-simpan.code-workspace']) {
  for (const induk of [dir, path.join(dir, 'root-a'), path.join(dir, 'root-b')]) {
    try {
      fs.rmSync(path.join(induk, sisa), { force: true });
    } catch {
      /* tidak ada / dipegang proses lain — bukan alasan gagal */
    }
  }
}

const rootA = path.join(dir, 'root-a');
const rootB = path.join(dir, 'root-b');
fs.mkdirSync(path.join(rootA, 'src'), { recursive: true });
fs.mkdirSync(path.join(rootB, 'lib'), { recursive: true });

// root-a: 3 entri di level atas (src/, a1.txt, a2.txt) + penanda repo git.
fs.mkdirSync(path.join(rootA, '.git'), { recursive: true });
fs.writeFileSync(path.join(rootA, '.git', 'HEAD'), 'ref: refs/heads/main\n');
fs.writeFileSync(path.join(rootA, 'a1.txt'), 'isi a1 root-a\n');
fs.writeFileSync(path.join(rootA, 'a2.txt'), 'isi a2 root-a\n');
fs.writeFileSync(path.join(rootA, 'src', 'index.ts'), 'export const dariA = 1;\n');

// root-b: 4 entri atas (.zephyr, b1.txt, b2.txt, lib) — jumlah SENGAJA beda
// dari root-a (3) supaya tree per root bisa dibedakan dari jumlah barisnya.
fs.writeFileSync(path.join(rootB, 'b1.txt'), 'isi b1 root-b\n');
fs.writeFileSync(path.join(rootB, 'b2.txt'), 'isi b2 root-b\n');
fs.writeFileSync(path.join(rootB, 'lib', 'util.ts'), 'export const dariB = 2;\n');

// Settings tingkat FOLDER untuk root-b: tabSize 3 (angka yang tidak muncul
// di default maupun user settings, jadi asalnya tak mungkin ambigu).
fs.mkdirSync(path.join(rootB, '.zephyr'), { recursive: true });
fs.writeFileSync(
  path.join(rootB, '.zephyr', 'settings.json'),
  `${JSON.stringify({ editor: { tabSize: 3 } }, null, 2)}\n`,
);

// .code-workspace dengan path RELATIF + komentar (JSONC) + settings workspace.
const wsFile = path.join(dir, 'uji29.code-workspace');
fs.writeFileSync(
  wsFile,
  `{
  // fase 29: dua folder, path relatif terhadap file ini.
  "folders": [
    { "path": "./root-a", "name": "Root A" },
    { "path": "./root-b", "name": "Root B" }
  ],
  "settings": {
    "editor": { "tabSize": 8 }
  }
}
`,
);

// Workspace kedua untuk uji "folder hilang dilewati, bukan membatalkan".
fs.writeFileSync(
  path.join(dir, 'sebagian-hilang.code-workspace'),
  `{
  "folders": [
    { "path": "./root-a" },
    { "path": "./folder-yang-tidak-ada" }
  ]
}
`,
);

console.log(`fixture 29 siap di ${dir}`);
for (const f of fs.readdirSync(dir)) console.log(`  ${f}`);
console.log(`root-a: ${fs.readdirSync(rootA).join(', ')}`);
console.log(`root-b: ${fs.readdirSync(rootB).join(', ')}`);
