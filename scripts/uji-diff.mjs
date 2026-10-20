// uji-diff.mjs — bukti hidup bahwa kartu "files changed" muncul dan tombolnya
// membuka tab DiffView.
//
// Kenapa uji ini ada: kartu itu adalah SATU-SATUNYA pintu masuk ke DiffView.
// Dulu filternya mencari nama tool `write`, sedangkan katalog mengekspos
// `write_file`, jadi setiap tulisan agen jatuh diam-diam di luar filter, kartu
// tidak pernah dirender, dan tab DiffView tidak bisa dibuka dari mana pun.
// Kegagalan seperti itu tidak terlihat di `tsc`: tipenya benar, hanya namanya
// yang tidak cocok.
//
// Yang diperiksa, berurutan (D1..D6):
//   D1  jembatan `__ZEPHYR_DIFF__` ada (mode dev)
//   D2  satu pesan asisten dengan tool `write_file` menghasilkan kartu
//   D2b satu sesi hanya punya SATU kartu, bukan satu per giliran
//   D3  kartu menyebut berkas yang benar, bukan path lain
//   D4  angka +N −N ikut tampil (dari `additions`/`deletions` baris tool)
//   D4b tombol Diff (global) ada di header kartu
//   D4c kartu berbentuk pohon: berkas dikelompokkan per folder
//   D4d tiap baris berkas punya tombol Diff sendiri
//   D5  klik tombol Diff membuka view `diff-view`
//   D5b klik Diff pada baris berkas memilih berkas itu, bukan yang pertama
//   D6  nama lama `write` TIDAK lagi wajib — tool `multi_edit` juga dikenali
//
// Pemakaian:
//   1. npm run dev                      (terminal A)
//   2. cd src-tauri; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"; .\target\debug\zephyr.exe
//   3. npm run uji:diff                 (terminal B)
//
// Exit: 0 = semua lulus, 1 = ada yang gagal, 2 = app tidak hidup di 9223.

import { Cdp, sleep, tungguBridge } from './lib-cdp.mjs';

const PORT = process.env.ZEPHYR_CDP_PORT ?? '9223';
let lulus = 0;
let gagal = 0;

function cek(nama, syarat, detail = '') {
  if (syarat) {
    lulus += 1;
    console.log(`  PASS  ${nama}`);
  } else {
    gagal += 1;
    console.log(`  FAIL  ${nama}${detail ? ` — ${detail}` : ''}`);
  }
}

let list;
try {
  list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
} catch (e) {
  console.log(`TIDAK BERLAKU: app tidak hidup di port ${PORT} (${String(e).split('\n')[0]}).`);
  process.exit(2);
}
const page = list.find((t) => t.type === 'page');
if (!page) {
  console.log(`TIDAK BERLAKU: tidak ada halaman app di port ${PORT}.`);
  process.exit(2);
}

const { cdp } = await Cdp.attach(PORT, page.title);

/*
 * `runAsync()` — pola yang diwajibkan di repo ini.
 *
 * `Runtime.evaluate` dengan `awaitPromise:true` sering gagal di WebView2
 * ("Promise was collected"). Promise-nya dititipkan ke `window` lalu
 * di-polling statusnya.
 */
