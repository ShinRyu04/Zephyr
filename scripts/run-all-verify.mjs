// run-all-verify.mjs — run every `npm run verify*` harness, one at a time, each
// in a fresh attach, with a timeout. Results go to verify-all.json.
//
// Between harnesses the app is reset through CDP: settings closed, every tab
// closed, the terminal panel hidden, and any leftover pane killed. Without this
// a harness inherits the previous one's state (an open Settings page, a dirty
// tab, a live shell) and fails on the leaked state instead of on the code. That
// is what made two runs of the same suite disagree.
// Output of every harness is streamed straight into verify-logs/<nama>.log while
// it runs, not buffered until it exits. That matters when a harness wedges: with
// spawnSync the run was a black box, a wedged harness burned the full timeout,
// and the log appeared only afterwards — with nothing in it to explain the wedge.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Cdp, sleep } from './lib-cdp.mjs';

const AKAR = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(AKAR, 'package.json'), 'utf8'));
const nama = Object.keys(pkg.scripts).filter((k) => /^verify(:|$)/.test(k)).sort();
const lewati = new Set(['verify:28']);
const DIR_LOG = path.join(AKAR, 'verify-logs');
const BATAS_MS = Number(process.env.ZEPHYR_HARNESS_BATAS_MS ?? 8 * 60 * 1000);

/**
 * Apakah app-nya masih hidup DAN sehat?
 *
 * `1+1` hanya membuktikan renderer menjawab. Yang menentukan adalah perintah Rust
 * lewat `get_diagnostics`: setelah `debug_panic` (verify:14), jendela utama bisa
 * hilang sementara halamannya masih hidup, dan setiap perintah Rust berikutnya
 * gagal dengan "internal: there is no main window".
 */
async function appSehat(cdp) {
  try {
    if ((await cdp.eval('1 + 1', 5000)) !== 2) return false;
    /*
     * Lewat runAsync, bukan eval: `eval` mengembalikan objek Promise apa adanya
     * (JSON-nya `{}`), jadi janji `get_diagnostics()` tidak pernah ditunggu dan
     * pemeriksaannya selalu melaporkan app mati.
     */
    const d = await cdp.runAsync(
      `try { await __ZEPHYR_DIAG__.get(); return 'ok'; }
       catch (e) { return 'err:' + (e && e.message ? e.message : e); }`,
      20000,
    );
    return d === 'ok';
  } catch {
    return false;
  }
}

/**
 * Bunuh app yang sudah tak sehat lalu hidupkan lagi dari peluncur yang sama.
 *
 * `explorer.exe <bat>` (bukan spawn langsung) supaya prosesnya lepas dari Job
 * Object sesi ini - app yang di-spawn langsung mati saat giliran sesi dibersihkan.
 * Kembali setelah port debug benar-benar melayani.
 */
async function mulaiUlangApp() {
  try {
    spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      "Get-Process zephyr -ErrorAction SilentlyContinue | Stop-Process -Force",
    ], { stdio: 'ignore' });
  } catch {
    /* sudah mati */
  }
  await sleep(3000);
  try {
    spawnSync('explorer.exe', [path.join(AKAR, '_dev-zephyr.bat')], { stdio: 'ignore' });
  } catch {
    /* explorer kadang mengeluh; prosesnya tetap jalan */
  }
  const batas = Date.now() + 120000;
  for (;;) {
    try {
      const r = await fetch('http://127.0.0.1:9223/json/version', { signal: AbortSignal.timeout(4000) });
      if (r.ok && (await r.text()).includes('Browser')) return true;
    } catch {
      /* belum hidup */
    }
    if (Date.now() > batas) {
      console.log('[runner] app tidak hidup kembali dalam 120s');
      return false;
    }
    await sleep(2000);
  }
}

/**
 * Put the app back to a clean slate, best effort.
 *
 * Also waits until the page is actually usable. A harness that starts while the
 * webview is still reloading fails on its first step (`__ZEPHYR__ tidak ada`, a
 * tab that never appears) and the failure looks exactly like a code regression —
 * the suite's first harness failed this way while the app was respawning its
 * language servers.
 */
