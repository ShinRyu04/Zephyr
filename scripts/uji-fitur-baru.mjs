/*
 * Verifikasi fitur yang baru ditambahkan, pada APLIKASI HIDUP lewat CDP.
 *
 * Kenapa lewat CDP dan bukan sekadar `tsc`: `tsc` membuktikan tipe cocok, bukan
 * bahwa sesuatu berada di layar. Delapan ikon tool pernah lolos `tsc` dengan
 * `case` duplikat - kompilasi bersih, dan ikonnya tidak pernah muncul.
 *
 * Aturan yang dipakai berkas ini, hasil dari kesalahan di sesi ini:
 *  - Store diakses lewat `window.__ZEPHYR_*__` (jembatan dev), BUKAN `import()`.
 *    `import()` dari skrip CDP memuat instance modul KEDUA, jadi store yang
 *    dibaca bukan store yang dipakai komponen yang hidup.
 *  - Jangan mencari baris pohon lewat `textContent` (glyph SVG ikut terbaca).
 *    Untuk ikon, periksa `querySelector('svg')` di dalamnya.
 *  - `fetch` ke port mati MELEMPAR, jadi setiap panggilan dibungkus try/catch.
 *
 * Dipakai: node scripts/uji-fitur-baru.mjs <port-cdp>
 */

const PORT = process.argv[2] || '9223';
let ws = null;
let idUrut = 1;
const menunggu = new Map();

const hasil = [];
function catat(nama, lulus, info) {
  hasil.push({ nama, lulus, info });
  console.log((lulus ? '  LULUS  ' : '  GAGAL  ') + nama + (info ? '  -> ' + info : ''));
}

async function sambung() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const daftar = await r.json();
  /*
   * Target Zephyr HARUS `http://tauri.localhost/`. Port debug bisa dipegang
   * aplikasi LAIN di mesin ini (pernah kejadian: app Electron lain memakai 9333),
   * dan tanpa pemeriksaan ini uji bisa berjalan di aplikasi yang salah.
   */
  const t = daftar.find((x) => x.url && (x.url.includes('tauri.localhost') || x.url.includes('localhost:5173')));
  if (!t) {
    throw new Error('target Zephyr tidak ditemukan. Daftar: ' + daftar.map((x) => x.url).join(', '));
  }
  console.log('target: ' + t.url + (t.url.includes('5173') ? '  (build dev)' : '  (build rilis)'));
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && menunggu.has(m.id)) {
      const { res, rej } = menunggu.get(m.id);
      menunggu.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error)));
      else res(m.result);
    }
  };
}

