/**
 * `apply_patch` — parse, apply, and REFUSE correctly.
 *
 * The dangerous failure for a multi-file patch is not a parse error (that is
 * loud). It is a patch that applies halfway: three files written, the fourth
 * refused, and the agent then describing the work as done. So the checks that
 * matter most here are the ones about NOT writing.
 *
 * Run: node scripts/verify-apply-patch.mjs
 *
 * Pure: the tool takes an injected bridge, so every case runs in memory with no
 * filesystem and no app.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const AKAR = path.resolve(import.meta.dirname, '..');

/*
 * `patch.ts` is plain TypeScript with no imports at runtime except a type-only
 * one, so Node's own type stripping can load it directly.
 */
const { parsePatch, terapkanHunk, buatApplyPatchTool } = await import(
  pathToFileURL(path.join(AKAR, 'src/lib/zephyrTools/patch.ts')).href
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

/** In-memory workspace. Records every write so "nothing was written" is provable. */
function workspace(awal = {}) {
  const isi = new Map(Object.entries(awal));
  const jejak = [];
  return {
    isi,
    jejak,
    bridge: {
      baca: async (p) => (isi.has(p) ? isi.get(p) : null),
      tulis: async (p, v) => {
        jejak.push(['tulis', p]);
        isi.set(p, v);
      },
      hapus: async (p) => {
        jejak.push(['hapus', p]);
        isi.delete(p);
      },
      ada: async (p) => isi.has(p),
    },
  };
}

const tool = (bridge) => buatApplyPatchTool(bridge);

console.log('\n1. Parser: bentuk yang sah');
{
  const ops = parsePatch(
    [
      '*** Begin Patch',
      '*** Add File: src/baru.ts',
      '+baris satu',
      '+baris dua',
      '*** Update File: src/lama.ts',
      '@@ fungsi utama',
      ' konteks',
      '-lama',
      '+baru',
      '*** Delete File: src/basi.ts',
      '*** End Patch',
    ].join('\n'),
  );
  hasil('tiga operasi terbaca', ops.length === 3, `dapat ${ops.length}`);
  hasil('Add membawa dua baris', ops[0].jenis === 'add' && ops[0].isi.length === 2, JSON.stringify(ops[0]));
  hasil(
    'Update membawa satu hunk dengan label',
    ops[1].jenis === 'update' && ops[1].hunks.length === 1 && ops[1].hunks[0].label === 'fungsi utama',
    JSON.stringify(ops[1]),
  );
  hasil('Delete terbaca', ops[2].jenis === 'delete' && ops[2].path === 'src/basi.ts', JSON.stringify(ops[2]));
}

console.log('\n2. Parser: bentuk yang HARUS ditolak');
const tolak = (nama, teks, pola) => {
  try {
    parsePatch(teks);
    hasil(nama, false, 'diterima padahal harus ditolak');
  } catch (e) {
    hasil(nama, pola.test(e.message), `pesan: ${e.message}`);
  }
};
tolak('tanpa "*** Begin Patch"', '*** Add File: a\n+x\n*** End Patch', /Begin Patch/);
tolak('tanpa "*** End Patch"', '*** Begin Patch\n*** Add File: a\n+x', /End Patch/);
tolak('direktif tak dikenal tidak dilewati', '*** Begin Patch\n*** UpdateFile: a\n*** End Patch', /di luar operasi/);
tolak('baris berkas baru tanpa "+"', '*** Begin Patch\n*** Add File: a\nbukan plus\n*** End Patch', /dimulai dengan "\+"/);
tolak('baris hunk tanpa "@@"', '*** Begin Patch\n*** Update File: a\n-x\n*** End Patch', /tanpa "@@" di atasnya/);
tolak('"Move to" tanpa Update File', '*** Begin Patch\n*** Move to: b\n*** End Patch', /tanpa "\*\*\* Update File:"/);

console.log('\n3. Hunk: cocok, tidak cocok, dan ambigu');
{
  const isi = ['a', 'b', 'c', 'd'];
  const r = terapkanHunk(isi, {
    label: 'tengah',
    baris: [
      { jenis: ' ', teks: 'b' },
      { jenis: '-', teks: 'c' },
      { jenis: '+', teks: 'C' },
    ],
  });
  hasil('hunk yang cocok mengganti tepat satu baris', JSON.stringify(r) === JSON.stringify(['a', 'b', 'C', 'd']), JSON.stringify(r));
}
{
  try {
    terapkanHunk(['a', 'b'], { label: 'x', baris: [{ jenis: ' ', teks: 'zzz' }] });
    hasil('konteks tidak cocok ditolak', false, 'diterima');
  } catch (e) {
    hasil('konteks tidak cocok ditolak', /tidak cocok dengan isi berkas/.test(e.message), e.message);
  }
}
{
  try {
    terapkanHunk(['x', 'x'], { label: 'kembar', baris: [{ jenis: ' ', teks: 'x' }] });
    hasil('konteks ambigu ditolak', false, 'diterima');
  } catch (e) {
    hasil('konteks ambigu ditolak', /ambigu/.test(e.message), e.message);
  }
}
{
  try {
    terapkanHunk(['a'], { label: 'kosong', baris: [{ jenis: '+', teks: 'baru' }] });
    hasil('hunk tanpa konteks ditolak', false, 'diterima');
  } catch (e) {
    hasil('hunk tanpa konteks ditolak', /tidak punya baris konteks/.test(e.message), e.message);
  }
}

console.log('\n4. Tool: satu patch, banyak berkas');
{
  const ws = workspace({ 'src/lama.ts': 'baris1\nkonteks\nlama\nbaris4', 'src/basi.ts': 'x' });
  const t = tool(ws.bridge);
  const r = await t.run({
    patch: [
      '*** Begin Patch',
      '*** Add File: src/baru.ts',
      '+isi baru',
      '*** Update File: src/lama.ts',
      '@@ ubah',
      ' konteks',
      '-lama',
      '+baru',
      '*** Delete File: src/basi.ts',
      '*** End Patch',
    ].join('\n'),
  });
  hasil('laporan menyebut 3 operasi', /3 operasi/.test(r), r);
  hasil('berkas baru tertulis', ws.isi.get('src/baru.ts') === 'isi baru', JSON.stringify(ws.isi.get('src/baru.ts')));
  hasil('berkas lama berubah', ws.isi.get('src/lama.ts') === 'baris1\nkonteks\nbaru\nbaris4', JSON.stringify(ws.isi.get('src/lama.ts')));
  hasil('berkas basi terhapus', !ws.isi.has('src/basi.ts'), 'masih ada');
}

console.log('\n5. ATOMIS: satu gagal -> TIDAK ADA yang ditulis');
{
  const ws = workspace({ 'src/ada.ts': 'isi asli' });
  const t = tool(ws.bridge);
  let pesan = '';
  try {
    await t.run({
      patch: [
        '*** Begin Patch',
        '*** Add File: src/baru.ts',
        '+harusnya tidak tertulis',
        '*** Update File: src/hilang.ts',
        '@@ x',
        '-apa',
        '+apa-apa',
        '*** End Patch',
      ].join('\n'),
    });
  } catch (e) {
    pesan = e.message;
  }
  hasil('patch ditolak karena berkas hilang', /tidak ada/.test(pesan), pesan);
  hasil('berkas baru TIDAK tertulis', !ws.isi.has('src/baru.ts'), 'tertulis padahal patch gagal');
  hasil('tidak ada jejak tulis sama sekali', ws.jejak.length === 0, JSON.stringify(ws.jejak));
  hasil('berkas lama tidak tersentuh', ws.isi.get('src/ada.ts') === 'isi asli', 'berubah');
}

console.log('\n6. "Add File" menolak berkas yang SUDAH ada');
{
  const ws = workspace({ 'src/ada.ts': 'isi asli' });
  const t = tool(ws.bridge);
  let pesan = '';
  try {
    await t.run({ patch: '*** Begin Patch\n*** Add File: src/ada.ts\n+timpa\n*** End Patch' });
  } catch (e) {
    pesan = e.message;
  }
  hasil('ditolak, bukan menimpa', /sudah ada/.test(pesan), pesan);
  hasil('isi lama utuh', ws.isi.get('src/ada.ts') === 'isi asli', 'tertimpa');
}

console.log('\n7. Move: tujuan ditulis SEBELUM sumber dihapus');
{
  const ws = workspace({ 'src/a.ts': 'satu\ndua' });
  const t = tool(ws.bridge);
  await t.run({
    patch: ['*** Begin Patch', '*** Update File: src/a.ts', '*** Move to: src/b.ts', '@@ x', ' satu', ' dua', '*** End Patch'].join('\n'),
  });
  hasil('tujuan ada', ws.isi.get('src/b.ts') === 'satu\ndua', JSON.stringify(ws.isi.get('src/b.ts')));
  hasil('sumber hilang', !ws.isi.has('src/a.ts'), 'masih ada');
  const urut = ws.jejak.map((j) => j[0] + ':' + j[1]);
  hasil(
    'urutan tulis-lalu-hapus',
    urut.indexOf('tulis:src/b.ts') >= 0 && urut.indexOf('tulis:src/b.ts') < urut.indexOf('hapus:src/a.ts'),
    urut.join(' -> '),
  );
}

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