async function resetApp() {
  let cdp;
  try {
    ({ cdp } = await Cdp.attach('9223'));

    /*
     * App-nya sehat? (bukan cuma halaman yang menjawab)
     *
     * `verify:14` memanggil `debug_panic` Rust; lewat jalur itu jendela utama
     * bisa hilang dan SELURUH harness sesudahnya gagal dengan "internal: there is
     * no main window", "socket CDP mati", atau eval timeout - belasan kegagalan
     * yang tampak seperti regresi kode padahal app-nya yang sudah tak sehat.
     * Karena itu kesehatan diukur lewat perintah Rust sungguhan
     * (`get_diagnostics`), bukan hanya `typeof window.__ZEPHYR__`.
     */
    if (!(await appSehat(cdp))) {
      await cdp.close();
      return false;
    }

    /*
     * Muat ulang halaman dulu, baru bersihkan sisa keadaan dari DOM.
     *
     * Menutup tab/pane lewat API store TIDAK cukup: pane terminal di pembukuan
     * sisi JS masih menunjuk sesi pty yang sudah mati, dan harness berikutnya
     * lalu gagal dengan `not found: sesi terminal pane-...` - kegagalan yang
     * lenyap kalau harness itu dijalankan sendiri, jadi tampak seperti regresi
     * kode. Reload membuang SELURUH keadaan di memori (tab, pane, sesi terminal,
     * cache grammar bahasa) sehingga tiap harness mulai dari app yang sama
     * seperti baru dibuka; pembersihan lewat store di bawah hanya jaring untuk
     * keadaan yang keburu dipulihkan dari sesi tersimpan.
     */
    try {
      if (process.env.ZEPHYR_TANPA_RELOAD !== '1') {
        /*
         * Tandai halaman LAMA sebelum reload.
         *
         * `Page.reload` hanya mengantre: halaman lama masih menjawab beberapa
         * saat, jadi pemeriksaan "sudah siap" bisa lulus terhadap halaman LAMA
         * dan harness lalu dijalankan tepat ketika reload baru commit - hasilnya
         * halaman kosong (`Cannot read properties of undefined (reading
         * 'getState')`) atau timeout di langkah pertama. Tanda ini hilang bersama
         * halaman lama, jadi menunggu ia lenyap dulu memastikan yang siap adalah
         * halaman BARU.
         */
        await cdp.eval('window.__ZR_LAMA__ = 1', 5000).catch(() => {});
        await cdp.send('Page.reload', {}, 10000);
        /*
         * Sambung ULANG setelah reload.
         *
         * Target halaman lama bisa dibuang dan socket-nya ditutup; memakai
         * socket bangkai itu untuk sisa alur reset membuat panggilan CDP
         * menggantung, dan runner lalu mati tanpa satu baris pun alasan
         * (persis yang terjadi: "unsettled top-level await" di baris loop ini).
         */
        try {
          await cdp.close();
        } catch {
          /* sudah mati */
        }
        cdp = await sambungUlang();
        await tungguMuatUlang(cdp);
      }
    } catch (e) {
      console.log(`[runner] reload gagal (${e?.message ?? e}); lanjut dari keadaan sekarang`);
    }
    await tungguSiap(cdp);

    await cdp.runAsync(`
      const st = S.getState();
      /*
       * Pastikan workspace-nya D:/Zephyr.
       *
       * Sebagian besar harness membuka berkas dari testfiles/ dan openPath
       * menolak path di luar workspace ("path outside the workspace"), jadi app
       * yang start tanpa folder terbuka membuat SELURUH harness gagal di uji
       * pertamanya - seolah kodenya rusak. Dulu itu tak terlihat karena app-nya
       * sudah lama terbuka dengan folder D:/Zephyr; begitu app di-restart,
       * kegagalannya muncul.
       */
      const ws = String(st.workspace ?? '').toLowerCase();
      if (ws !== 'd:/zephyr' && ws !== 'd:\\zephyr') {
        await st.openWorkspace('D:/Zephyr');
        await wait(1500);
      }
      const st2 = S.getState();
      st2.setSettingsOpen(false);
      st2.setActivity('explorer');
      for (const t of [...st2.tabs]) st2.forceCloseTab(t.id);
      // Panes hold a live shell each; close them so the pty count returns to 0.
      const term = window.__ZEPHYR_TERM__;
      if (term) {
        const ts = term.getState();
        for (const tab of [...ts.terminalTabs]) {
          for (const pane of [...tab.panes]) { try { ts.killPane(pane.id); } catch {} }
          try { ts.closeTab(tab.id); } catch {}
        }
        ts.setVisible(false);
      }
      S.setState({ sidebarVisible: true });
      await wait(400);
      return 'ok';
    `, 60000);
    await cdp.close();
    return true;
  } catch {
    // The app may be closed or busy; the harness will report its own failure.
    return false;
  }
}

