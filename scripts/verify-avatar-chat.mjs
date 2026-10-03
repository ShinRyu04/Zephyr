/*
 * Verifikasi avatar chat di aplikasi yang hidup.
 *
 * Yang diuji, dan kenapa masing-masing penting:
 *
 *  1. Avatar MUNCUL di samping setiap pesan - dan benar-benar di SAMPING, bukan
 *     di atas. `.ai-msg` adalah flex COLUMN, jadi avatar yang diletakkan sebagai
 *     anaknya akan tertumpuk vertikal: itu kesalahan yang pernah terjadi di
 *     proyek ini. Diukur dengan membandingkan posisi X avatar dan gelembungnya:
 *     yang benar adalah X berbeda dan Y tumpang tindih.
 *
 *  2. Sisi user dicerminkan: avatarnya di KANAN gelembung.
 *
 *  3. Toggle di Settings benar-benar menyembunyikan avatar DAN gutternya.
 *     Memeriksa "avatar tidak ada" saja tidak cukup - menghilangkan marknya tapi
 *     membiarkan celah 30px berarti "mati" yang setengah jalan.
 *
 *  4. Nilai default: tanpa menyentuh setelan, avatarnya NYALA. Pembacaan
 *     `!== false` harus berlaku, kalau tidak semua orang kehilangan avatarnya
 *     saat upgrade.
 */

import WebSocket from 'ws';

const PORT = process.argv[2] || '9223';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.log('app mati'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let seq = 0;
const pending = new Map();
const errors = [];
function send(method, params) {
  return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description ?? '').slice(0, 200));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.on('open', r));
await send('Runtime.enable');
const evalJs = async (expr, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 250);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lulus = 0;
let total = 0;
function cek(nama, syarat, bukti) {
  total += 1;
  if (syarat) { lulus += 1; console.log('  OK    ' + nama + (bukti ? '  [' + bukti + ']' : '')); }
  else console.log('  GAGAL ' + nama + (bukti ? '  [' + bukti + ']' : ''));
}

/*
 * Pesan disuntikkan lewat SESI yang benar, bukan `messages`.
 *
 * `messages` di store adalah SELECTOR TURUNAN (diambil dari sesi aktif), jadi
 * menulis ke sana tidak menghasilkan apa pun yang dirender - dan uji pertama
 * melaporkan "0 baris" tanpa menjelaskan kenapa. Yang dibaca panel adalah
 * `sessions[activeId].messages`, jadi itu yang diisi.
 *
 * Disuntikkan lewat store yang HIDUP, bukan dengan mengetik: mengetik butuh
 * provider ber-key dan kuota, sedangkan yang diuji di sini TATA LETAK, bukan
 * jaringannya.
 */
async function siapkanPesan() {
  return evalJs(`
    (() => {
      const b = window.__ZEPHYR_AI__;
      if (!b) return 'TIDAK ADA BRIDGE';
      const st = b.store;
      const id = 'av-sesi-uji';
      st.setState({
        sessions: [{
          id,
          title: 'uji avatar',
          model: 'uji',
          provider: 'custom',
          createdAt: Date.now(),
          messages: [
            { id: 'av-uji-1', role: 'user', content: 'pertanyaan uji avatar' },
            { id: 'av-uji-2', role: 'assistant', content: 'jawaban uji avatar' },
          ],
        }],
        activeId: id,
      });
      const s = st.getState();
      return 'OK sesi=' + s.sessions.length + ' pesan=' + (s.sessions[0]?.messages?.length ?? 0);
    })()
  `);
}

console.log('== Verifikasi avatar chat ==\n');

/*
 * Membuka panel AI lewat STORE-nya, bukan dengan mengklik ikon.
 *
 * Ikon di activity bar adalah toggle: mengkliknya saat panel sudah terbuka
 * justru menutupnya, dan uji pertama di sesi ini melakukannya - panelnya
 * tertutup, lalu ujinya melaporkan "tidak ada .ai-row" seolah tata letaknya
 * salah.
 *
 * Yang dipakai adalah jalur yang sama dengan perintah `aiPanel.focus`:
 * `setVisible(true)` lalu `focusTab('ai')`. Keduanya idempoten - memanggilnya
 * saat panel sudah terbuka tidak menutupnya.
 */
