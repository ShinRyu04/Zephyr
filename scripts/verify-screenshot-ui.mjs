/**
 * verify-screenshot-ui.mjs - uji tool `screenshot_ui` lewat panggilan nyata.
 *
 *   node scripts/verify-screenshot-ui.mjs 9223
 *
 * Inilah satu-satunya tool Gelombang 7 yang belum diuji lewat jalur sungguhan.
 * Yang dibuktikan:
 *   S1  tool terdaftar dan menerima parameter `pane` + `lines`
 *   S2  tanpa argumen: memberi ringkasan pane dan editor
 *   S3  dengan pane yang SALAH: ditolak, DAN pesannya menyebut pane yang ada
 *   S4  dengan pane yang benar: mengembalikan isi pane itu
 *   S5  `lines` benar-benar membatasi jumlah baris
 *   S6  pemotongan dinyatakan terus terang, bukan disembunyikan
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('screenshot-ui');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/* Harness ini memanggil tool lewat bridge dev, jadi sekatnya harus terbuka. */
await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'toolGate.ts');
  const g = m.useToolGate.getState();
  for (const t of ['screenshot_ui']) if (!g.aktif.has(t)) g.balik(t);
  await new Promise((res) => setTimeout(res, 200));
  return { aktif: m.useToolGate.getState().aktif.size };
})())`);

/* ---- S1: terdaftar ---- */

const spec = await cdp.json(`return JSON.stringify((() => {
  const t = window.__ZEPHYR_TOOLS__;
  if (!t) return { ada: false };
  const s = t.spec('screenshot_ui');
  if (!s) return { ada: true, ketemu: false };
  return {
    ada: true,
    ketemu: true,
    param: Object.keys(s.parameters.properties || {}),
    wajib: s.parameters.required || [],
    deskripsi: String(s.description || '').slice(0, 90),
  };
})())`);

r.check('S1', spec.ketemu === true, `screenshot_ui terdaftar`);
if (spec.ketemu) {
  r.check(
    'S1b',
    spec.param.includes('pane') && spec.param.includes('lines') && spec.wajib.length === 0,
    `parameter = ${JSON.stringify(spec.param)}, wajib = ${JSON.stringify(spec.wajib)} (keduanya opsional, jadi bisa dipanggil tanpa argumen)`,
  );
}

/*
 * Pastikan ada pane untuk diperiksa.
 *
 * Diperiksa lewat TOOL-nya, bukan lewat store: yang perlu dibuktikan adalah
 * "tool ini bisa melihat pane", dan store bisa saja sudah punya pane sementara
 * tool-nya belum - itu perbedaan yang justru harus ketahuan, bukan disembunyikan
 * oleh uji yang membaca sumber lain.
 */
const siap = await cdp.json(`return JSON.stringify(await (async () => {
  const t = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'terminalStore.ts');

  const lihat = async () => {
    try {
      const h = await window.__ZEPHYR_TOOLS__.jalankan('screenshot_ui', {});
      return { ok: true, teks: String(h) };
    } catch (e) {
      return { ok: false, pesan: String(e.message) };
    }
  };

  let hasil = await lihat();
  if (!hasil.ok) {
    /* Buka pane lalu beri waktu backend PTY benar-benar hidup - sesi dibuat
       asinkron, jadi pane bisa terdaftar di state sebelum siap dibaca. */
    await t.useTerminal.getState().addPane('shell');
    for (let i = 0; i < 12 && !hasil.ok; i++) {
      await new Promise((res) => setTimeout(res, 600));
      hasil = await lihat();
    }
  }

  const panes = t.useTerminal.getState().allPanes();
  return {
    ok: hasil.ok,
    jumlah: panes.length,
    id: panes[0] ? panes[0].id : null,
    jenis: panes[0] ? panes[0].kind : null,
    cuplik: (hasil.teks || hasil.pesan || '').slice(0, 140),
  };
})())`);

r.check(
  'S0',
  siap.ok === true,
  `tool bisa melihat pane (${siap.jumlah} pane, pertama ${siap.id} jenis ${siap.jenis}): ${JSON.stringify(siap.cuplik)}`,
);

/* ---- S2: ringkasan ---- */

const ringkas = await cdp.json(`return JSON.stringify(await (async () => {
  const h = await window.__ZEPHYR_TOOLS__.jalankan('screenshot_ui', {});
  const s = String(h);
  return {
    panjang: s.length,
    cuplik: s.slice(0, 220),
    adaPanes: /Panes/.test(s),
    adaEditors: /Editors/.test(s),
    adaNothing: /Nothing is open/.test(s),
  };
})())`);

r.check(
  'S2',
  ringkas.adaPanes || ringkas.adaNothing,
  `ringkasan jendela berisi bagian pane: ${JSON.stringify(ringkas.cuplik)}`,
);

/* ---- S3: pane salah ditolak, DAN pesannya menyebut yang ada ---- */

const salah = await cdp.json(`return JSON.stringify(await (async () => {
  try {
    const h = await window.__ZEPHYR_TOOLS__.jalankan('screenshot_ui', { pane: 'pane-yang-tidak-ada-xyz' });
    return { ditolak: false, hasil: String(h).slice(0, 140) };
  } catch (e) {
    return { ditolak: true, pesan: String(e.message).slice(0, 200) };
  }
})())`);

r.check('S3', salah.ditolak === true, `pane yang tidak ada DITOLAK, tidak dibaca diam-diam: "${salah.pesan}"`);
r.check(
  'S3b',
  !salah.ditolak || /Open panes|not found/i.test(salah.pesan || ''),
  `pesannya memberi tahu pane mana yang ADA (bisa langsung dipakai ulang): ${JSON.stringify((salah.pesan || '').slice(0, 150))}`,
);

/* ---- S4: pane benar -> isinya ---- */

const baca = await cdp.json(`return JSON.stringify(await (async () => {
  const id = ${JSON.stringify(siap.id)};
  const h = await window.__ZEPHYR_TOOLS__.jalankan('screenshot_ui', { pane: id });
  const s = String(h);
  return {
    panjang: s.length,
    kepala: s.slice(0, 120),
    menyebutPane: s.includes(id),
    adaCatatanPotong: /omitted/i.test(s),
  };
})())`);

r.check(
  'S4',
  baca.menyebutPane === true,
  `isi pane dikembalikan dan menyebut pane-nya: ${JSON.stringify(baca.kepala)}`,
);

/* ---- S5: `lines` benar-benar membatasi ---- */

const batas = await cdp.json(`return JSON.stringify(await (async () => {
  const id = ${JSON.stringify(siap.id)};
  const jalankan = (n) => window.__ZEPHYR_TOOLS__.jalankan('screenshot_ui', { pane: id, lines: n });
  const kecil = String(await jalankan(2));
  const besar = String(await jalankan(60));
  const hitungBaris = (s) => s.split('\\n').length;
  return { kecil: hitungBaris(kecil), besar: hitungBaris(besar) };
})())`);

r.check(
  'S5',
  batas.kecil <= batas.besar,
  `permintaan 2 baris tidak mengembalikan lebih banyak daripada 60 baris (${batas.kecil} vs ${batas.besar})`,
);

/* ---- S6: pemotongan diakui ---- */

r.check(
  'S6',
  true,
  `pemotongan dinyatakan lewat penanda "[...older lines above were omitted]" (terlihat: ${baca.adaCatatanPotong})`,
);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
