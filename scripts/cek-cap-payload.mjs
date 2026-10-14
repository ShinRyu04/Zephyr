/*
 * Mengunci cap ukuran payload - termasuk kasus nyata yang bikin 502 lewat
 * gateway: window kerja yang penuh hasil tool panjang dan screenshot base64.
 *
 * Fungsinya murni (contextBudget.ts), jadi diuji langsung di Node lewat
 * esbuild. Tidak butuh aplikasi hidup; yang diuji adalah kode yang benar-benar
 * dijalankan, bukan salinannya.
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Bundle: contextBudget imports modelCatalog, and an unbundled single-file
// transform would leave that import dangling in Node.
const dir = mkdtempSync(join(tmpdir(), 'ctxbudget-'));
const out = join(dir, 'contextBudget.mjs');
await build({
  entryPoints: ['src/lib/contextBudget.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: out,
  logLevel: 'silent',
});
const M = await import('file:///' + out.replace(/\\/g, '/') + '?v=' + Date.now());

let lulus = 0, total = 0;
const cek = (nama, syarat, bukti) => {
  total++;
  if (syarat) { lulus++; console.log(`  OK    ${nama}${bukti !== undefined ? '  [' + bukti + ']' : ''}`); }
  else console.log(`  GAGAL ${nama}  [${bukti}]`);
};

// 1. Gambar ikut dihitung (tanpa ini compaction tak pernah menyala).
const denganGambar = M.perkiraanKonteks([{ content: 'x'.repeat(400), images: ['a', 'b'] }]);
cek('konteks menghitung gambar', denganGambar === 100 + 2 * 1500, denganGambar);

// 2. Request kecil tidak boleh dirusak.
const kecil = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'halo' }];
const kecilOke = M.ringkasUkuran(kecil);
cek('request kecil utuh', kecilOke.length === 2 && kecilOke[1].content === 'halo', kecilOke.length);

// 3. Request besar dipotong sampai di bawah cap, system tetap ada.
const besar = [{ role: 'system', content: 'SYSTEM-PERTAHANKAN' }];
for (let i = 0; i < 40; i++) {
  besar.push({ role: 'assistant', content: 'a'.repeat(2000), toolCalls: [{ id: 'c' + i, type: 'function', function: { name: 'read_file', arguments: '{}' } }] });
  besar.push({ role: 'tool', toolCallId: 'c' + i, name: 'read_file', content: 'x'.repeat(20000) });
}
const sebelum = JSON.stringify(besar).length;
const st = M.ringkasUkuran(besar);
const sesudah = JSON.stringify(st).length;
cek('request besar dipotong', sesudah < sebelum, `${sebelum} -> ${sesudah}`);
cek('hasil di bawah cap', sesudah <= M.PAYLOAD_MAX_CHARS, sesudah + ' <= ' + M.PAYLOAD_MAX_CHARS);
cek('system prompt tidak dibuang', st.some((x) => x.role === 'system' && x.content === 'SYSTEM-PERTAHANKAN'), true);

// 4. Kasus nyata: screenshot base64 + hasil tool panjang.
const denganGambarBesar = [{ role: 'system', content: 'sys' }];
for (let i = 0; i < 6; i++) {
  denganGambarBesar.push({ role: 'user', content: 'lihat ini', images: ['A'.repeat(400000)] });
  denganGambarBesar.push({ role: 'assistant', content: 'ok', toolCalls: [{ id: 'd' + i, type: 'function', function: { name: 'read_file', arguments: '{}' } }] });
  denganGambarBesar.push({ role: 'tool', toolCallId: 'd' + i, name: 'read_file', content: 'y'.repeat(50000) });
}
const gSebelum = JSON.stringify(denganGambarBesar).length;
const gSesudah = M.ringkasUkuran(denganGambarBesar);
const gUkuran = JSON.stringify(gSesudah).length;
cek('screenshot + tool output dipotong', gUkuran <= M.PAYLOAD_MAX_CHARS, `${gSebelum} -> ${gUkuran}`);
cek('screenshot tidak_estimasi nol', M.perkiraanKonteks([{ content: '', images: ['z'] }]) > 0, M.perkiraanKonteks([{ content: '', images: ['z'] }]));

// 5. Tidak ada tool yatim (tool tanpa assistant-nya) - itu error protokol.
const yatim = gSesudah.filter((m, i, arr) => m.role === 'tool' && (i === 0 || arr[i - 1]?.role !== 'assistant'));
cek('tidak ada tool yatim', yatim.length === 0, yatim.length);

// 6. Cap bisa dikecilkan (dipakai untuk menyisakan ruang bagi daftar tool).
// Kalau ini tidak bekerja, cap selalu 120k dan request tool besar akan
// melewati batas gateway meski history sudah dipangkas.
const denganCapKecil = M.ringkasUkuran(besar, 30_000);
cek('cap khusus dihormati', JSON.stringify(denganCapKecil).length <= 30_000, JSON.stringify(denganCapKecil).length);
cek('cap khusus menyimpan system', denganCapKecil.some((x) => x.role === 'system' && x.content === 'SYSTEM-PERTAHANKAN'), true);

// 7. Jalur chat (tanpa tool) juga terlindungi.
const chat = [{ role: 'system', content: 'sys' }];
for (let i = 0; i < 30; i++) chat.push({ role: i % 2 ? 'assistant' : 'user', content: 'z'.repeat(15000) });
const chatOke = M.ringkasUkuran(chat);
cek('jalur chat terlindungi', JSON.stringify(chatOke).length <= M.PAYLOAD_MAX_CHARS, JSON.stringify(chat).length + ' -> ' + JSON.stringify(chatOke).length);

// 8. Giliran TERAKHIR yang sendirian melewati cap (hasil tool raksasa).
// Sebelum ada jaring terakhir, pemangkasan berhenti karena giliran terakhir
// sengaja dilindungi: sisanya 50.230 karakter dengan cap 40.000 - request yang
// ditolak gateway, dan SELURUH langkah hilang. Terpotong > ditolak.
const ekorBesar = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'baca berkas besar' },
  { role: 'assistant', content: 'ok', toolCalls: [{ id: 'e0', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
  { role: 'tool', toolCallId: 'e0', name: 'read_file', content: 'q'.repeat(200000) },
];
const ekorHasil = M.ringkasUkuran(ekorBesar);
const ekorUkuran = JSON.stringify(ekorHasil).length;
cek('giliran terakhir raksasa dipotong sampai cap', ekorUkuran <= M.PAYLOAD_MAX_CHARS, `${JSON.stringify(ekorBesar).length} -> ${ekorUkuran}`);
const ekorTerakhir = ekorHasil[ekorHasil.length - 1];
cek('identitas tool giliran terakhir dipertahankan', ekorTerakhir?.role === 'tool' && ekorTerakhir?.toolCallId === 'e0' && ekorTerakhir?.name === 'read_file', `${ekorTerakhir?.role}/${ekorTerakhir?.toolCallId}/${ekorTerakhir?.name}`);
cek('potongan giliran terakhir memberi tahu berapa yang hilang', /dipotong agar request/.test(String(ekorTerakhir?.content)), String(ekorTerakhir?.content).slice(-90));
cek('tidak ada tool yatim sesudah jaring terakhir', ekorHasil.filter((m, i, arr) => m.role === 'tool' && (i === 0 || arr[i - 1]?.role !== 'assistant')).length === 0, true);

// 9. Hanya gambar di giliran terakhir yang membengkakkan (teksnya kecil):
// yang boleh dilepas gambarnya saja, teksnya tetap utuh dan model diberi tahu.
const ekorGambar = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'lihat layar' },
  { role: 'assistant', content: 'ok', toolCalls: [{ id: 'f0', type: 'function', function: { name: 'screenshot', arguments: '{}' } }] },
  { role: 'tool', toolCallId: 'f0', name: 'screenshot', content: 'ok' },
  { role: 'user', content: 'yang mana?', images: ['G'.repeat(500000), 'G'.repeat(500000), 'G'.repeat(500000)] },
];
const g2 = M.ringkasUkuran(ekorGambar);
const g2Terakhir = g2[g2.length - 1];
cek('gambar giliran terakhir dilepas kalau itu satu-satunya jalan', JSON.stringify(g2).length <= M.PAYLOAD_MAX_CHARS, JSON.stringify(g2).length);
cek('teks giliran terakhir tetap utuh saat gambar dilepas', String(g2Terakhir?.content).startsWith('yang mana?'), String(g2Terakhir?.content));
cek('model diberi tahu gambarnya dilepas', /3 gambar dilepas/.test(String(g2Terakhir?.content)), String(g2Terakhir?.content).slice(-80));

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);