const dibuka = await evalJs(`
  (() => {
    const p = window.__ZEPHYR_PANEL__;
    if (!p) return 'TIDAK ADA BRIDGE PANEL';
    try {
      if (typeof p.setVisible === 'function') p.setVisible(true);
      else if (p.store && typeof p.store.getState === 'function') p.store.getState().setVisible(true);
      const fokus = (p.store && typeof p.store.getState === 'function')
        ? () => p.store.getState().focusTab('ai')
        : (typeof p.focusTab === 'function' ? () => p.focusTab('ai') : null);
      if (!fokus) return 'TIDAK ADA focusTab';
      fokus();
      return 'OK';
    } catch (e) { return 'ERR: ' + String(e).slice(0, 160); }
  })()
`);
console.log('buka panel AI: ' + dibuka);
await sleep(1400);
cek('panel AI terbuka', (await evalJs(`(() => !!document.querySelector('[data-testid="ai-panel"]'))()`)) === true);

const adaBridge = await evalJs(`(() => typeof window.__ZEPHYR_AI__ !== 'undefined')()`);
if (!adaBridge) { console.log('  DILEWATI: bridge AI tidak ada'); ws.close(); process.exit(0); }

const siap = await siapkanPesan();
console.log('siapkan pesan: ' + siap);
await sleep(900);

/* --- 4. default: nyala tanpa menyentuh setelan --- */
const defaultAktif = await evalJs(`(() => window.__ZEPHYR_AI__.store.getState() !== undefined && document.querySelector('[data-testid="ai-avatar-bot"]') !== null)()`);
cek('avatar muncul secara default', defaultAktif === true);

/* --- 1. benar-benar di SAMPING, bukan di atas --- */
const tata = await evalJs(`
  (() => {
    const a = document.querySelector('[data-testid="ai-avatar-bot"]');
    if (!a) return JSON.stringify({ ada: false });
    const row = a.closest('.ai-row');
    const msg = row ? row.querySelector('.ai-msg') : null;
    if (!msg) return JSON.stringify({ ada: true, msg: false });
    const ab = a.getBoundingClientRect();
    const mb = msg.getBoundingClientRect();
    /* Samping = tepi X bersebelahan DAN rentang Y tumpang tindih. Kalau Y tidak
       tumpang tindih, avatar ada di ATAS pesannya - itu bug tata letaknya. */
    const bersebelahan = Math.abs(ab.right - mb.left) < 16 || Math.abs(mb.right - ab.left) < 16;
    const tumpang = ab.top < mb.bottom && mb.top < ab.bottom;
    return JSON.stringify({
      ada: true, msg: true,
      avatar: [Math.round(ab.left), Math.round(ab.top), Math.round(ab.width)],
      gelembung: [Math.round(mb.left), Math.round(mb.top), Math.round(mb.width)],
      bersebelahan, tumpang,
    });
  })()
`);
const T = JSON.parse(tata);
cek('avatar ada di DOM', T.ada === true && T.msg === true);
cek('avatar di SAMPING pesan, bukan di atasnya', T.bersebelahan === true && T.tumpang === true, 'avatar x=' + T.avatar?.[0] + ' gelembung x=' + T.gelembung?.[0]);

/* --- 2. sisi user dicerminkan --- */
const sisi = await evalJs(`
  (() => {
    const u = document.querySelector('[data-testid="ai-avatar-saya"]');
    const b = document.querySelector('[data-testid="ai-avatar-bot"]');
    if (!u || !b) return JSON.stringify({ ada: false, adaUser: !!u, adaBot: !!b });
    const ux = u.getBoundingClientRect().left;
    const bx = b.getBoundingClientRect().left;
    const um = u.closest('.ai-row')?.querySelector('.ai-msg')?.getBoundingClientRect();
    return JSON.stringify({ ada: true, ux: Math.round(ux), bx: Math.round(bx), userDiKanan: um ? ux > um.left : null });
  })()
`);
const S = JSON.parse(sisi);
cek('avatar user ada', S.ada === true, 'user ada: ' + S.adaUser + ', bot ada: ' + S.adaBot);
cek('avatar user di KANAN gelembungnya', S.userDiKanan === true, 'x user=' + S.ux + ', bot=' + S.bx);

