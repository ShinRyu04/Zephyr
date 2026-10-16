/*
 * Verify the Agents-window features added on top of the 3-column layout:
 * the Changes list (flat, with +N/-N line counts), the closable tab set with
 * `+` and `…` menus, the collapsible Customizations block, and maximise.
 *
 * Assertions are on the RENDERED DOM, because that is what a reader sees. An
 * empty Changes list would pass a "the element exists" check.
 */
import CDP from 'chrome-remote-interface';

const PORT = Number(process.argv[2] || 9223);
const hasil = [];
const check = (nama, lulus, detail = '') => {
  hasil.push({ nama, lulus });
  console.log(`${lulus ? 'PASS' : 'FAIL'}  ${nama}${detail ? ` — ${detail}` : ''}`);
};

async function runAsync(Runtime, expr, timeoutMs = 10000) {
  const key = `__f_${Math.random().toString(36).slice(2)}`;
  await Runtime.evaluate({
    expression:
      `window.${key} = undefined;(async () => {\n${expr}\n})().then(` +
      `function(v){ window.${key} = JSON.stringify({__ok: v}); },` +
      `function(e){ window.${key} = JSON.stringify({__err: String((e && e.stack) || e)}); });`,
    returnByValue: true,
  });
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await Runtime.evaluate({ expression: `window.${key}`, returnByValue: true });
    const v = r.result?.value;
    if (typeof v === 'string') {
      await Runtime.evaluate({ expression: `delete window.${key}` });
      try {
        const p = JSON.parse(v);
        return p.__err !== undefined ? { __err: p.__err } : p.__ok;
      } catch {
        return { __err: v.slice(0, 200) };
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { __err: 'timeout' };
}

const targets = await CDP.List({ port: PORT });
const ag = targets.find((t) => t.type === 'page' && t.url.includes('#agents'));
if (!ag) {
  console.error('Window #agents tidak terbuka.');
  process.exit(1);
}
const c = await CDP({ port: PORT, target: ag });
const { Runtime } = c;
await Runtime.enable();

/* ── Changes: a flat list with real line counts ───────────────────────── */

const ch = await runAsync(Runtime, `
  const tab = document.querySelector('[data-testid="ag-tab-changes"]');
  tab.click();
  await new Promise((r) => setTimeout(r, 1500));
  /* .ag-changes-row, not [data-testid^="ag-changes-"]: that prefix also
     matches the refresh BUTTON in the header, which has no name or counts and
     made the row assertions fail against a control. */
  const rows = Array.from(document.querySelectorAll('.ag-changes-row'));
  const sampel = rows.slice(0, 5).map((r) => ({
    teks: r.innerText.replace(/\\n/g, ' ').trim(),
    plus: r.querySelector('.ag-plus')?.textContent ?? null,
    minus: r.querySelector('.ag-minus')?.textContent ?? null,
    kode: r.querySelector('.ag-changes-kode')?.textContent ?? null,
  }));
  return { jumlah: rows.length, sampel };
`);
check('Changes merender daftar file', (ch?.jumlah ?? 0) > 0, `${ch?.jumlah} baris`);
console.log('    contoh:', JSON.stringify(ch?.sampel ?? []));

/* The whole point of the new panel: line counts, which `git status` lacks.
   A DELETED file legitimately has no counts, so this looks for at least one
   row that HAS them rather than demanding counts on every row. */
const adaAngka = (ch?.sampel ?? []).some((r) => r.plus || r.minus);
check('baris Changes menampilkan hitungan baris (+N/-N)', adaAngka, JSON.stringify(ch?.sampel ?? []));
const adaKode = (ch?.sampel ?? []).length > 0 && (ch?.sampel ?? []).every((r) => r.kode);
check('tiap baris punya kode status (M/A/D)', adaKode);

/* ── Customizations collapse ──────────────────────────────────────────── */

const cust = await runAsync(Runtime, `
  const toggle = document.querySelector('[data-testid="ag-cust-toggle"]');
  const sebelum = document.querySelectorAll('[data-testid^="ag-cust-"]').length;
  toggle.click();
  await new Promise((r) => setTimeout(r, 400));
  const setelahTutup = {
    jumlah: document.querySelectorAll('[data-testid^="ag-cust-"]').length,
    expanded: toggle.getAttribute('aria-expanded'),
    adaJudul: !!document.querySelector('.ag-cust-judul'),
  };
  toggle.click();
  await new Promise((r) => setTimeout(r, 400));
  const setelahBuka = document.querySelectorAll('[data-testid^="ag-cust-"]').length;
  return { sebelum, setelahTutup, setelahBuka };
`);
check(
  'Customizations bisa di-collapse dan dibuka lagi',
  cust?.setelahTutup?.expanded === 'false' && (cust?.setelahBuka ?? 0) > (cust?.setelahTutup?.jumlah ?? 0),
  JSON.stringify(cust),
);
check(
  'judul Customizations tetap tampil saat tertutup',
  cust?.setelahTutup?.adaJudul === true,
);

/* ── Tab set: `+` opens Search as a closable tab ──────────────────────── */

const tab = await runAsync(Runtime, `
  document.querySelector('[data-testid="ag-tab-plus"]').click();
  await new Promise((r) => setTimeout(r, 300));
  const menu = !!document.querySelector('[data-testid="ag-menu-plus"]');
  document.querySelector('[data-testid="ag-open-search"]').click();
  await new Promise((r) => setTimeout(r, 1200));
  const adaSearch = !!document.querySelector('[data-testid="ag-tab-search"]');
  const adaClose = !!document.querySelector('[data-testid="ag-tab-close-search"]');
  document.querySelector('[data-testid="ag-tab-close-search"]').click();
  await new Promise((r) => setTimeout(r, 500));
  return {
    menu, adaSearch, adaClose,
    setelahTutup: !!document.querySelector('[data-testid="ag-tab-search"]'),
    changesTetap: !!document.querySelector('[data-testid="ag-tab-changes"]'),
  };
`);
check('tombol + membuka menu', tab?.menu === true);
check('menu + membuka tab Search', tab?.adaSearch === true);
check('tab Search punya tombol tutup', tab?.adaClose === true);
check('tab Search bisa ditutup', tab?.setelahTutup === false);
check('tab Changes (pinned) tetap ada setelah menutup tab lain', tab?.changesTetap === true);

/* ── `…` menu: ONLY on Search and Browser, NEVER on Changes/Files ─────── */

const titik = await runAsync(Runtime, `
  document.querySelector('[data-testid="ag-tab-changes"]').click();
  await new Promise((r) => setTimeout(r, 200));
  const diChanges = !!document.querySelector('[data-testid="ag-tab-more"]');

  document.querySelector('[data-testid="ag-tab-files"]').click();
  await new Promise((r) => setTimeout(r, 200));
  const diFiles = !!document.querySelector('[data-testid="ag-tab-more"]');

  /* Buka Search lewat `+` menu untuk cek titik tiga muncul di sana */
  document.querySelector('[data-testid="ag-tab-plus"]').click();
  await new Promise((r) => setTimeout(r, 200));
  document.querySelector('[data-testid="ag-open-search"]').click();
  await new Promise((r) => setTimeout(r, 300));

  const diSearch = !!document.querySelector('[data-testid="ag-tab-more"]');
  document.querySelector('[data-testid="ag-tab-more"]')?.click();
  await new Promise((r) => setTimeout(r, 200));
  const adaClose = !!document.querySelector('[data-testid="ag-close-view"]');

  /* Tutup Search lewat menu titik */
  document.querySelector('[data-testid="ag-close-view"]')?.click();
  await new Promise((r) => setTimeout(r, 200));

  return { diChanges, diFiles, diSearch, adaClose };
`);
check('menu … TIDAK muncul di tab Changes', titik?.diChanges === false);
check('menu … TIDAK muncul di tab Files', titik?.diFiles === false);
check('menu … MUNCUL di tab Search dengan opsi Close', titik?.diSearch === true && titik?.adaClose === true);

/* ── Maximise hides both side columns ─────────────────────────────────── */

const maks = await runAsync(Runtime, `
  const btn = document.querySelector('[data-testid="ag-maximize"]');
  btn.click();
  await new Promise((r) => setTimeout(r, 500));
  const saatMaks = {
    kiri: !!document.querySelector('[data-testid="agents-left"]'),
    kanan: !!document.querySelector('[data-testid="agents-right"]'),
    pressed: btn.getAttribute('aria-pressed'),
  };
  btn.click();
  await new Promise((r) => setTimeout(r, 500));
  return {
    saatMaks,
    setelah: {
      kiri: !!document.querySelector('[data-testid="agents-left"]'),
      kanan: !!document.querySelector('[data-testid="agents-right"]'),
    },
  };
`);
check(
  'maximize menyembunyikan kedua kolom samping',
  maks?.saatMaks?.kiri === false && maks?.saatMaks?.kanan === false && maks?.saatMaks?.pressed === 'true',
  JSON.stringify(maks?.saatMaks),
);
check('restore mengembalikan kedua kolom', maks?.setelah?.kiri === true && maks?.setelah?.kanan === true);

await c.close();

const lulus = hasil.filter((h) => h.lulus).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
process.exit(lulus === hasil.length ? 0 : 1);
