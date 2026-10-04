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

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);