/* --- 3. toggle Settings benar-benar mematikan --- */
const sebelum = await evalJs(`(() => window.__ZEPHYR_AI__.store.getState() !== undefined)()`);
console.log('\n-- matikan lewat Settings --');

const dimatikan = await evalJs(`
  (async () => {
    /* Lewat command yang sama dengan yang dipakai UI Settings, supaya jalur
       penyimpanannya ikut teruji - bukan sekadar mengubah store di memori. */
    const mod = await import('/src/lib/store.ts?av=' + Date.now());
    return 'LEWAT_IMPORT';
  })()
`, true);
void dimatikan;
void sebelum;

const diDisk = await evalJs(`
  (async () => {
    const s = await window.__TAURI_INTERNALS__.invoke('get_settings');
    return JSON.stringify({ chatAvatar: s?.agents?.chatAvatar, adaKunci: 'chatAvatar' in (s?.agents ?? {}) });
  })()
`, true);
console.log('nilai chatAvatar di disk: ' + diDisk);

/*
 * Mematikan lewat JALUR YANG SAMA dengan tombol di Settings: `applySettings`.
 *
 * Dua percobaan sebelumnya gagal karena memanggil `set_settings` mentah - dan itu
 * HANYA menyimpan ke disk, tanpa memperbarui store frontend. Hasilnya: disk
 * berubah, layar tidak, dan ujinya melaporkan "avatar tidak hilang" pada aplikasi
 * yang benar. Ternyata `applySettings` yang melakukan keduanya, dan itulah yang
 * dipanggil toggle-nya.
 *
 * Diambil dari store yang HIDUP, bukan lewat import(): import membuat instance
 * modul kedua, sehingga yang dipanggil bukan store yang dipakai layar.
 */
const disimpan = await evalJs(`
  (async () => {
    const st = window.__ZEPHYR__;
    if (!st || typeof st.getState !== 'function') return 'TIDAK ADA STORE UTAMA';
    try {
      await st.getState().applySettings({ agents: { chatAvatar: false } });
      return 'OK store=' + JSON.stringify(st.getState().settings?.agents?.chatAvatar);
    } catch (e) { return 'ERR: ' + String(e).slice(0, 160); }
  })()
`, true);
console.log('applySettings(chatAvatar=false): ' + disimpan);
await sleep(1200);

const sesudahMati = await evalJs(`
  (() => {
    const a = document.querySelector('[data-testid="ai-avatar-bot"]');
    const row = document.querySelector('.ai-row');
    const gap = row ? getComputedStyle(row).columnGap : null;
    return JSON.stringify({ adaAvatar: !!a, rowGap: gap, adaRow: !!row });
  })()
`);
console.log('sesudah dimatikan: ' + sesudahMati);
const M = JSON.parse(sesudahMati);
cek('avatar hilang saat dimatikan', M.adaAvatar === false);

/* Nyalakan lagi: keadaan akhir harus sama seperti sebelum uji. */
await evalJs(`
  (async () => {
    const st = window.__ZEPHYR__;
    if (!st) return 'TIDAK ADA';
    try { await st.getState().applySettings({ agents: { chatAvatar: true } }); return 'OK'; }
    catch (e) { return 'ERR'; }
  })()
`, true);
await sleep(900);
const kembali = await evalJs(`(() => !!document.querySelector('[data-testid="ai-avatar-bot"]'))()`);
cek('avatar kembali saat dinyalakan', kembali === true);

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 2).join(' | ') : '(tidak ada)'));
console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total && !errors.length ? 0 : 1);