/**
 * Kill a harness AND everything it spawned.
 *
 * A harness starts MCP servers through `npx`, so killing the node pid alone
 * leaves those children behind; taskkill /T walks the tree. It is spawned with
 * an argument array, so the `/PID` flags are not mangled the way they are inside
 * a bash command line.
 */
function bunuhPohon(pid) {
  try {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    /* sudah mati */
  }
}

/** Run one harness, streaming its output into the log file as it arrives. */
function jalankanHarness(file, lokasiLog) {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(lokasiLog), { recursive: true });
    const aliran = fs.createWriteStream(lokasiLog, { flags: 'w' });
    const anak = spawn(process.execPath, [file], { cwd: AKAR });
    let kenaBatas = false;
    anak.stdout.on('data', (b) => aliran.write(b));
    anak.stderr.on('data', (b) => aliran.write(b));
    const pengawas = setTimeout(() => {
      // The log already holds every line up to the last second, so the timeout no
      // longer destroys the evidence - it only stops a process that is stuck.
      kenaBatas = true;
      aliran.write(`\n[runner] BATAS ${Math.round(BATAS_MS / 1000)}s tercapai: harness dibunuh.\n`);
      bunuhPohon(anak.pid);
      try {
        anak.kill('SIGKILL');
      } catch {
        /* sudah mati */
      }
    }, BATAS_MS);
    anak.on('close', (kode, sinyal) => {
      clearTimeout(pengawas);
      aliran.end(() => resolve({ kode, sinyal, kenaBatas }));
    });
  });
}

/** Tunggu sampai halaman benar-benar siap menerima eval (poll, maks 90s). */
async function tungguSiap(cdp) {
  const batas = Date.now() + 90000;
  for (;;) {
    let siap = false;
    try {
      siap = await cdp.eval(
        `(() => !!(window.__ZEPHYR__?.getState?.() && document.readyState === 'complete'))()`,
        15000,
      );
    } catch {
      // Halaman sedang reload: panggilan eval-nya gagal, tunggu lalu coba lagi.
    }
    if (siap) return true;
    if (Date.now() > batas) {
      console.log('[runner] peringatan: app tidak melaporkan siap dalam 90s, lanjut saja');
      return false;
    }
    await sleep(500);
  }
}

/**
 * Jalankan janji dengan batas waktu KERAS.
 *
 * `tungguSiap` dan `Cdp` punya batas masing-masing, tetapi satu panggilan yang
 * menggantung karena socket bangkai sudah pernah membuat seluruh runner berhenti
 * dengan exit 13 tanpa satu baris alasan. Batas di level ini memastikan langkah
 * sepenting `resetApp` selalu punya akhir yang terlihat.
 */
function denganBatas(p, ms, label) {
  p.catch(() => {
    /* janji yang kalah balapan: jangan jadi unhandled rejection */
  });
  /*
   * Timer HARUS dibersihkan saat balapan selesai.
   *
   * Sebelum ini timer 300s tidak pernah di-clear, jadi tiap `resetApp` yang
   * lulus meninggalkan timer hidup yang lalu mencetak "[runner] resetApp
   * melewati batas 300s - dianggap gagal" di tengah output harness LAIN -
   * laporan palsu yang membuat orang mengira reset-nya menggantung padahal
   * sudah selesai sejak menit pertama.
   */
  let timer;
  const batas = new Promise((selesai) => {
    timer = setTimeout(() => {
      console.log(`[runner] ${label} melewati batas ${Math.round(ms / 1000)}s - dianggap gagal`);
      selesai(false);
    }, ms);
  });
  return Promise.race([p, batas]).finally(() => clearTimeout(timer));
}

/** Sambung ulang ke CDP (percobaan berulang; halaman baru butuh waktu). */
async function sambungUlang(batasMs = 20000) {
  const batas = Date.now() + batasMs;
  for (;;) {
    try {
      const { cdp } = await Cdp.attach('9223');
      return cdp;
    } catch {
      /* halaman belum siap menerima koneksi */
    }
    if (Date.now() > batas) throw new Error('tidak bisa menyambung ulang ke CDP setelah reload');
    await sleep(500);
  }
}

/**
 * Tunggu sampai reload BENAR-BENAR selesai: halaman lama hilang, halaman baru siap.
 *
 * Tanpa fase pertama, `tungguSiap` bisa lulus terhadap halaman lama yang masih
 * menjawab, lalu harness dijalankan tepat ketika reload baru commit.
 */
