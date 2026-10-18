// Ubah 24 tema dari daftar BAWAAN menjadi PAKET MARKETPLACE.
//
// Alasan: tema yang dipasang langsung ke pemilih membuat daftar Themes penuh
// dengan pilihan yang tidak pernah diminta. Marketplace adalah tempat orang
// MEMILIH memasang apa. Generator ini:
//
//   1. menghapus 24 entri dari THEMES di src/lib/themes.ts
//   2. menghapus impor themes-marketplace.css
//   3. menulis 24 paket tema ke ext_bundled_extra.rs (bentuk yang SAMA dengan
//      TEMA_MALAM yang sudah terbukti jalan)
//   4. mendaftarkannya di PAKET_EXTRA
const fs = require('fs');

const TEMA = JSON.parse(fs.readFileSync('scratch/tema-baru.json', 'utf8'));

/* ── 1+2. Bersihkan themes.ts dan App.tsx ──────────────────────────────── */

let themes = fs.readFileSync('src/lib/themes.ts', 'utf8');
const E = themes.includes('\r\n') ? '\r\n' : '\n';
for (const t of TEMA) {
  themes = themes.replace(new RegExp(`^ *\\{ id: '${t.id}'[^\\n]*\\n`, 'gm'), '');
}
/* Hapus blok komentar penanda yang tadi disisipkan generator. */
themes = themes.replace(
  / *\/\*\r?\n *\* Tema marketplace\.[\s\S]*?\*\/\r?\n/,
  '',
);
fs.writeFileSync('src/lib/themes.ts', themes, 'utf8');

let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace(
  /\/\*\r?\n \* Tema marketplace[\s\S]*?\*\/\r?\nimport '\.\/styles\/themes-marketplace\.css';\r?\n/,
  '',
);
fs.writeFileSync('src/App.tsx', app, 'utf8');

/* Berkas CSS-nya dihapus: temanya sekarang dimuat lewat paket, bukan impor. */
try {
  fs.unlinkSync('src/styles/themes-marketplace.css');
} catch {
  /* sudah tidak ada */
}

/* ── 3. Tulis paket tema ke Rust ───────────────────────────────────────── */

const css = fs.readFileSync('scratch/themes-marketplace.css.bak', 'utf8');

/** Ambil blok deklarasi CSS satu tema, jadi JSON `colors` gaya VS Code. */
function warnaTema(id) {
  const re = new RegExp(`\\[data-theme='${id}'\\] \\{([\\s\\S]*?)\\n\\}`, 'g');
  const m = re.exec(css);
  if (!m) throw new Error(`tema ${id} tidak ada di CSS`);
  const colors = {};
  for (const baris of m[1].split('\n')) {
    const kv = baris.match(/^\s*(--[a-z0-9-]+):\s*(.+?);\s*$/i);
    if (kv) colors[kv[1]] = kv[2];
  }
  return colors;
}

const konstanta = [];
for (const t of TEMA) {
  const nama = 'TEMA_MKT_' + t.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const manifest = {
    id: `zephyr.tema-${t.id}`,
    name: t.label,
    publisher: 'zephyr',
    version: '1.0.0',
    description: t.hint,
    engines: { zephyr: '>=1.0' },
    categories: ['Themes'],
    contributes: {
      themes: [{ label: t.label, kind: t.kind, path: `./themes/${t.id}.json` }],
    },
  };
  const isiTema = { colors: warnaTema(t.id) };
  konstanta.push(
    `pub(super) const ${nama}: &str = r##"${JSON.stringify(manifest, null, 2)}"##;`,
  );
  konstanta.push('');
  konstanta.push(
    `pub(super) const ${nama}_JSON: &str = r##"${JSON.stringify(isiTema, null, 2)}"##;`,
  );
  konstanta.push('');
}

let extra = fs.readFileSync('src-tauri/src/ext_bundled_extra.rs', 'utf8');
const ER = extra.includes('\r\n') ? '\r\n' : '\n';
const AWAL = '/* ══ TEMA MARKETPLACE — DIHASILKAN scratch/gen-tema-marketplace.cjs ══ */';
const AKHIR = '/* ══ AKHIR TEMA MARKETPLACE ══ */';
const iA = extra.indexOf(AWAL);
if (iA >= 0) {
  const iB = extra.indexOf(AKHIR);
  extra = extra.slice(0, iA) + extra.slice(iB + AKHIR.length);
}
const blok = [
  '',
  AWAL,
  '/*',
  ' * Tema marketplace.',
  ' *',
  ' * SATU PAKET PER TEMA, dan itu disengaja: tema adalah pilihan, bukan bawaan.',
  ' * Memasangnya langsung ke pemilih membuat daftar Themes penuh dengan hal yang',
  ' * tidak pernah diminta; di marketplace pembaca memilih sendiri mana yang mau',
  ' * dipasang, sama seperti ekstensi lain.',
  ' *',
  ' * Setiap tema mendefinisikan 11 token `--syn-*` sendiri, jadi memasangnya',
  ' * benar-benar mengubah WARNA KODE - bukan hanya warna sidebar.',
  ' */',
  '',
  ...konstanta,
  AKHIR,
  '',
].join(ER);
extra = extra.trimEnd() + ER + blok;
fs.writeFileSync('src-tauri/src/ext_bundled_extra.rs', extra, 'utf8');

/* ── 4. Daftarkan di PAKET_EXTRA ──────────────────────────────────────── */

let bundled = fs.readFileSync('src-tauri/src/ext_bundled.rs', 'utf8');
const EB = bundled.includes('\r\n') ? '\r\n' : '\n';
const A2 = '/* ══ TEMA MARKETPLACE (didaftarkan) ══ */';
const K2 = '/* ══ AKHIR TEMA MARKETPLACE (didaftarkan) ══ */';
const jA = bundled.indexOf(A2);
if (jA >= 0) {
  const jB = bundled.indexOf(K2);
  bundled = bundled.slice(0, jA) + bundled.slice(jB + K2.length);
}
const daftar = TEMA.map((t) => {
  const nama = 'TEMA_MKT_' + t.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return `    (\n        "zephyr.tema-${t.id}",\n        &[\n            ("zephyr-extension.json", extra::${nama}),\n            ("themes/${t.id}.json", extra::${nama}_JSON),\n        ],\n    ),`;
});
const blokDaftar = [A2, ...daftar, K2].join(EB);
const idxP = bundled.indexOf('const PAKET: &[Paket] = &[');
const tutup = bundled.indexOf('\n];', idxP);
bundled = bundled.slice(0, tutup) + EB + blokDaftar + bundled.slice(tutup);
fs.writeFileSync('src-tauri/src/ext_bundled.rs', bundled, 'utf8');

console.log('tema jadi paket marketplace:', TEMA.length);
