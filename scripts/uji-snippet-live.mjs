/*
 * uji-snippet-live.mjs — paket snippet marketplace benar-benar kepakai saat mengetik?
 *
 * Snippet adalah kasus "gagal senyap" yang paling halus: paketnya terpasang,
 * jumlahnya dilaporkan loader, tapi kalau sumber completion-nya tidak dipanggil
 * editor, tidak ada yang bisa gagal - tidak ada error, tidak ada apa-apa. Karena
 * itu yang diuji di sini jalur pemakaian yang sesungguhnya:
 *
 *   1. ketik pemicunya di editor (tombol asli lewat CDP Input, bukan panggilan
 *      fungsi), tekan Ctrl+Space, lalu baca daftar yang muncul di DOM;
 *   2. pilih entri itu (Enter) dan periksa teks yang benar-benar masuk ke dokumen.
 *
 * Pemicu yang dipakai (`fnr`) sengaja bukan kata kunci bahasa apa pun, supaya
 * yang muncul di daftar hanya bisa datang dari paket. Dua sisi: sebelum dipasang
 * daftarnya kosong, sesudah dipasang berisi, sesudah dicabut kosong lagi.
 *
 * Pemakaian: node scripts/uji-snippet-live.mjs [--paket zephyr.snippet-rust]
 *            [--pemicu fnr] [--berkas D:/Zephyr/.uji-snippet-live/coba.rs] [--harap "pub fn"]
 *
 * CATATAN (jejak c18): daftar completion CodeMirror itu PANJANG (global + kata
 * kunci bahasa) dan hanya irisan yang terlihat yang dirender ke DOM. Jadi
 * indeks <li> di DOM BUKAN indeks opsi global - "paket cuma menambah satu
 * entri" pernah terbaca dari situ padahal loader memang memuat semuanya.
 * Harness ini karena itu menandai entri terpakai dari LABEL + DETAIL entri yang
 * tersorot, mengetik pemicunya lewat key event (jalur pengguna - daftar barulah
 * tersaring), dan memastikan pemicunya benar-benar ada di dokumen sesudah
 * diketik sebelum menekan Enter.
 *
 * Contoh paket JS (dua bahasa sekaligus, karena pack-nya melayani keduanya):
 *   node scripts/uji-snippet-live.mjs --paket zephyr.snippet-js --pemicu fetchj \
 *        --berkas D:/Zephyr/.uji-snippet-js/coba.js  --harap "fetch\\("
 *   node scripts/uji-snippet-live.mjs --paket zephyr.snippet-js --pemicu fetchj \
 *        --berkas D:/Zephyr/.uji-snippet-js/coba.jsx --harap "fetch\\("  
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 9223;
const argDari = (nama, bawaan) => {
  const i = process.argv.indexOf(nama);
  return i > 0 ? process.argv[i + 1] : bawaan;
};
const PAKET = argDari('--paket', 'zephyr.snippet-rust');
const PEMICU = argDari('--pemicu', 'fnr');
const BERKAS = argDari('--berkas', 'D:/Zephyr/.uji-snippet-live/coba.rs');
/*
 * Bentuk badan snippet yang HARUS masuk ke dokumen kalau entri benar-benar
 * diambil. Ini yang membedakan "daftar completion muncul" dari "snippetnya
 * benar-benar kepakai" - dan tiap bahasa punya badannya sendiri, jadi
 * jalankan berkas ini per bahasa dengan --harap yang cocok.
 */
const HARAP = new RegExp(argDari('--harap', 'pub fn'));
/*
 * Penanda entri MILIK PAKET. Detail-nya selalu dimulai "snippet · <nama>"
 * (dipasang extLoader), sedangkan entri bawaan editor TIDAK selalu bisa
 * dibedakan dari ikonnya: @codemirror/lang-javascript sendiri menandai
 * snippet bawaannya (mis. "af [arrow function]") dengan kelas
 * `cm-completionIcon-snippet`. Menyaring pakai kelas ikon karena itu
 * menuduh entri bawaan sebagai milik paket - lihat jejaknya di c18.
 */
const DETAIL = argDari('--detail', 'snippet ·');
const milikPaket = (x) => (x.detail || '').includes(DETAIL);
const ISI_AWAL = '// berkas uji harness snippet\n';

mkdirSync(dirname(BERKAS), { recursive: true });
writeFileSync(BERKAS, ISI_AWAL, 'utf8');