async function tungguMuatUlang(cdp) {
  const batasHilang = Date.now() + 30000;
  for (;;) {
    let masihAda = false;
    try {
      masihAda = (await cdp.eval('typeof window.__ZR_LAMA__ !== "undefined"', 8000)) === true;
    } catch {
      masihAda = false; // eval gagal = konteks lama sudah tidak ada
    }
    if (!masihAda) break;
    if (Date.now() > batasHilang) {
      console.log('[runner] peringatan: halaman lama masih menjawab 30s setelah reload');
      break;
    }
    await sleep(300);
  }
  const siap = await tungguSiap(cdp);
  await sleep(400); // beri satu detik lagi untuk efek samping boot (workspace, sesi)
  return siap;
}

const hasil = [];
for (const k of nama) {
  if (lewati.has(k)) { hasil.push({ nama: k, status: 'SKIP' }); console.log(`SKIP  ${k}`); continue; }
  if (!(await denganBatas(resetApp(), 300000, 'resetApp'))) {
    /*
     * App tak sehat (jendela utama hilang setelah verify:14, atau socket CDP
     * mati). Hidupkan lagi dari peluncur sebelum menyalahkan harness-nya:
     * tanpa ini satu app yang rusak menghasilkan belasan FAIL yang tampak
     * seperti regresi kode.
     */
    console.log(`RESTART ${k.padEnd(16)} app tidak sehat -> dihidupkan lagi`);
    if (await denganBatas(mulaiUlangApp(), 300000, 'mulaiUlangApp')) {
      await denganBatas(resetApp(), 300000, 'resetApp(sesudah restart)');
    }
  }
  const arg = pkg.scripts[k].replace(/^node\s+/, '');
  const lokasiLog = path.join(DIR_LOG, `${k.replace(':', '-')}.log`);
  const t0 = Date.now();
  console.log(`RUN   ${k.padEnd(16)} -> ${path.relative(AKAR, lokasiLog)}`);
  const r = await jalankanHarness(path.join(AKAR, arg), lokasiLog);
  const ms = Date.now() - t0;
  const out = fs.existsSync(lokasiLog) ? fs.readFileSync(lokasiLog, 'utf8') : '';
  const m = out.match(/==\s*(\d+)\/(\d+)\s*lulus\s*==/);
  const kode = r.kenaBatas ? `BATAS(${Math.round(BATAS_MS / 1000)}s)` : r.kode;
  const status = !r.kenaBatas && r.kode === 0 ? 'PASS' : 'FAIL';

  /*
   * Simpan output tiap harness ke berkas.
   *
   * Dulu runner membuangnya dan hanya mencetak PASS/FAIL + tally, jadi satu FAIL
   * memaksa orang menjalankan ulang harness itu sendiri untuk tahu apa yang
   * gagal - dan bila kegagalannya bergantung urutan (state sisa dari harness
   * sebelumnya), menjalankannya sendiri malah lulus dan jejaknya hilang. Berkas
   * ini menyimpan bukti dari run yang benar-benar gagal.
   */
  const ringkas = status === 'FAIL'
    ? out.split(String.fromCharCode(10)).map((l) => l.trim()).filter((l) => /^GAGAL|error:|^Error|EXIT=|\[runner\]/.test(l)).slice(0, 4)
    : [];

  hasil.push({ nama: k, status, exit: r.kode, batas: r.kenaBatas || undefined, ms, tally: m ? m[0] : null, log: path.relative(AKAR, lokasiLog), ringkas });
  console.log(`${status === 'PASS' ? 'PASS' : 'FAIL'}  ${k.padEnd(16)} exit=${kode} ${(ms / 1000).toFixed(0)}s ${m ? m[0] : ''}`);
}

const lulus = hasil.filter((h) => h.status === 'PASS').length;
const gagal = hasil.filter((h) => h.status === 'FAIL');
console.log(`\nPASS=${lulus} FAIL=${gagal.length} SKIP=${hasil.filter((h) => h.status === 'SKIP').length} TOTAL=${hasil.length}`);
for (const h of gagal) {
  console.log(`  FAIL ${h.nama} ${h.tally || '(tanpa tally)'}  -> ${h.log ?? ''}`);
  for (const l of h.ringkas ?? []) console.log(`       ${l}`);
}
fs.writeFileSync(path.join(AKAR, 'verify-all.json'), JSON.stringify(hasil, null, 2));
process.exitCode = gagal.length ? 1 : 0;

