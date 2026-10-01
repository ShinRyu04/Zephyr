// buat-fixture23.mjs — writes the phase 23 fixture before verify23 attaches.
//
// The fixture has to live INSIDE the repo, because tasks_load looks up
// .zephyr/tasks.json relative to the open workspace. Both locations are in
// .gitignore, so nothing here can leak into a commit.
//
// Run it directly:  node scripts/uji23/buat-fixture23.mjs
// verify23.mjs runs it automatically when .zephyr/tasks.json is missing.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const TASKS = `{
  // Fixture for verify23 (phase 23). Deliberately JSONC: the comments are
  // there so tasks.rs comment stripping gets exercised too.
  // 9 entries: 8 valid + 1 broken.
  "version": "1.0.0",
  "tasks": [
    {
      "label": "uji: build tsc",
      "type": "shell",
      "command": "npx",
      "args": [
        "tsc",
        "--noEmit",
        "--pretty",
        "false",
        "--target",
        "es2020",
        "--skipLibCheck",
        "--types",
        "--module",
        "esnext",
        "--moduleResolution",
        "bundler",
        "scripts/uji23/geometry.ts"
      ],
      "group": { "id": "build", "kind": "build", "isDefault": true },
      "problemMatcher": ["$tsc"]
    },
    {
      "label": "uji: langkah satu",
      "command": "node",
      "args": ["scripts/uji23/langkah-satu.js"]
    },
    {
      "label": "uji: langkah dua",
      "command": "node",
      "args": ["scripts/uji23/langkah-dua.js"],
      "dependsOn": ["uji: langkah satu"]
    },
    {
      "label": "uji: rantai",
      "command": "node",
      "args": ["scripts/uji23/rantai.js"],
      "dependsOn": ["uji: langkah dua"]
    },
    {
      "label": "uji: server port",
      "command": "node",
      "args": ["scripts/uji23/server.js"],
      "isBackground": true,
      "background": { "beginsPattern": "listening on http://localhost:8123" }
    },
    {
      "label": "uji: watch",
      "command": "node",
      "args": ["scripts/uji23/watch.js"],
      "isBackground": true,
      "background": { "beginsPattern": "Ronde \\\\d+ mulai", "endsPattern": "Ronde \\\\d+ selesai" },
      "problemMatcher": ["$tsc"]
    },
    {
      "label": "uji: cek cepat",
      "command": "node",
      "args": ["-e", "console.log('cek cepat selesai')"]
    },
    {
      "label": "uji: kelompok lain",
      "command": "node",
      "args": ["-e", "console.log('kelompok lain selesai')"],
      "group": "kelompok-lain"
    },
    {
      // Broken entry: no command, which is required, so the parser must
      // REJECT it.
      "label": "uji: rusak"
    }
  ]
}
`;

// Three deliberate type errors so the $tsc matcher yields three Problems;
// TS2322 sits on line 12 because the harness opens that exact file:line.
const GEOMETRY = `// Fixture TypeScript for verify23. Three errors so the $tsc matcher
// yields three Problems, one of them TS2322 exactly on line 12.

type Titik = { x: number; y: number };

export function geser(p: Titik, dx: number, dy: number): Titik {
  return { x: p.x + dx, y: p.y + dy };
}

export const asal: Titik = { x: 0, y: 0 };

export const salah: Titik = { x: 'bukan angka' };

export function jumlah(a: number, b: number): number {
  return a + b;
}

export const label: string = 42;

export function panggil(): void {
  jumlah('satu', 2);
}
`;

const LANGKAH_SATU = `console.log('langkah satu selesai');\n`;
const LANGKAH_DUA = `console.log('langkah dua selesai');\n`;
const RANTAI = `console.log('rantai selesai');\n`;

const SERVER = `// Fixture server for verify23 V4: an isBackground task that prints
// "listening on http://localhost:8123" so deteksi_port in tasks.rs picks up
// 8123 and PortsStore creates the Ports entry automatically.
// Intent: the process stays alive so V5 can prove the port really serves
// HTTP 200 before it is stopped.

import { createServer } from 'node:http';

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('uji23\\n');
});

server.on('error', (err) => {
  console.log('gagal listen: ' + err.message);
});

server.listen(8123, '127.0.0.1', () => {
  console.log('listening on http://localhost:8123');
});

setInterval(() => {}, 1 << 30);
`;

// tasks.rs starts a background task with aktif=false, so a round only finishes
// when a beginsPattern line is followed by an endsPattern line ("end" event ->
// ready[id]=true). The harness waits for round 1, then reads ready 500ms after
// seeing "Found 0 errors", hence the short gap before "Ronde 2 selesai".
const WATCH = `// Fixture watch for verify23 V3.
//
// tasks.rs starts a background task with aktif=false, so a round only finishes
// when a beginsPattern line (aktif=true) is followed by an endsPattern line
// (aktif=false -> "end" event -> ready[id]=true in the store). The harness
// waits for round 1 to be ready, then waits for the "Found 0 errors" line and
// reads ready 500ms later. That is why the gap before "Ronde 2 selesai" is
// deliberately short: the round-2 end event must already be processed by the
// store when the harness reads it.
//
// The tsc-looking lines use the bare "Found N errors" shape with no
// file(line,col) prefix, so the $tsc matcher adds no Problems from this task.

const baris = [
  '> npx tsc --noEmit --watch',
  'Starting compilation in watch mode...',
  'Ronde 1 mulai',
  'Found 1 errors. Watching for file changes.',
  'Ronde 1 selesai',
  'Ronde 2 mulai',
  'Found 0 errors. Watching for file changes.',
  'Ronde 2 selesai',
  'Selesai menunggu perubahan berkas.',
];

// Delay AFTER each printed line.
const jeda = [400, 500, 600, 500, 2000, 500, 300, 400];

let i = 0;

function berikut() {
  if (i >= baris.length) {
    setInterval(() => {}, 1 << 30);
    return;
  }
  console.log(baris[i]);
  const d = jeda[i] ?? 400;
  i += 1;
  setTimeout(berikut, d);
}

setTimeout(berikut, 300);
`;

const DIR_UJI = resolve(AKAR, 'scripts', 'uji23');
const DIR_ZEPHYR = resolve(AKAR, '.zephyr');

const tulis = (p, isi) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, isi, 'utf8');
};

tulis(resolve(DIR_ZEPHYR, 'tasks.json'), TASKS);
tulis(resolve(DIR_UJI, 'geometry.ts'), GEOMETRY);
tulis(resolve(DIR_UJI, 'langkah-satu.js'), LANGKAH_SATU);
tulis(resolve(DIR_UJI, 'langkah-dua.js'), LANGKAH_DUA);
tulis(resolve(DIR_UJI, 'rantai.js'), RANTAI);
tulis(resolve(DIR_UJI, 'server.js'), SERVER);
tulis(resolve(DIR_UJI, 'watch.js'), WATCH);

const ada = [
  '.zephyr/tasks.json',
  'scripts/uji23/geometry.ts',
  'scripts/uji23/langkah-satu.js',
  'scripts/uji23/langkah-dua.js',
  'scripts/uji23/rantai.js',
  'scripts/uji23/server.js',
  'scripts/uji23/watch.js',
];
console.log(`fixture23 siap (${ada.filter((f) => existsSync(resolve(AKAR, f))).length}/${ada.length} berkas)`);
for (const f of ada) {
  if (!existsSync(resolve(AKAR, f))) console.log('  HILANG: ' + f);
}
