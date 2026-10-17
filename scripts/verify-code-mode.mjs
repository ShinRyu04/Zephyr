/**
 * `execute` — Code Mode must not be an escape hatch.
 *
 * The value of Code Mode is that a script can call tools. The RISK is that it
 * can call tools the reader disabled, or reach the page directly and skip the
 * gate entirely. So the checks that matter are about refusal, not about features:
 *
 *   1. every tool call goes through the SAME entry point a normal call uses;
 *   2. a script naming `window`, `fetch`, `import()`, `require`, `process`, … is
 *      refused BEFORE it runs;
 *   3. a tool the gate refuses stays refused when called from a script;
 *   4. a script that throws reports how far it got, not just "failed".
 *
 * Run: node scripts/verify-code-mode.mjs
 *
 * Pure: the tool takes an injected bridge, so no app and no filesystem.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(akar, rel), 'utf8');

const { executeTool } = await import(
  pathToFileURL(join(akar, 'src/lib/zephyrTools/execute.ts')).href
);

let lulus = 0;
let gagal = 0;
const hasil = (nama, ok, detail) => {
  if (ok) {
    lulus++;
    console.log(`  ok    ${nama}`);
  } else {
    gagal++;
    console.log(`  GAGAL ${nama}${detail ? `\n         ${detail}` : ''}`);
  }
};

/** A bridge that records what it was asked to do. */
function bridge(hasilTool = {}) {
  const dipanggil = [];
  return {
    dipanggil,
    b: {
      panggil: async (nama, args) => {
        dipanggil.push([nama, args]);
        if (nama in hasilTool) return hasilTool[nama];
        return `hasil-${nama}`;
      },
      tersedia: () => ['read_file', 'grep', 'apply_patch'],
    },
  };
}

console.log('\n1. Skrip memanggil tool dan mengembalikan hasilnya');
{
  const { b, dipanggil } = bridge({ read_file: 'ISI-A' });
  const t = executeTool(b);
  const r = await t.run({
    skrip: 'const a = await call("read_file", { path: "a.ts" }); return a;',
  });
  hasil('tool dipanggil sekali', dipanggil.length === 1, JSON.stringify(dipanggil));
  hasil('nama dan argumen diteruskan apa adanya', dipanggil[0][0] === 'read_file' && dipanggil[0][1].path === 'a.ts', JSON.stringify(dipanggil[0]));
  hasil('hasil tool terlihat model', r.includes('ISI-A'), r);
  hasil('laporan menyebut jumlah panggilan', /1 panggilan/.test(r), r);
}

console.log('\n2. Beberapa panggilan berurutan dalam satu skrip');
{
  const { b, dipanggil } = bridge();
  const t = executeTool(b);
  const r = await t.run({
    skrip: [
      'const a = await call("read_file", { path: "a" });',
      'const c = await call("grep", { pattern: "TODO" });',
      'log("selesai", a.length);',
      'return a + "|" + c;',
    ].join('\n'),
  });
  hasil('dua tool dipanggil', dipanggil.length === 2, JSON.stringify(dipanggil.map((d) => d[0])));
  hasil('log ikut di laporan', /Catatan: selesai/.test(r), r);
  hasil('urutan dilaporkan', /read_file.*grep/.test(r), r);
}

console.log('\n3. Binding terlarang DITOLAK sebelum skrip berjalan');
const TERLARANG = ['window', 'document', 'fetch', 'import', 'require', 'process', 'globalThis', 'localStorage', 'XMLHttpRequest'];
for (const nama of TERLARANG) {
  const { b, dipanggil } = bridge();
  const t = executeTool(b);
  let pesan = '';
  try {
    const skrip = nama === 'import' ? 'const m = await import("fs"); return m;' : `return ${nama};`;
    await t.run({ skrip });
  } catch (e) {
    pesan = e.message;
  }
  hasil(
    `"${nama}" ditolak`,
    /tidak tersedia di Code Mode/.test(pesan),
    pesan || '(DITERIMA - sandbox bocor)',
  );
  hasil(`"${nama}" tidak sempat memanggil tool`, dipanggil.length === 0, JSON.stringify(dipanggil));
}