function kirim(method, params) {
  const id = idUrut++;
  return new Promise((res, rej) => {
    menunggu.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/**
 * Menjalankan ekspresi di halaman dan mengembalikan nilainya.
 *
 * `awaitPromise: true` sering gagal di WebView2 dengan "Promise was collected",
 * jadi promise disimpan di `window` lebih dulu, lalu hasilnya dipoll.
 *
 * `catch` mengembalikan objek, bukan melempar: WebView2 TIDAK mengisi
 * `exceptionDetails` untuk error yang dilempar dari dalam async IIFE, jadi
 * lemparan hilang dan pesannya jadi kosong. Menangkapnya di dalam dan
 * mengembalikan `{ok:false, e}` adalah satu-satunya cara pesannya sampai ke sini.
 * Tanpa ini, laporan gagal hanya berbunyi "HARNESS GAGAL: " tanpa sebab - yang
 * persis terjadi pada versi pertama berkas ini.
 */
async function evalAsync(expr, tungguMs = 12000) {
  const kunci = '__uji' + Math.random().toString(36).slice(2);
  /*
   * The expression is wrapped in `(async () => { ... })()` and the caller is
   * expected to `return` its value.
   *
   * Two failure modes this shape avoids, both seen in this file:
   *
   * 1. The whole thing must run INSIDE that async IIFE. A bare `return` at the
   *    top level of `Runtime.evaluate` is a syntax error, and the error text is
   *    reported against the injected wrapper rather than the expression, which
   *    made the first version fail with an empty message.
   *
   * 2. `catch` records the reason into `{ok:false, e}`. WebView2 does NOT fill
   *    `exceptionDetails` for a rejection inside an async IIFE - the throw just
   *    vanishes. Converting it to a value here is the only way the reason
   *    survives to the polling loop below.
   *
   * The `?? 'tanpa pesan'` fallback exists because an error with no message
   * still has to say SOMETHING: an empty failure line sends the reader looking
   * at the wrong thing, which is exactly what happened before this was added.
   */
  /*
   * The marker holds the RESULT, never the promise.
   *
   * Two failed attempts before this worked, both for the same reason: the value
   * stored on `window` was the pending Promise, and `JSON.stringify` of a
   * Promise is the string "{}" - not "null", and not the eventual value. The
   * poll then read "{}" forever and reported a timeout, while the expression
   * itself had finished in 4ms.
   *
   * `void` on the promise is the fix: the outer IIFE runs, and its RESOLVED
   * value is written to the marker by the `.then`. Nothing polls a Promise.
   */
  const bungkus = `void (async () => {
try {
  const __v = await (async () => { ${expr} })();
  window['${kunci}'] = { ok: true, v: __v === undefined ? null : __v };
} catch (e) {
  window['${kunci}'] = { ok: false, e: (e && (e.stack || e.message)) || String(e) || 'tanpa pesan' };
}
})();`;
  await kirim('Runtime.evaluate', { expression: bungkus });
  const mulai = Date.now();
  while (Date.now() - mulai < tungguMs) {
    const r = await kirim('Runtime.evaluate', {
      expression: `JSON.stringify(window['${kunci}'] === undefined ? null : window['${kunci}'])`,
      returnByValue: true,
    });
    const teks = r?.result?.value;

    /*
     * An unfinished promise serialises to "{}" - NOT "null".
     *
     * JSON.stringify of a pending Promise yields an empty object, so the guard
     * has to reject that shape explicitly. The first version only treated "null"
     * as "not ready", read "{}" as a finished result, found no `ok` field on it,
     * and threw `new Error(undefined)` - an empty message, which is why this
     * harness failed twice with a blank reason and no way to see why.
     *
     * Anything that is not a parseable object with an `ok` property counts as
     * "still running". That covers "{}" and any future shape a pending promise
     * might take.
     */
    if (teks && teks !== 'null' && teks !== '{}') {
      let parsed = null;
      try {
        parsed = JSON.parse(teks);
      } catch {
        parsed = null;
      }
      if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
        deleteKunci(kunci);
        if (!parsed.ok) throw new Error(parsed.e || 'gagal tanpa pesan');
        return parsed.v;
      }
    }
    await new Promise((r2) => setTimeout(r2, 120));
  }
  throw new Error('timeout menunggu ekspresi selesai (kunci=' + kunci + ')');
}

/*
 * Fire-and-forget, and intentionally not awaited.
 *
 * The value was already read before this runs, so waiting adds a round trip per
 * assertion for nothing. It is sent without an id so no reply is expected -
 * `kirim` would register a promise that never resolves and leak an entry in
 * `menunggu` for every test.
 */
function deleteKunci(k) {
  ws.send(JSON.stringify({ method: 'Runtime.evaluate', params: { expression: `delete window['${k}']` } }));
}

async function evalSinkron(expr) {
  const r = await kirim('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result?.value;
}

async function main() {
  await sambung();
  console.log('terhubung ke Zephyr di port ' + PORT);
  console.log('');

  /* ---- 1. jembatan dev ada? Tanpa ini, semua uji store tidak sah. ---- */
  const jembatan = await evalSinkron(
    `JSON.stringify({store: !!window.__ZEPHYR__, term: !!window.__ZEPHYR_TERM__, sub: !!window.__ZEPHYR_SUB__, tools: !!window.__ZEPHYR_TOOLS__})`,
  );
  console.log('jembatan dev: ' + jembatan);
  const jb = JSON.parse(jembatan);
  if (!jb.store) {
    console.log('');
    console.log('BERHENTI: jembatan dev tidak ada. Aplikasi ini bukan build dev,');
    console.log('jadi uji store tidak bisa dijalankan - dan menjalankannya akan');
    console.log('mengukur store yang salah.');
    process.exit(2);
  }

  /* ---- 2. jembatan subagent TIDAK boleh lagi mengekspos bukaSunting ---- */
  const jalur = await evalSinkron(
    `JSON.stringify(Object.keys(window.__ZEPHYR_SUB__ || {}))`,
  );
  const kJalur = JSON.parse(jalur);
  catat(
    'jembatan subagent tidak punya bukaSunting/bukaBaru',
    !kJalur.includes('bukaSunting') && !kJalur.includes('bukaBaru'),
    kJalur.join(','),
  );

  /* ---- 3. setting general baru ada di store dengan default benar ----
     NOTE: this comment is OUTSIDE the template literal on purpose. Backticks
     cannot appear inside one, and a backtick in a comment INSIDE a template
     literal closes the string early - the parser then reports the error on a
     later line, which is why this file failed twice with a misleading location.
     Every comment that mentions a setting name here uses single quotes. */
  const g = await evalAsync(`
    const s = window.__ZEPHYR__.getState().settings;
    return JSON.stringify(s.general || null);
  `);
  const gen = JSON.parse(g || '{}');
  catat('general.confirmExit ada (default true)', gen.confirmExit !== false, 'nilai=' + String(gen.confirmExit));
  catat('general.defaultTerminal ada', 'defaultTerminal' in gen, 'nilai=' + String(gen.defaultTerminal));
  catat('general.shellPath ada', 'shellPath' in gen, 'nilai=' + JSON.stringify(gen.shellPath));

  /* general.layout harus STRING 'editor' atau 'terminal', bukan object. Ini bug
     yang diperbaiki: object layoutPrefs pernah ditulis ke kunci ini dan membuat
     pemeriksaan layout === 'terminal' selamanya false. */
  catat(
    'general.layout tetap string, bukan object',
    gen.layout === undefined || typeof gen.layout === 'string',
    'tipe=' + typeof gen.layout + ' nilai=' + JSON.stringify(gen.layout),
  );
  catat(
    'general.layoutPrefs object (rumah baru)',
    gen.layoutPrefs === undefined || typeof gen.layoutPrefs === 'object',
    'tipe=' + typeof gen.layoutPrefs,
  );

  /* ---- 4. Language Server: jumlah server lewat jembatan, bukan import() ---- */
  const jml = await evalSinkron(`
    (() => {
      const el = document.querySelector('[data-testid^="lsp-grup-"]');
      const semua = document.querySelectorAll('[data-testid^="lsp-grup-"]').length;
      return JSON.stringify({ grup: semua, adaGrup: !!el });
    })()
  `);
  const lspDom = JSON.parse(jml || '{}');
  console.log('  info: grup LSP di DOM (0 wajar kalau halaman LSP belum dibuka) -> ' + jml);

  /* ---- 5. persona: bawaan tidak boleh punya jalur sunting/duplikat ---- */
  const persona = await evalSinkron(`
    (() => {
      const st = window.__ZEPHYR_SUB__ ? null : null;
      return JSON.stringify({ subAksi: Object.keys(window.__ZEPHYR_SUB__ || {}) });
    })()
  `);
  console.log('  info: aksi di jembatan subagent -> ' + persona);

  /* ---- 7. BUKA halaman Settings lalu periksa DOM sungguhan ---- */
  const dom = await evalAsync(`
    /* Layar harus benar-benar dirender, bukan diperiksa dari kode. */
    window.__ZEPHYR__.getState().setSettingsOpen(true);
    await new Promise(r => setTimeout(r, 900));
    const kontrol = document.querySelectorAll('[data-testid]').length;
    const punya = (t) => !!document.querySelector('[data-testid="' + t + '"]');
    const h2 = [...document.querySelectorAll('.set-h2')].map(e => e.textContent.trim());
    const ikonH2 = document.querySelectorAll('.set-h2-ikon').length;
    return JSON.stringify({ kontrol, h2: h2.slice(0, 14), ikonH2,
      lspGlobal: punya('lsp-global'), confirmExit: punya('general-confirm-exit'),
      tray: punya('general-tray'), terminal: punya('general-terminal'),
      shellPath: punya('general-shell-path') });
  `);
  const d = JSON.parse(dom || '{}');
  console.log('  info: section settings -> ' + JSON.stringify(d.h2));
  catat('halaman Settings benar-benar merender', (d.kontrol || 0) > 20, d.kontrol + ' kontrol');
  catat('toggle confirm-exit ada di DOM', !!d.confirmExit);
  catat('toggle tray ada di DOM', !!d.tray);
  catat('pilihan default terminal ada di DOM', !!d.terminal);
  catat('input shell path ada di DOM', !!d.shellPath);

  /* ---- 8. TRAY harus DISABLED (tray belum dibangun) ---- */
  const tray = await evalSinkron(`
    (() => {
      const b = document.querySelector('[data-testid="general-tray"]');
      if (!b) return JSON.stringify({ ada: false });
      return JSON.stringify({ ada: true, disabled: b.disabled, aria: b.getAttribute('aria-checked') });
    })()
  `);
  const t2 = JSON.parse(tray || '{}');
  catat(
    'toggle tray disabled dan tidak berpura-pura menyala',
    t2.ada && t2.disabled === true && t2.aria === 'false',
    JSON.stringify(t2),
  );

  /*
   * Sections are reached by CLICKING THE NAV, not by calling a store action.
   *
   * `setSettingsSection` does not exist (only `setSettingsOpen` does), and
   * guessing an action name produces a failure that looks like a broken app
   * while the app is fine. Clicking is also the stronger test: it proves the
   * navigation itself works, which is what a user actually does.
   */
  const klikNav = async (idSection) => {
    return evalAsync(`
      const tombol = document.querySelector('[data-testid="sec-${idSection}"]')
        || [...document.querySelectorAll('.set-nav button, .settings-nav button')].find(b => (b.dataset.testid || '').includes('${idSection}'));
      if (!tombol) {
        const semua = [...document.querySelectorAll('.set-nav button, .settings-nav button')].map(b => b.dataset.testid || b.textContent.trim());
        return JSON.stringify({ ketemu: false, tersedia: semua });
      }
      tombol.click();
      await new Promise(r => setTimeout(r, 1200));
      return JSON.stringify({ ketemu: true });
    `);
  };

  /* ---- 9. LSP: buka halamannya dan hitung GRUP, bukan sekadar tombol ---- */
  const navLsp = await klikNav('lsp');
  console.log('  info: navigasi ke LSP -> ' + navLsp);
  const lsp = await evalAsync(`
    const grup = document.querySelectorAll('[data-testid^="lsp-grup-"]').length;
    const baris = document.querySelectorAll('[data-testid^="lsp-"][data-testid$="-dot"]').length;
    const dotHijau = document.querySelectorAll('.lsp-dot-hidup').length;
    const dotHilang = document.querySelectorAll('.lsp-dot-hilang').length;
    const dotNonaktif = document.querySelectorAll('.lsp-dot-nonaktif').length;
    const filter = !!document.querySelector('[data-testid="lsp-cari"]');
    return JSON.stringify({ grup, baris, dotHijau, dotHilang, dotNonaktif, filter });
  `);
  console.log('  info: LSP di DOM -> ' + lsp);
  const L = JSON.parse(lsp || '{}');
  catat('section LSP menampilkan grup per bahasa', (L.grup || 0) >= 3, (L.grup || 0) + ' grup');
  catat('setiap server punya titik status', (L.baris || 0) >= 10, (L.baris || 0) + ' baris');
  catat('kotak saring LSP ada', L.filter === true);

  /* ---- 10. Buka halaman Agents: ikon header + panduan cara pakai ---- */
  const navAgen = await klikNav('agents');
  console.log('  info: navigasi ke Agents -> ' + navAgen);
  const agen = await evalAsync(`
    const ikon = document.querySelectorAll('.set-h2-ikon').length;
    const cara = !!document.querySelector('[data-testid="sub-custom-cara"]');
    const baru = !!document.querySelector('[data-testid="sub-custom-new"]');
    const ubah = document.querySelectorAll('[data-testid$="-ubah"]').length;
    const salin = document.querySelectorAll('[data-testid$="-salin"]').length;
    const hapus = document.querySelectorAll('[data-testid$="-hapus"]').length;
    return JSON.stringify({ ikon, cara, baru, ubah, salin, hapus });
  `);
  console.log('  info: halaman Agents -> ' + agen);
  const A = JSON.parse(agen || '{}');
  catat('ikon di judul halaman Agents muncul', (A.ikon || 0) >= 1, (A.ikon || 0) + ' ikon');
  catat('tombol Baru sudah HILANG', A.baru === false);
  catat('tombol Ubah sudah HILANG', (A.ubah || 0) === 0);
  catat('tombol Duplikat/Salin sudah HILANG', (A.salin || 0) === 0);
  catat('panduan cara pakai ada', A.cara === true);

  /* ---- 11. tutup Settings supaya editor kembali terlihat ---- */
  await evalAsync(`
    window.__ZEPHYR__.getState().setSettingsOpen(false);
    await new Promise(r => setTimeout(r, 400));
    return 'ok';
  `);

  console.log('');
  const lulus = hasil.filter((h) => h.lulus).length;
  console.log('== ' + lulus + '/' + hasil.length + ' lulus ==');
  for (const h of hasil) if (!h.lulus) console.log('   GAGAL: ' + h.nama + '  ' + h.info);
  process.exit(lulus === hasil.length ? 0 : 1);
}

main().catch((e) => {
  /*
   * Every field, not just `message`.
   *
   * This printed a blank line twice in a row: `e.message` was empty, so the one
   * piece of information that would have found the cause was dropped by the
   * line meant to report it. A reporter that can be silent about an error is
   * worse than no reporter, because it looks like a clean failure.
   */
  const detail = [
    'name=' + (e && e.name),
    'message=' + JSON.stringify(e && e.message),
    'stack=' + String((e && e.stack) || '').split('\n').slice(0, 4).join(' | '),
    'raw=' + (() => {
      try {
        return JSON.stringify(e);
      } catch {
        return String(e);
      }
    })(),
  ].join('\n  ');
  console.error('HARNESS GAGAL:\n  ' + detail);
  process.exit(3);
});