const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
const target = list.find((t) => /zephyr/i.test(t.title ?? '')) ?? list[0];
if (!target) {
  console.error(`tidak ada target CDP di port ${PORT} - jalankan aplikasinya dulu`);
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 1;
const tunggu = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
};
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) =>
  new Promise((r) => { const id = seq++; tunggu.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails;
    throw new Error(d.exception?.description ?? d.text ?? 'gagal mengevaluasi');
  }
  return r.result?.result?.value;
};
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));
const tombol = async (key, code, vk, modifiers = 0) => {
  for (const type of ['rawKeyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  }
};

await send('Runtime.enable');
console.log(`== uji snippet live: ${PAKET} / pemicu "${PEMICU}" / ${BERKAS} ==`);

/* Buka berkas lewat jalur yang dipakai pengguna, lalu pastikan editornya ter-mount. */
const buka = `(async () => {
  const S = window.__ZEPHYR__;
  S.getState().openPath(${JSON.stringify(BERKAS)});
  await new Promise((r) => setTimeout(r, 900));
  const tab = S.getState().tabs.find((t) => t.path && t.path.replace(/\\\\/g, '/') === ${JSON.stringify(BERKAS)});
  if (tab) S.getState().setActiveTab(tab.id);
  await new Promise((r) => setTimeout(r, 700));
  return JSON.stringify({ tabAda: !!tab, aktiftab: S.getState().tabs.find((t) => t.id === S.getState().activeTabId)?.path ?? null });
})()`;
console.log('buka berkas ->', await ev(buka));
await jeda(500);
const siap = await ev(`(() => { const c = document.querySelector('.cm-content'); return c ? 'editor-mount' : 'editor-tidak-ada'; })()`);
console.log('editor:', siap);
if (siap !== 'editor-mount') {
  console.error('editor tidak ter-mount - tidak ada yang bisa diuji');
  ws.close();
  process.exit(2);
}

/*
 * Satu putaran pengukuran: bersihkan dokumen, ketik pemicu, minta completion
 * dengan Ctrl+Space, baca daftar di DOM. `pilih` = benar-benar menekan Enter
 * pada entri pertama untuk melihat teks yang masuk ke dokumen.
 */
const putaran = async ({ pilih }) => {
  /*
   * Pasang/cabut ekstensi mengganti bahasa editor, dan React membangun ulang
   * <CodeMirrorEditor> saat itu. Mengukur di tengah pembangunan ulang
   * menghasilkan dokumen null - itu bukan bukti soal paket, jadi tunggu dulu
   * sampai .cm-content ada lagi (dan buka ulang berkasnya kalau tab ikut hilang).
   */
  let adaEditor = await ev(`!!document.querySelector('.cm-content')`);
  for (let i = 0; i < 40 && !adaEditor; i++) {
    await jeda(500);
    await ev(buka);
    adaEditor = await ev(`!!document.querySelector('.cm-content')`);
  }
  if (!adaEditor) return { daftar: [], dokSiap: null, dokumenSesudah: null, terpakai: null, editorHilang: true };

  await ev(`document.querySelector('.cm-content').focus(); 'ok'`);
  await jeda(150);
  await tombol('a', 'KeyA', 65, 2);           // Ctrl+A
  await tombol('Delete', 'Delete', 46);       // hapus isi
  await jeda(250);
  /*
   * Pemicu diketik HURUF PER HURUF lewat key event - persis jalur pengguna -
   * dan completion dibiarkan terbuka sendiri (activateOnTyping). Ctrl+Space
   * TIDAK dipakai: permintaan eksplisit disajikan CodeMirror sebagai daftar
   * penuh tanpa penyaringan (terukur 524 opsi untuk berkas JS), jadi yang
   * terukur dari situ bukan perilaku mengetik yang dialami pengguna.
   */
  for (const ch of PEMICU) {
    const code = 'Key' + ch.toUpperCase();
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch, code });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code });
    await jeda(110);
  }
  await jeda(800);
  const dokSiap = await ev(`document.querySelector('.cm-content')?.textContent ?? null`);
  const daftar = JSON.parse(await ev(`(() => {
    const items = Array.from(document.querySelectorAll('.cm-tooltip-autocomplete li'));
    return JSON.stringify(items.map((li) => ({
      label: li.querySelector('.cm-completionLabel')?.textContent ?? li.textContent ?? '',
      detail: li.querySelector('.cm-completionDetail')?.textContent ?? '',
      jenis: li.querySelector('.cm-completionIcon')?.className ?? '',
    })));
  })()`));
  let dokumenSesudah = null;
  let terpakai = null;
  if (pilih && daftar.length) {
    /*
     * Yang diambil HARUS entri paket yang pemicunya diketik. Daftar yang
     * dirender bisa ratusan entri (global + kata kunci + snippet), dan hanya
     * irisan yang terlihat yang masuk DOM - jadi sorotan digeser sambil label
     * + detail-nya DIBACA, bukan ditebak dari posisi <li>.
     */
    const bacaSorot = async () => JSON.parse(await ev(`(() => {
      const lis = Array.from(document.querySelectorAll('.cm-tooltip-autocomplete li'));
      const s = lis.find((li) => li.getAttribute('aria-selected') === 'true');
      return JSON.stringify({
        ada: !!s,
        label: s?.querySelector('.cm-completionLabel')?.textContent ?? null,
        detail: s?.querySelector('.cm-completionDetail')?.textContent ?? null,
      });
    })()`));
    for (let i = 0; i < 80; i++) {
      const s = await bacaSorot();
      if (s.ada && s.label === PEMICU && milikPaket(s)) { terpakai = s; break; }
      if (!s.ada) break;
      await tombol('ArrowDown', 'ArrowDown', 40);
      await jeda(60);
    }
    const daftarPaket = daftar
      .map((x, i) => ({ ...x, i }))
      .filter(milikPaket)
      .map((x) => `${x.i}=${x.label}`)
      .join(' ');
    console.log(`    entri paket di irisan yang dirender: ${daftarPaket || '(tidak ada)'}`);
    console.log(`    entri yang diambil: ${terpakai ? `${terpakai.label} [${terpakai.detail}]` : '(pemicu tidak ditemukan di daftar)'}`);
    await tombol('Enter', 'Enter', 13);
    await jeda(500);
    dokumenSesudah = await ev(`document.querySelector('.cm-content')?.textContent ?? null`);
    await jeda(150);
  }
  await tombol('Escape', 'Escape', 27);
  await jeda(200);
  return { daftar, dokSiap, dokumenSesudah, terpakai };
};