console.log('\n4. Nama yang MENGANDUNG kata terlarang tidak ikut ditolak');
{
  const { b, dipanggil } = bridge();
  const t = executeTool(b);
  /*
   * `windowWidth` and `processCount` are ordinary variable names. A substring
   * scan without word boundaries would refuse them - the false positive that
   * makes a sandbox unusable in practice.
   */
  const r = await t.run({
    skrip: [
      'const windowWidth = 120;',
      'const processCount = 3;',
      'const a = await call("read_file", { path: "a" });',
      'return String(windowWidth + processCount) + a;',
    ].join('\n'),
  });
  hasil('variabel bernama mirip tetap boleh', r.includes('123'), r);
  hasil('tool tetap bisa dipanggil', dipanggil.length === 1, JSON.stringify(dipanggil));
}

console.log('\n5. Tool yang ditolak gate tetap ditolak dari dalam skrip');
{
  /* The bridge is the gate's mouthpiece: it throws exactly as the real one does. */
  const b = {
    panggil: async (nama) => {
      if (nama === 'write_file') throw new Error('Tool "write_file" sedang dinonaktifkan di pengaturan tool.');
      return 'ok';
    },
    tersedia: () => ['read_file'],
  };
  const t = executeTool(b);
  let pesan = '';
  try {
    await t.run({ skrip: 'return await call("write_file", { path: "x" });' });
  } catch (e) {
    pesan = e.message;
  }
  hasil('penolakan gate diteruskan ke model', /dinonaktifkan di pengaturan tool/.test(pesan), pesan || '(lolos)');
  hasil('skrip disebut berhenti, bukan sukses', /skrip berhenti/.test(pesan), pesan);
}

console.log('\n6. Skrip yang gagal melaporkan sejauh mana ia sampai');
{
  const { b } = bridge({ read_file: 'x' });
  const b2 = {
    panggil: async (nama) => {
      if (nama === 'grep') throw new Error('grep meledak');
      return 'ok';
    },
    tersedia: b.tersedia,
  };
  const t = executeTool(b2);
  let pesan = '';
  try {
    await t.run({
      skrip: 'await call("read_file", {}); await call("grep", {}); return 1;',
    });
  } catch (e) {
    pesan = e.message;
  }
  hasil('menyebut tool yang sudah dipanggil', /Sudah dipanggil: read_file/.test(pesan), pesan);
  hasil('tidak menyebut tool yang belum jalan sebagai sudah', !/Sudah dipanggil:.*grep/.test(pesan), pesan);
}

console.log('\n7. Skrip kosong / tidak valid ditolak dengan jelas');
{
  const t = executeTool(bridge().b);
  let pesan = '';
  try {
    await t.run({ skrip: '   ' });
  } catch (e) {
    pesan = e.message;
  }
  hasil('skrip kosong ditolak', /butuh "skrip"/.test(pesan), pesan || '(diterima)');
}
{
  const t = executeTool(bridge().b);
  let pesan = '';
  try {
    await t.run({ skrip: 'return (((;' });
  } catch (e) {
    pesan = e.message;
  }
  hasil('skrip tidak valid ditolak saat kompilasi', /tidak bisa dikompilasi/.test(pesan), pesan || '(diterima)');
}

console.log('\n8. Kode: satu pintu, bukan dua');
const agentTools = baca('src/lib/agentTools.ts');
hasil(
  'execute memakai jalankanAgentTool sebagai panggil',
  /panggil: \(nama, args\) => jalankanAgentTool\(nama, args\)/.test(agentTools),
  'ada dispatcher kedua - gate bisa terlewat di satu jalur',
);
hasil(
  'daftar tool yang terlihat skrip = daftar yang dikirim ke model',
  /tersedia: \(\) => agentToolSpecs\(\)\.map/.test(agentTools),
  'skrip bisa melihat tool yang tidak ditawarkan',
);
hasil(
  'execute TIDAK mengimpor store gate sendiri',
  !/from '\.\/toolGate'/.test(baca('src/lib/zephyrTools/execute.ts')),
  'gate diperiksa di dua tempat - satu di antaranya akan basi',
);

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
