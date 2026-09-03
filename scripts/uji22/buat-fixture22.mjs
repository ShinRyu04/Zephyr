// buat-fixture22.mjs — fixture fase 22 (Debugger DAP).
//
// launch.json WAJIB ditulis lewat skrip, bukan write_file biasa, karena harus
// memuat komentar JSONC (`//` dan `/* */`) yang validator JSON menolak — pola
// yang sama dipakai fixture tasks.json fase 23.
//
// Program uji sengaja SEDERHANA dan deterministik: fungsi bersarang supaya
// call stack punya >1 frame, variabel lokal dengan nilai yang bisa dicek
// namanya, dan objek supaya expand tree variables ada isinya.

import { mkdirSync, writeFileSync } from 'node:fs';

const DIR = 'D:/Zephyr/.zephyr/uji22';
mkdirSync(DIR, { recursive: true });

// ── program yang di-debug ──
//
// Baris PENTING (dipakai harness sebagai nomor breakpoint):
//   baris 9  = dalam tambah()  → breakpoint utama
//   baris 15 = dalam kali()    → target Step Into
//   baris 21 = di main()       → setelah panggilan, target Step Out/Over
writeFileSync(
  `${DIR}/program.js`,
  `// program uji debugger fase 22 — jangan diubah tanpa memperbarui verify22.
'use strict';

function tambah(a, b) {
  const hasil = a + b;
  const info = { operasi: 'tambah', a, b, hasil };
  const daftar = [a, b, hasil];
  // baris 9: breakpoint utama
  return hasil + daftar.length - 3 + (info.a - a);
}

function kali(a, b) {
  const produk = a * b;
  // baris 15: target Step Into
  return produk;
}

function main() {
  const x = tambah(2, 3);
  const y = kali(x, 4);
  // baris 21: setelah kedua panggilan
  console.log('SELESAI', x, y);
  return y;
}

main();
`,
  'utf8',
);

// Program kedua: sengaja melempar, untuk menguji exception & output stderr.
writeFileSync(
  `${DIR}/lempar.js`,
  `'use strict';
function pecah() {
  throw new Error('UJI22 exception sengaja');
}
pecah();
`,
  'utf8',
);

// ── launch.json (JSONC: WAJIB ada komentar) ──
//
// Ditulis ke `.zephyr/launch.json`, BUKAN ke folder uji22: `dap_load` hanya
// mencari di `.zephyr/` atau `.vscode/` (relatif workspace), jadi fixture di
// subfolder tidak akan pernah terbaca.
writeFileSync(
  'D:/Zephyr/.zephyr/launch.json',
  `{
  // launch.json fixture fase 22. Komentar ini yang membuktikan parser JSONC.
  "version": "0.2.0",
  "configurations": [
    /* Konfigurasi utama: node launch dengan stopOnEntry false. */
    {
      "name": "Uji Node",
      "type": "node",
      "request": "launch",
      "program": ".zephyr/uji22/program.js",
      "cwd": "\${workspaceFolder}",
      // field adapter yang TIDAK ada di skema kita — harus tetap diteruskan
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Uji Exception",
      "type": "node",
      "request": "launch",
      "program": ".zephyr/uji22/lempar.js"
    },
    {
      "name": "Uji Python",
      "type": "python",
      "request": "launch",
      "program": ".zephyr/uji22/tidak-ada.py"
    },
    // Tiga entri BERIKUT sengaja rusak — harus masuk daftar invalid
    // dengan alasan, bukan didiamkan.
    { "type": "node", "request": "launch" },
    { "name": "tanpa type" },
    { "name": "request aneh", "type": "node", "request": "restart" }
  ]
}
`,
  'utf8',
);

console.log('fixture22 siap di', DIR);