const ringkas = (d) => d.map((x) => `${x.label}${x.detail ? ' [' + x.detail + ']' : ''}`).join(', ') || '(kosong)';

console.log(`[0] pastikan ${PAKET} tidak terpasang`);
if (await ev(`window.__ZEPHYR_EXT19__.terpasang().some((m) => m.id === ${JSON.stringify(PAKET)})`)) {
  await ev(`window.__ZEPHYR_EXT19__.uninstall(${JSON.stringify(PAKET)})`);
  await jeda(2500);
}

console.log('[1] sebelum dipasang: ketik pemicu di editor');
const sebelum = await putaran({ pilih: false });
console.log('    daftar completion:', ringkas(sebelum.daftar));

console.log('[2] pasang lewat jalur marketplace');
console.log('    installKatalog ->', await ev(`window.__ZEPHYR_EXT19__.installKatalog(${JSON.stringify(PAKET)})`));
await jeda(2500);

console.log('[3] sesudah dipasang: ketik pemicu lagi, lalu ambil entri pertama');
const sesudah = await putaran({ pilih: true });
console.log('    daftar completion:', ringkas(sesudah.daftar));
console.log('    jumlah entri:', sesudah.daftar.length);
console.log('    pemicu benar-benar ada di dokumen:', JSON.stringify(sesudah.dokSiap));
console.log('    dokumen sesudah dipilih:', JSON.stringify(sesudah.dokumenSesudah));

console.log('[4] cabut lagi');
console.log('    uninstall ->', await ev(`window.__ZEPHYR_EXT19__.uninstall(${JSON.stringify(PAKET)})`));
await jeda(2500);
const dicabut = await putaran({ pilih: false });
console.log('    daftar completion:', ringkas(dicabut.daftar));

ws.close();

const adaPaket = (r) => r.daftar.some(milikPaket);
const gagal = [];
if (adaPaket(sebelum)) gagal.push('entri milik paket sudah muncul sebelum paket dipasang - kontrolnya tidak bersih');
if (!adaPaket(sesudah)) {
  gagal.push(`mengetik "${PEMICU}" + Ctrl+Space tidak memunculkan entri snippet dari paket (daftar: ${ringkas(sesudah.daftar)}) - paket terpasang tapi tidak dikonsumsi editor`);
}
for (const [nama, r] of [['sebelum', sebelum], ['sesudah', sesudah], ['dicabut', dicabut]]) {
  if (r.editorHilang) {
    gagal.push(`pengukuran \"${nama}\" tidak sah: editor tidak ter-mount sesudah menunggu (bukan bukti soal paket)`);
    continue;
  }
  if (r.dokSiap !== PEMICU) {
    gagal.push(`pengukuran \"${nama}\" tidak sah: pemicu \"${PEMICU}\" tidak ada di dokumen saat completion dibuka (dokumen: ${JSON.stringify(r.dokSiap)})`);
  }
}
if (sesudah.daftar.length && !sesudah.terpakai) {
  gagal.push(`entri paket untuk pemicu \"${PEMICU}\" tidak ada di daftar completion walau paket terpasang (irisan yang dirender: ${ringkas(sesudah.daftar)})`);
}
if (sesudah.daftar.length && !sesudah.dokumenSesudah) gagal.push('entri tidak bisa diambil (dokumen tidak terbaca sesudah Enter)');
if (sesudah.dokumenSesudah !== null && !HARAP.test(sesudah.dokumenSesudah)) {
  gagal.push(`mengambil entri tidak memasukkan badan snippet ke dokumen (dokumen: ${JSON.stringify(sesudah.dokumenSesudah)})`);
}
if (adaPaket(dicabut)) gagal.push('entri snippet masih muncul setelah paket dicabut');

console.log('');
if (gagal.length) {
  console.log('GAGAL:');
  for (const g of gagal) console.log('  - ' + g);
  process.exitCode = 1;
} else {
  const entri = sesudah.terpakai ?? sesudah.daftar.find(milikPaket);
  console.log(`LULUS: "${PEMICU}" tidak menawarkan apa pun sebelum paket dipasang; sesudah ${PAKET} dipasang muncul ${sesudah.daftar.length} entri (${entri ? `"${entri.label}" [${entri.detail}]` : 'entri snippet'}), dan mengambilnya memasukkan badan snippet ke dokumen; hilang lagi setelah dicabut.`);
}
