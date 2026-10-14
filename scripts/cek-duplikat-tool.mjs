/**
 * cek-duplikat-tool.mjs - cari tool yang pekerjaannya TUMPANG TINDIH.
 *
 *   node scripts/cek-duplikat-tool.mjs [port]
 *
 * "Duplikat" bisa berarti dua hal, dan keduanya perlu dijawab dengan cara yang
 * berbeda:
 *
 *   1. NAMA/YANG SAMA PERSIS  - dua entri untuk satu tool. Ini bug pasti.
 *   2. PEKERJAAN YANG TUMPANG TINDIH - dua tool berbeda yang bisa melakukan hal
 *      yang sama (mis. `terminal_exec` dan `shell_exec`). Ini belum tentu bug:
 *      bisa jadi satu primitif dan satu pembungkus. Tapi kalau benar-benar
 *      setara, agen akan ragu memilih - dan pilihan yang ragu menghasilkan
 *      pemakaian yang tidak konsisten.
 *
 * Alat bantu, bukan uji. Hasilnya untuk dinilai manusia.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const d = await cdp.json(`return JSON.stringify(await (async () => {
  const tools = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'agentTools.ts');
  const daftar = (tools.AGENT_TOOLS || []).map((t) => ({ nama: t.spec.name, ket: String(t.spec.description || '') }));

  /* 1. Nama kembar persis. */
  const hitung = {};
  for (const t of daftar) hitung[t.nama] = (hitung[t.nama] || 0) + 1;
  const kembar = Object.entries(hitung).filter(([, n]) => n > 1).map(([n, c]) => n + ' x' + c);

  /* 3. Keluarga fetch: setelah B2, harus ada SATU tool ambil-halaman.
     'fetch' (bawaan) dilebur ke 'web_fetch'; keduanya muncul = regresi. */
  const keluargaFetch = daftar.filter((t) => t.nama === 'fetch' || t.nama === 'web_fetch');

  /* 2. Kandidat tumpang tindih: kelompokkan berdasarkan KATA KUNCI pekerjaan. */
  const keluarga = {
    'menjalankan perintah': /^(shell|terminal|run)_/,
    'membaca berkas': /^(file_read|editor_read|read_|read$)/,
    'menulis berkas': /^(file_write|editor_write|editor_save|write_)/,
    'mengubah berkas': /^(file_edit|file_patch|replace_|multi_edit|edit$)/,
    'mencari': /^(search_|find_|grep|glob)/,
    'daftar/pohon': /^(file_list|list_|dir_)/,
    'memindahkan/menyalin': /^(file_move|file_copy|move_|copy_)/,
    'menghapus': /^(file_delete|delete_|remove_)/,
    'menunggu terminal': /^(terminal_wait|wait_)/,
    'membunuh proses': /^(terminal_kill|kill_|stop_)/,
    'server/proses': /^(start_server|server_|run_task|get_output)/,
    'subagent': /^(subagent_|run_subagent)/,
    'jadwal': /^(schedule_|cron_)/,
    'catatan': /^(notes|memory_)/,
    'konteks editor': /^(get_problems|lsp_|get_output)/,
  };

  const hasil = {};
  for (const [nama, re] of Object.entries(keluarga)) {
    const anggota = daftar.filter((t) => re.test(t.nama));
    if (anggota.length > 1) hasil[nama] = anggota.map((t) => t.nama + ' - ' + t.ket.slice(0, 80));
  }

  return { jumlah: daftar.length, kembar, tumpangTindih: hasil, keluargaFetch };
})())`);

console.log('total tool:', d.jumlah);

console.log('\n=== 1. NAMA KEMBAR PERSIS ===');
console.log(d.kembar.length === 0 ? '  tidak ada' : '  ' + d.kembar.join('\n  '));

console.log('\n=== 2. PEKERJAAN YANG MUNGKIN TUMPANG TINDIH ===');
const entri = Object.entries(d.tumpangTindih);
if (entri.length === 0) console.log('  tidak ada');
for (const [keluarga, anggota] of entri) {
  console.log('\n  [' + keluarga + '] ' + anggota.length + ' tool');
  for (const a of anggota) console.log('    ' + a);
}

const salah =
  d.kembar.length > 0 ||
  (d.keluargaFetch.length !== 1 || d.keluargaFetch[0].nama !== 'web_fetch')
    ? ['keluarga fetch harus tepat satu tool: web_fetch (B2)', ...(d.keluargaFetch.map((t) => '    ada: ' + t.nama))]
    : [];

console.log('\n=== 3. KELUARGA FETCH (B2: satu tool ambil-halaman) ===');
console.log(d.keluargaFetch.length === 0 ? '  tidak ada' : '  ' + d.keluargaFetch.map((t) => t.nama).join(', '));

await cdp.close();
if (salah.length) {
  console.error('\nGAGAL\n' + salah.join('\n'));
  process.exit(1);
}
console.log('\nJALAN (tidak ada nama kembar; keluarga fetch = web_fetch saja)');
process.exit(0);
