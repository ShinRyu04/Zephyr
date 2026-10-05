/*
 * Menulis website NexusPulse ke D:\Talos\situs lewat MCP Zephyr.
 *
 * Kenapa MCP: itu jalur yang benar untuk mengontrol jendela Zephyr dari luar.
 *
 * Dua keterbatasan yang harus dihormati, bukan dilewati:
 *
 *   1. editor_write  ->  mengganti isi BUFFER saja, TIDAK menulis ke disk
 *                        (deskripsinya sendiri: "Does not write to disk")
 *      editor.save   ->  satu-satunya perintah yang menyimpan
 *
 *   2. editor_write menerima `tabId`, BUKAN `path`. Jadi rantaianya tiga
 *      langkah dan tiap langkah butuh hasil langkah sebelumnya:
 *
 *        editor_open { path }            ->  tabId
 *        editor_write { tabId, content }
 *        run_command { id: 'editor.save' }
 *
 * Bentuk argumen diambil dari skema server (scripts/cek-skema-mcp.mjs), bukan
 * ditebak - menebak sudah dua kali gagal di sesi ini.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';

const PORT = 9224;
const TOKEN = process.env.ZEPHYR_MCP_TOKEN;
const AKAR = 'D:/Talos/situs';

let id = 0;
const rpc = async (method, params) => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      signal: AbortSignal.timeout(25000),
    });
    const j = await r.json();
    if (j.error) return { GAGAL: j.error.message };
    return j.result;
  } catch (e) {
    return { GAGAL: e.message };
  }
};
const panggil = (name, args) => rpc('tools/call', { name, arguments: args });

/* Balasan tool MCP datang sebagai content[].text berisi JSON atau teks. */
const isi = (hasil) => {
  if (hasil?.GAGAL) return null;
  const t = hasil?.content?.[0]?.text;
  if (t == null) return null;
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

const berkas = [
  { path: `${AKAR}/index.html`, isi: readFileSync('scripts/website/html.part', 'utf8') },
  { path: `${AKAR}/styles.css`, isi: readFileSync('scripts/website/css.part', 'utf8') },
  { path: `${AKAR}/script.js`, isi: readFileSync('scripts/website/js.part', 'utf8') },
];

let lulus = 0;
let gagal = 0;
const uji = (nama, ok, bukti) => {
  if (ok) {
    console.log(`  LULUS  ${nama}`);
    lulus++;
  } else {
    console.log(`  GAGAL  ${nama}${bukti !== undefined ? '  -> ' + JSON.stringify(bukti) : ''}`);
    gagal++;
  }
};

for (const b of berkas) {
  const nama = b.path.split('/').pop();
  console.log(`\n=== ${nama} (${b.isi.length} karakter) ===`);

  const buka = await panggil('editor_open', { path: b.path });
  if (buka?.GAGAL) {
    console.log('  open  : GAGAL ' + buka.GAGAL);
    uji(`${nama} terbuka di editor`, false, buka.GAGAL);
    continue;
  }
  /* tabId diambil dari balasan. Kalau bentuknya lain, ditampilkan apa adanya
     supaya tidak menebak lagi. */
  const dataBuka = isi(buka);
  const tabId = dataBuka?.tabId ?? dataBuka?.id ?? (typeof dataBuka === 'string' ? dataBuka : null);
  console.log('  open  :', tabId ? 'tabId=' + tabId : 'balasan: ' + JSON.stringify(buka).slice(0, 160));
  uji(`${nama} terbuka di editor`, Boolean(tabId), dataBuka ?? buka);

  if (!tabId) continue;

  const tulis = await panggil('editor_write', { tabId: String(tabId), content: b.isi });
  console.log('  write :', tulis?.GAGAL ? 'GAGAL ' + tulis.GAGAL : 'buffer terisi');
  uji(`${nama} tertulis ke buffer`, !tulis?.GAGAL, tulis?.GAGAL);
  if (tulis?.GAGAL) continue;

  /*
   * Simpan. Tanpa ini berkasnya TIDAK ada di disk - editor_write hanya mengubah
   * buffer. Ini langkah yang paling mudah terlupa, dan kegagalannya tidak
   * terlihat: tab di layar tampak sempurna sementara berkasnya di disk tetap
   * yang lama.
   */
  const simpan = await panggil('run_command', { id: 'editor.save' });
  console.log('  save  :', simpan?.GAGAL ? 'GAGAL ' + simpan.GAGAL : 'disimpan');
  uji(`${nama} tersimpan lewat MCP`, !simpan?.GAGAL, simpan?.GAGAL);

  /* Bukti dari DISK, bukan dari balasan MCP. */
  if (existsSync(b.path)) {
    const ukuran = statSync(b.path).size;
    console.log(`  disk  : ${ukuran} byte`);
    /* Ukuran disk harus MINIMAL sebesar isi yang dikirim. Kalau lebih kecil,
       berkasnya ada tapi isinya bukan yang baru - persis kegagalan yang tidak
       terlihat kalau yang diperiksa hanya "berkasnya ada". */
    uji(`${nama} isinya yang baru (${ukuran} byte)`, ukuran >= b.isi.length, { disk: ukuran, dikirim: b.isi.length });
  } else {
    uji(`${nama} ada di disk`, false, 'berkas tidak ditemukan');
  }
}

console.log(`\n=== ${lulus}/${lulus + gagal} lulus ===`);
process.exit(gagal ? 1 : 0);
