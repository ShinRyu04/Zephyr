/*
 * Verifikasi jendela Agents: Start here, enam kartu, Ctrl+Alt+B, isi tiap tab.
 * Membaca DOM dan store yang hidup lewat CDP.
 */
import * as Cdp from '../scripts/lib-cdp.mjs';

/* Jendela agents punya judul yang SAMA dengan jendela utama; pembedanya
   `#agents` di URL. Jadi ambil daftar target dan sambung ke yang ber-hash. */
const daftar = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
if (!target) {
  console.log('GAGAL: jendela agents tidak terbuka');
  process.exit(1);
}
const cdp = await Cdp.Cdp.connect(target.webSocketDebuggerUrl);
const { check, selesai } = Cdp.reporter('agents');
const URL_HALAMAN = await cdp.eval('location.href');

if (!String(URL_HALAMAN).includes('#agents')) {
  console.log('BUKAN jendela agents:', URL_HALAMAN);
  process.exitCode = 1;
  cdp.close();
} else {
  /* ── V1: kolom kanan membuka "Start here" ───────────────────────────── */
  const v1 = await cdp.json(`return JSON.stringify(await (async () => {
    const X = window.__ZEPHYR_AI__;
    /* Beri pesan supaya kolom kanan hidup (ia mengikuti isi percakapan). */
    const st = X.store.getState();
    if (!st.sessions.some(s => s.id === st.activeIds['agents'])) st.newChat('');
    await wait(300);
    /* Interaksi sebelumnya meninggalkan tab terbuka; tutup semua dulu supaya
       kolom kembali ke layar pertama (perilaku yang memang diuji di V9). */
    for (const b of qa('[data-testid^="ag-tab-close-"]')) b.click();
    await wait(400);
    for (let i = 0; i < 40 && !q('[data-testid="ag-start-here"]'); i++) await wait(100);
    const k = qa('[data-testid^="ag-start-"]').map(e => e.getAttribute('data-testid')).filter(x => x !== 'ag-start-here');
    return { ada: !!q('[data-testid="ag-start-here"]'), judul: q('.ag-start-judul')?.textContent ?? '', kartu: k };
  })())`);

  check('V1', v1.ada && v1.judul.includes('Start here'), `Start here: ${v1.ada} · "${v1.judul}"`);
  const HARAP = ['ag-start-files', 'ag-start-task', 'ag-start-sidechat', 'ag-start-browser', 'ag-start-terminal', 'ag-start-diff'];
  check('V2', HARAP.every((h) => v1.kartu.includes(h)), `6 kartu: ${v1.kartu.join(', ')}`);

  /* ── V3..V8: setiap kartu membuka tab yang benar ─────────────────────── */
  const pasangan = [
    ['ag-start-files', 'files', '[data-testid="ag-files"]'],
    ['ag-start-task', 'task', '[data-testid="ag-task"]'],
    ['ag-start-sidechat', 'sidechat', '[data-testid="ag-sidechat"]'],
    ['ag-start-browser', 'browser', '[data-testid="ag-browser"]'],
    ['ag-start-terminal', 'terminal', '[data-testid="ag-terminal"]'],
    ['ag-start-diff', 'diff', '[data-testid="ag-diff"], [data-testid="ag-diff-empty"]'],
  ];
  for (const [i, [kartu, tab, sel]] of pasangan.entries()) {
    const r = await cdp.json(`return JSON.stringify(await (async () => {
      /* Back to the first screen so the next card exists in the DOM. */
      for (const b of qa('[data-testid^="ag-tab-close-"]')) b.click();
      await wait(350);
      for (let i = 0; i < 30 && !q('[data-testid="${kartu}"]'); i++) await wait(100);
      const k = q('[data-testid="${kartu}"]');
      if (!k) return { klik: false };
      k.click();
      await wait(700);
      for (let i = 0; i < 40 && !q('${sel}'); i++) await wait(100);
      return {
        klik: true,
        tabAktif: q('.ag-tab.is-aktif')?.getAttribute('data-testid') ?? '',
        isi: !!q('${sel}'),
        teks: (q('${sel}')?.textContent ?? '').slice(0, 90),
      };
    })())`);
    check(
      `V${3 + i}`,
      r.klik && r.isi && r.tabAktif === `ag-tab-${tab}`,
      `${kartu} -> ${r.tabAktif} (isi ${r.isi}) ${String(r.teks ?? '').replace(/\s+/g, ' ').trim()}`,
    );
  }

  /* ── V9: tutup semua tab -> balik ke Start here ──────────────────────── */
  const v9 = await cdp.json(`return JSON.stringify(await (async () => {
    for (const b of qa('[data-testid^="ag-tab-close-"]')) b.click();
    await wait(500);
    return { mulai: !!q('[data-testid="ag-start-here"]'), tab: qa('.ag-tab').length };
  })())`);
  check('V9', v9.mulai && v9.tab === 0, `tutup semua: Start here ${v9.mulai}, tab ${v9.tab}`);

  /* ── V10: Ctrl+Alt+B menutup & membuka kolom kanan ───────────────────── */
  const v10 = await cdp.json(`return JSON.stringify(await (async () => {
    const kirim = (tipe, ekstra = {}) =>
      window.dispatchEvent(new KeyboardEvent(tipe, { key: 'b', code: 'KeyB', ctrlKey: true, altKey: true, bubbles: true, ...ekstra }));
    const awal = !!q('[data-testid="agents-right"]');
    kirim('keydown'); kirim('keyup');
    await wait(400);
    const setelah = !!q('[data-testid="agents-right"]');
    kirim('keydown'); kirim('keyup');
    await wait(400);
    const kembali = !!q('[data-testid="agents-right"]');
    return { awal, setelah, kembali };
  })())`);
  check('V10', v10.awal && !v10.setelah && v10.kembali, `kanan: ${v10.awal} -> ${v10.setelah} -> ${v10.kembali}`);

  /* ── V11: tab Task Summary punya Todo + Context ──────────────────────── */
  const v11 = await cdp.json(`return JSON.stringify(await (async () => {
    q('[data-testid="ag-tab-plus"]')?.click();
    await wait(150);
    q('[data-testid="ag-open-task"]')?.click();
    await wait(500);
    for (let i = 0; i < 30 && !q('[data-testid="ag-task"]'); i++) await wait(100);
    return {
      todo: q('[data-testid="ag-task-todo"]')?.innerText ?? '',
      ctx: q('[data-testid="ag-task-context"]')?.innerText ?? '',
    };
  })())`);
  check('V11', /Todo/.test(v11.todo) && /Context/.test(v11.ctx) && /%/.test(v11.ctx), `todo: ${String(v11.todo).replace(/\s+/g, ' ').slice(0, 70)} | ctx: ${String(v11.ctx).replace(/\s+/g, ' ').slice(0, 90)}`);
}

cdp.close();
selesai();