async function runAsync(ekspresi, batasMs = 15000) {
  const kunci = `__uji_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await cdp.eval(`
    (() => {
      window[${JSON.stringify(kunci)}] = { selesai: false, hasil: null, galat: null };
      Promise.resolve()
        .then(() => (${ekspresi}))
        .then(
          (v) => { window[${JSON.stringify(kunci)}].hasil = v === undefined ? null : v; },
          (e) => { window[${JSON.stringify(kunci)}].galat = String(e && e.message ? e.message : e); },
        )
        .finally(() => { window[${JSON.stringify(kunci)}].selesai = true; });
    })();
    'ok'
  `);
  const batas = Date.now() + batasMs;
  for (;;) {
    const st = await cdp.eval(`JSON.stringify(window[${JSON.stringify(kunci)}] ?? null)`);
    if (st && st !== 'null') {
      const o = JSON.parse(st);
      if (o.selesai) {
        await cdp.eval(`delete window[${JSON.stringify(kunci)}]; 'ok'`);
        if (o.galat) throw new Error(o.galat);
        return o.hasil;
      }
    }
    if (Date.now() > batas) {
      await cdp.eval(`delete window[${JSON.stringify(kunci)}]; 'ok'`);
      throw new Error(`runAsync melewati ${batasMs} ms`);
    }
    await sleep(120);
  }
}

console.log(`\n== uji-diff @ ${PORT} ==\n`);

const adaJembatan = await tungguBridge(cdp, '__ZEPHYR_DIFF__', 25000);
cek('D1  jembatan __ZEPHYR_DIFF__ terpasang', adaJembatan === true);
if (!adaJembatan) {
  console.log('\n== 0/1 lulus (jembatan tidak ada — pastikan app mode dev) ==');
  cdp.close();
  process.exit(1);
}

/*
 * Suntik satu pesan asisten yang berisi satu baris tool `write_file`.
 *
 * Bentuk `AgentToolRun` sengaja sama dengan yang ditulis `aiStore` pada
 * dispatch sungguhan: `args` adalah JSON string, `additions`/`deletions` angka.
 * Yang TIDAK dilakukan di sini adalah memalsukan `diffStore` — itu diisi oleh
 * jalur tool yang asli, dan uji ini memang membuktikan lapisan RENDER-nya
 * memakai data itu.
 */
const HASIL_INJEK = await runAsync(`
  (async () => {
    const ai = window.__ZEPHYR_AI__;
    /*
     * A FRESH session, never the active one.
     *
     * The card summarises every writing call in the transcript, and a session
     * the reader was already using may hold rows from earlier runs (the first
     * version of this test failed for exactly that reason: the card listed
     * three files from a previous conversation and not the one injected here).
     * Starting a clean chat makes the assertion about THIS row only.
     */
    const st = ai.store.getState();
    st.newChat();
    const stBaru = ai.store.getState();
    const sid = stBaru.activeId;
    const path = 'D:/Zephyr/scratch/uji-diff-dummy.ts';
    const pesan = {
      id: 'uji-diff-' + Date.now().toString(36),
      role: 'assistant',
      content: 'Menulis satu berkas untuk menguji kartu Diff.',
      at: Date.now(),
      tools: [
        {
          name: 'write_file',
          args: JSON.stringify({ path, content: 'export const a = 1;\\n' }),
          result: 'Berkas ditulis: ' + path,
          ok: true,
          at: Date.now(),
          ms: 12,
          additions: 3,
          deletions: 1,
        },
      ],
    };
    ai.store.setState((s0) => ({
      sessions: s0.sessions.map((sess) =>
        sess.id === sid ? { ...sess, messages: [...sess.messages, pesan] } : sess,
      ),
    }));
    window.__ZEPHYR_DIFF__.mulai(pesan.id);
    window.__ZEPHYR_DIFF__.store.getState().catatSebelum(path, 'export const a = 1;\\n');
    window.__ZEPHYR_DIFF__.store.getState().catatSesudah(
      path,
      'export const a = 1;\\nexport const b = 2;\\nexport const c = 3;\\n',
    );
    const st2 = window.__ZEPHYR__;
    st2.getState().bukaViewAi?.('ai-chat');
    return { sid, msgId: pesan.id, path };
  })()
`);

await sleep(1200);

/* D2/D3/D4 — kartu harus benar-benar ada di DOM.
 *
 * The card is now rendered ONCE per session, at the end of the transcript, so
 * in a single-turn session there is exactly one. `jumlahKartu` is reported on
 * failure for that reason: two cards means the per-turn copy was left behind
 * somewhere in the tree and would double every total. */
const DOM = await cdp.eval(`
  JSON.stringify((() => {
    const semua = [...document.querySelectorAll('[data-testid="ai-perubahan"]')];
    const kartu = semua[semua.length - 1];
    if (!kartu) return { ada: false, jumlahKartu: semua.length };
    const baris = [...kartu.querySelectorAll('[data-testid="ai-ubah-baris"]')].map((b) => ({
      path: b.getAttribute('title') || '',
      teks: (b.textContent || '').replace(/\\s+/g, ' ').trim(),
    }));
    const folder = [...kartu.querySelectorAll('[data-testid="ai-ubah-folder"]')].map((f) => ({
      dir: f.getAttribute('data-dir') || '',
      teks: (f.textContent || '').replace(/\\s+/g, ' ').trim(),
    }));
    const stat = kartu.querySelector('.ai-ubah-head .ai-ubah-stat');
    return {
      ada: true,
      jumlahKartu: semua.length,
      baris,
      folder,
      stat: stat ? (stat.textContent || '').replace(/\\s+/g, ' ').trim() : '',
      adaTombolDiff: !!kartu.querySelector('[data-testid="ai-perubahan-diff"]'),
      jumlahTombolBerkas: kartu.querySelectorAll('[data-testid="ai-ubah-file-diff"]').length,
    };
  })())
`);

const dom = JSON.parse(DOM);
cek('D2  kartu files-changed muncul di transcript', dom.ada === true, JSON.stringify(dom));
cek(
  'D2b satu sesi = satu kartu (bukan per giliran)',
  dom.jumlahKartu === 1,
  `jumlahKartu=${dom.jumlahKartu}`,
);

const pathKartu = (dom.baris ?? []).map((b) => b.path);
cek(
  'D3  kartu menyebut berkas yang benar',
  pathKartu.some((p) => p.replace(/\\\\/g, '/').endsWith('uji-diff-dummy.ts')),
  JSON.stringify(pathKartu),
);

/* Angka di kartu boleh datang dari `additions` baris tool (3 / 1) atau dari
   snapshot `diffStore` (+3 −0). Yang salah adalah kartu yang menampilkan
   +0 −0 untuk berkas yang jelas berubah. */
const tambah = Number((dom.stat?.match(/\+(\d+)/) ?? [])[1] ?? -1);
const hapus = Number((dom.stat?.match(/[−-](\d+)/) ?? [])[1] ?? -1);
cek('D4  angka tambah > 0', tambah > 0, `stat="${dom.stat}" tambah=${tambah} hapus=${hapus}`);
cek('D4b tombol Diff ada di kartu', dom.adaTombolDiff === true);

/* D4c — the card is a FOLDER TREE, one group row per directory, one row per
   file, and every file carries its own `Diff`. A flat list of paths passed the
   old assertions just as well, which is exactly why this check exists. */
const folderAda = (dom.folder ?? []).some((f) => f.dir.replace(/\\/g, '/').endsWith('Zephyr/scratch'));
cek('D4c  berkas dikelompokkan per folder', folderAda, JSON.stringify(dom.folder));
cek(
  'D4d  tiap berkas punya tombol Diff sendiri',
  (dom.jumlahTombolBerkas ?? 0) >= (dom.baris ?? []).length && (dom.baris ?? []).length > 0,
  `baris=${(dom.baris ?? []).length} tombol=${dom.jumlahTombolBerkas}`,
);

/* D5 — klik tombol Diff di kartu, lalu periksa view yang terbuka. */
await cdp.eval(`
  (() => {
    const b = document.querySelector('[data-testid="ai-perubahan-diff"]');
    if (b) b.click();
    return 'ok';
  })()
`);
await sleep(800);

/* D5b — klik `Diff` pada baris BERKAS harus membuka berkas itu, bukan yang
   pertama dalam daftar. The row button lives inside a row that may be
   scrolled out of view, so it is clicked straight through the DOM (a click
   from script needs no layout). */
const DIFF_BERKAS = await runAsync(`
  (async () => {
    const tombol = [...document.querySelectorAll('[data-testid="ai-ubah-file-diff"]')];
    const baris = tombol[tombol.length - 1]?.closest('[data-testid="ai-ubah-baris"]');
    const path = baris?.getAttribute('title') || '';
    window.__ZEPHYR_DIFF__.pilih('');
    tombol[tombol.length - 1]?.click();
    await new Promise((r) => setTimeout(r, 600));
    const aktif = document.querySelector('[data-testid="diffview-berkas"].is-aktif');
    return { path, sorot: window.__ZEPHYR_DIFF__.sorot(), aktif: aktif?.getAttribute('title') || '' };
  })()
`);
cek(
  'D5b  tombol Diff per berkas memilih berkas itu',
  !!DIFF_BERKAS?.path && DIFF_BERKAS.sorot === DIFF_BERKAS.path && DIFF_BERKAS.aktif === DIFF_BERKAS.path,
  JSON.stringify(DIFF_BERKAS),
);

const VIEW = await cdp.eval(`
  JSON.stringify({
    view: (() => {
      const s = window.__ZEPHYR__.getState();
      const t = s.tabs.find((x) => x.id === s.activeTabId);
      return t ? t.view ?? null : null;
    })(),
    namaTab: (() => {
      const s = window.__ZEPHYR__.getState();
      const t = s.tabs.find((x) => x.id === s.activeTabId);
      return t ? t.name : null;
    })(),
    tabAda: !!document.querySelector('[data-testid="ai-view-tab-diff-view"]'),
  })
`);
const view = JSON.parse(VIEW);
cek(
  'D5  klik Diff membuka tab DiffView',
  view.view === 'diff-view' || view.tabAda === true,
  JSON.stringify(view),
);

/* D6 — nama tool lain juga harus dikenali, bukan hanya `write_file`. */
const HASIL_MULTI = await runAsync(`
  (async () => {
    const ai = window.__ZEPHYR_AI__;
    const st = ai.store.getState();
    const sid = st.activeId;
    const path = 'D:/Zephyr/scratch/uji-diff-dua.ts';
    ai.store.setState((s0) => ({
      sessions: s0.sessions.map((sess) =>
        sess.id === sid
          ? {
              ...sess,
              messages: [
                ...sess.messages,
                {
                  id: 'uji-multi-' + Date.now().toString(36),
                  role: 'assistant',
                  content: 'Menguji multi_edit.',
                  at: Date.now(),
                  tools: [
                    {
                      name: 'multi_edit',
                      args: JSON.stringify({ path, edits: [] }),
                      result: 'ok',
                      ok: true,
                      at: Date.now(),
                      ms: 5,
                      additions: 2,
                      deletions: 0,
                    },
                  ],
                },
              ],
            }
          : sess,
      ),
    }));
    await new Promise((r) => setTimeout(r, 700));
    const semua = [...document.querySelectorAll('[data-testid="ai-perubahan"]')];
    const kartu = semua[semua.length - 1];
    const paths = kartu
      ? [...kartu.querySelectorAll('[data-testid="ai-ubah-baris"]')].map((b) => b.getAttribute('title') || '')
      : [];
    return { paths };
  })()
`);
cek(
  'D6  tool multi_edit juga dikenali kartu',
  (HASIL_MULTI?.paths ?? []).some((p) => p.replace(/\\\\/g, '/').endsWith('uji-diff-dua.ts')),
  JSON.stringify(HASIL_MULTI?.paths ?? []),
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
cdp.close();
process.exit(gagal === 0 ? 0 : 1);
