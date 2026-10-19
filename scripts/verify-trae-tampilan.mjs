/*
 * Bukti: tampilan ala TRAE untuk AI Models, Skills & Commands, Conversations,
 * dan filter Extensions.
 *
 *   A1  AI Models: tiap baris model punya LOGO provider (bukan teks saja)
 *   A2  AI Models: grup Built-in dan Custom bisa dilipat
 *   A3  AI Models: tidak ada tombol "Manage" kedua di header
 *   A4  AI Models: baris provider bisa dibuka dan berisi field API key
 *   A5  Add Model: grid 2 kolom dengan logo tiap provider
 *   A6  Add Model: ada tile "Custom endpoint"
 *
 *   S1  Skills & Commands: rail kiri dengan Skills dan Commands
 *   S2  daftar skill memakai baris ramping dengan aksi per baris
 *   S3  tab Commands menampilkan command NYATA dari registry
 *   S4  kotak cari menyaring skill
 *
 *   C1  Conversations: dua kolom (daftar kiri, detail kanan)
 *   C2  memilih percakapan menampilkan transkripnya di kanan
 *   C3  tombol Open memilih sesi itu di chat
 *
 *   F1  Extensions: chip filter berasal dari data (bukan regex karangan)
 *   F2  tiap chip yang bisa diklik menghasilkan baris (tidak mengosongkan)
 *   F3  chip "All" mengembalikan seluruh daftar
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

async function J(expr, ms = 60000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  const raw = await cdp.runAsync(badan, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function mount(id, path) {
  const slot = '__UJI_' + id.replace(/[^a-zA-Z0-9]/g, '_') + '__';
  const ok = slot + 'OK__';
  await cdp.eval(
    `(() => {
    const lama = document.getElementById(${JSON.stringify(id)});
    if (lama) lama.remove();
    const host = document.createElement('div');
    host.id = ${JSON.stringify(id)};
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--bg,#111);padding:18px';
    document.body.appendChild(host);
    window[${JSON.stringify(slot)}] = null;
    window[${JSON.stringify(ok)}] = false;
    (async () => {
      try {
        const R = (await import('/node_modules/.vite/deps/react.js')).default;
        const D = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
        const mod = await import(${JSON.stringify(path)});
        const root = D.createRoot(host);
        root.render(R.createElement(mod.default));
        window[${JSON.stringify(slot)}] = root;
        window[${JSON.stringify(ok)}] = true;
      } catch (e) {
        window[${JSON.stringify(ok)}] = 'GAGAL: ' + String(e);
      }
    })();
    return 'mulai';
  })()`,
  );
  await new Promise((r) => setTimeout(r, 2500));
  return cdp.eval(`window[${JSON.stringify(ok)}]`);
}

async function unmount(id) {
  const slot = '__UJI_' + id.replace(/[^a-zA-Z0-9]/g, '_') + '__';
  await cdp.eval(
    `(() => {
    try { window[${JSON.stringify(slot)}]?.unmount(); } catch (e) {}
    const h = document.getElementById(${JSON.stringify(id)});
    if (h) h.remove();
    return 'ok';
  })()`,
  );
  await new Promise((r) => setTimeout(r, 300));
}

const klik = (sel) =>
  cdp.eval(
    `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.click(); return !!b; })()`,
  );

const out = {};

/* ── A: AI Models ───────────────────────────────────────────────────────── */
out.mountModels = await mount('uji-m', '/src/components/settings/AiModelsPage.tsx');

const a = await J(`(() => {
  const p = document.querySelector('#uji-m [data-testid="aim-page"]');
  const baris = p ? [...p.querySelectorAll('[data-testid="aim-table-row"]')] : [];
  return {
    ada: !!p,
    baris: baris.length,
    denganLogo: baris.filter((r) => r.querySelector('.aim-logo svg')).length,
    adaGrupBuiltin: !!p?.querySelector('[data-testid="aim-grup-builtin"]'),
    adaGrupCustom: !!p?.querySelector('[data-testid="aim-grup-custom"]'),
    adaManageKedua: !!p?.querySelector('[data-testid="aim-kunci"]'),
    adaTambah: !!p?.querySelector('[data-testid="aim-tambah"]'),
  };
})()`);
out.a = typeof a === 'string' ? JSON.parse(a) : a;

/* A2: collapse Built-in. */
await klik('#uji-m [data-testid="aim-grup-builtin"]');
await new Promise((r) => setTimeout(r, 700));
const a2 = await J(`(() => {
  const p = document.querySelector('#uji-m [data-testid="aim-page"]');
  return {
    adaIsiBuiltin: !!p?.querySelector('[data-testid="aim-grup-builtin-isi"]'),
    baris: p ? p.querySelectorAll('[data-testid="aim-table-row"]').length : 0,
  };
})()`);
out.a2 = typeof a2 === 'string' ? JSON.parse(a2) : a2;
await klik('#uji-m [data-testid="aim-grup-builtin"]');
await new Promise((r) => setTimeout(r, 600));

/* A4: expand a provider row. */
await klik('#uji-m [data-testid="aim-prov-buka-gemini"]');
await new Promise((r) => setTimeout(r, 800));
const a4 = await J(`(() => {
  const k = document.querySelector('#uji-m [data-testid="aim-key-gemini"]');
  return {
    adaPanelKey: !!k,
    adaInputKey: !!k?.querySelector('[data-testid="aim-key-input-gemini"]'),
    adaInputUrl: !!k?.querySelector('[data-testid="aim-key-url-gemini"]'),
  };
})()`);
out.a4 = typeof a4 === 'string' ? JSON.parse(a4) : a4;

/* A5/A6: Add Model. */
await klik('#uji-m [data-testid="aim-tambah"]');
await new Promise((r) => setTimeout(r, 900));
const a5 = await J(`(() => {
  const d = document.querySelector('#uji-m [data-testid="aim-add-modal"]');
  const tiles = d ? [...d.querySelectorAll('[data-testid^="aim-preset-"]')] : [];
  const grid = d?.querySelector('[data-testid="aim-preset-grid"]');
  const kolom = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
  return {
    adaGrid: !!grid,
    tile: tiles.length,
    denganLogo: tiles.filter((t) => t.querySelector('.aim-preset-logo svg')).length,
    kolom,
    adaCustom: !!d?.querySelector('[data-testid="aim-preset-custom"]'),
  };
})()`);
out.a5 = typeof a5 === 'string' ? JSON.parse(a5) : a5;
await unmount('uji-m');

/* ── S: Skills & Commands ───────────────────────────────────────────────── */
out.mountSkc = await mount('uji-skc', '/src/components/settings/AgcSkills.tsx');

const s = await J(`(() => {
  const p = document.querySelector('#uji-skc [data-testid="agx-skills"]');
  return {
    ada: !!p,
    rail: !!p?.querySelector('.skc-rail'),
    tabSkills: !!p?.querySelector('[data-testid="agx-skc-skills"]'),
    tabCommands: !!p?.querySelector('[data-testid="agx-skc-commands"]'),
    baris: p ? p.querySelectorAll('[data-testid^="agx-skill-"]').length : 0,
    adaCari: !!p?.querySelector('[data-testid="agx-skills-cari"]'),
  };
})()`);
out.s = typeof s === 'string' ? JSON.parse(s) : s;

await klik('#uji-skc [data-testid="agx-skc-commands"]');
await new Promise((r) => setTimeout(r, 800));
const s3 = await J(`(() => {
  const p = document.querySelector('#uji-skc [data-testid="agx-skills"]');
  const baris = p ? [...p.querySelectorAll('[data-testid^="agx-cmd-"]')] : [];
  return {
    baris: baris.length,
    contoh: baris.slice(0, 4).map((b) => b.getAttribute('data-testid').replace('agx-cmd-', '')),
  };
})()`);
out.s3 = typeof s3 === 'string' ? JSON.parse(s3) : s3;

/* S4: search. */
await klik('#uji-skc [data-testid="agx-skc-skills"]');
await new Promise((r) => setTimeout(r, 600));
const sebelumCari = await J(`(() => ({
  n: document.querySelector('#uji-skc [data-testid="agx-skills"]').querySelectorAll('[data-testid^="agx-skill-"]').length,
}))()`);
out.sebelumCari = typeof sebelumCari === 'string' ? JSON.parse(sebelumCari) : sebelumCari;

await cdp.eval(
  `(() => {
  const i = document.querySelector('#uji-skc [data-testid="agx-skills-cari"]');
  if (!i) return 'no';
  const st = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  st.call(i, 'zzz-tidak-ada');
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 700));
const sesudahCari = await J(`(() => {
  const p = document.querySelector('#uji-skc [data-testid="agx-skills"]');
  return {
    n: p.querySelectorAll('[data-testid^="agx-skill-"]').length,
    kosong: !!p.querySelector('[data-testid="agx-skills-kosong"]'),
  };
})()`);
out.sesudahCari = typeof sesudahCari === 'string' ? JSON.parse(sesudahCari) : sesudahCari;
await unmount('uji-skc');

/* ── C: Conversations ───────────────────────────────────────────────────── */
out.mountConv = await mount('uji-c', '/src/components/settings/AgcConversations.tsx');

const c = await J(`(() => {
  const p = document.querySelector('#uji-c [data-testid="agx-conv"]');
  const grid = p?.querySelector('.conv-grid');
  const kolom = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
  const item = p ? [...p.querySelectorAll('.conv-item')] : [];
  return {
    ada: !!p,
    kolom,
    item: item.length,
    adaDetail: !!p?.querySelector('[data-testid="agx-conv-detail"]'),
    adaIsi: !!p?.querySelector('[data-testid="agx-conv-isi"]'),
  };
})()`);
out.c = typeof c === 'string' ? JSON.parse(c) : c;

/*
 * C2: pick a conversation that actually HAS messages.
 *
 * The app's real session store may hold one empty session on a fresh profile, so
 * clicking row 0 proves nothing. Selecting a session WITH content is the case the
 * detail pane exists for — and it is the one that was broken.
 */
await cdp.eval(
  `(() => {
  const ai = window.__ZEPHYR_AI__?.store?.getState?.() ?? window.__ZEPHYR__.getState();
  const semua = (ai.sessions ?? []).filter((s) => (s.messages ?? []).length > 0);
  const target = semua[0];
  if (!target) return 'tidak-ada-sesi-berisi';
  const items = [...document.querySelectorAll('#uji-c .conv-item')];
  const cocok = items.find((b) => (b.getAttribute('data-testid') || '').includes(target.id));
  if (cocok) cocok.click();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 900));

const c2 = await J(`(() => {
  const d = document.querySelector('#uji-c [data-testid="agx-conv-detail"]');
  return {
    adaJudul: !!d?.querySelector('.conv-detail-judul'),
    pesan: d ? d.querySelectorAll('.conv-pesan').length : 0,
    adaOpen: !!d?.querySelector('[data-testid^="agx-conv-buka-"]'),
  };
})()`);
out.c2 = typeof c2 === 'string' ? JSON.parse(c2) : c2;
await unmount('uji-c');

/* ── F: Extensions filter ───────────────────────────────────────────────── */
out.mountExt = await mount('uji-e', '/src/components/extensions/ExtensionsView.tsx');

/* Tab Extensions (id marketplace) = daftar terpanjang, paling menguji filter. */
await klik('#uji-e [data-testid="ext-tab-marketplace"]');
await new Promise((r) => setTimeout(r, 1400));

const f1 = await J(`(() => {
  const p = document.querySelector('#uji-e [data-testid="extensions-view"]');
  const chips = p ? [...p.querySelectorAll('[data-testid^="xmkt-chip-"]')] : [];
  return {
    adaGrid: !!p?.querySelector('[data-testid="xmkt-grid"]'),
    kartu: p ? p.querySelectorAll('.xmkt-kartu').length : 0,
    chip: chips.map((c) => c.getAttribute('data-testid').replace('xmkt-chip-', '')),
  };
})()`);
out.f1 = typeof f1 === 'string' ? JSON.parse(f1) : f1;

/* F2: click each chip and record how many rows survive. */
const hasilChip = [];
for (const id of (out.f1?.chip ?? []).slice(0, 8)) {
  await cdp.eval(
    `(() => {
    const b = document.querySelector('#uji-e [data-testid="xmkt-chip-${id}"]');
    if (b) b.click();
    return 'ok';
  })()`,
  );
  await new Promise((r) => setTimeout(r, 700));
  const n = await J(`(() => {
    const p = document.querySelector('#uji-e [data-testid="extensions-view"]');
    return { n: p ? p.querySelectorAll('.xmkt-kartu').length : 0 };
  })()`);
  hasilChip.push({ id, n: (typeof n === 'string' ? JSON.parse(n) : n).n });
}
out.hasilChip = hasilChip;

/* F3: back to All. */
await cdp.eval(
  `(() => {
  const b = document.querySelector('#uji-e [data-testid="xmkt-chip-__semua"]');
  if (b) b.click();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 700));
const f3 = await J(`(() => {
  const p = document.querySelector('#uji-e [data-testid="extensions-view"]');
  return { n: p ? p.querySelectorAll('.xmkt-kartu').length : 0 };
})()`);
out.f3 = typeof f3 === 'string' ? JSON.parse(f3) : f3;
await unmount('uji-e');

console.log(JSON.stringify(out, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

const kosongChip = (out.hasilChip ?? []).filter((h) => h.n === 0);

console.log('\nBukti — AI Models ala TRAE:');
cek(
  'A1 tiap baris model punya LOGO provider',
  out.mountModels === true && (out.a?.denganLogo ?? 0) > 0 && out.a?.denganLogo === out.a?.baris,
  `logo=${out.a?.denganLogo}/${out.a?.baris}`,
);
cek('A2 grup Built-in/Custom bisa dilipat', out.a2?.adaIsiBuiltin === false, `baris tersisa=${out.a2?.baris}`);
cek('A3 tidak ada tombol Manage kedua', out.a?.adaManageKedua === false, '');
cek(
  'A4 baris provider berisi field API key + Base URL',
  out.a4?.adaPanelKey === true && out.a4?.adaInputKey === true && out.a4?.adaInputUrl === true,
  '',
);
cek(
  'A5 Add Model: grid dengan logo tiap provider',
  out.a5?.adaGrid === true && (out.a5?.denganLogo ?? 0) >= 8 && (out.a5?.kolom ?? 0) >= 2,
  `tile=${out.a5?.tile} logo=${out.a5?.denganLogo} kolom=${out.a5?.kolom}`,
);
cek('A6 ada tile Custom endpoint', out.a5?.adaCustom === true, '');

console.log('\nBukti — Skills & Commands ala TRAE:');
cek(
  'S1 rail kiri dengan Skills + Commands',
  out.mountSkc === true && out.s?.rail === true && out.s?.tabSkills === true && out.s?.tabCommands === true,
  '',
);
cek('S2 daftar skill memakai baris dengan aksi', (out.s?.baris ?? 0) > 0, `baris=${out.s?.baris}`);
cek(
  'S3 tab Commands menampilkan command nyata',
  (out.s3?.baris ?? 0) > 20,
  `${out.s3?.baris} command, contoh: ${(out.s3?.contoh ?? []).join(', ')}`,
);
cek(
  'S4 kotak cari menyaring skill',
  (out.sesudahCari?.n ?? -1) === 0 && out.sesudahCari?.kosong === true,
  `${out.sebelumCari?.n} -> ${out.sesudahCari?.n}`,
);

console.log('\nBukti — Conversations ala TRAE:');
cek(
  'C1 dua kolom: daftar kiri + detail kanan',
  out.mountConv === true && (out.c?.kolom ?? 0) >= 2 && out.c?.adaDetail === true,
  `kolom=${out.c?.kolom} item=${out.c?.item}`,
);
cek(
  'C2 memilih percakapan menampilkan transkripnya',
  out.c2?.adaJudul === true && (out.c2?.pesan ?? 0) > 0,
  `pesan=${out.c2?.pesan}`,
);
cek('C3 tombol Open ada di detail', out.c2?.adaOpen === true, '');

console.log('\nBukti — filter Extensions:');
cek(
  'F1 chip filter berasal dari data',
  out.mountExt === true && (out.f1?.chip ?? []).length >= 3,
  `${(out.f1?.chip ?? []).length} chip: ${(out.f1?.chip ?? []).slice(0, 6).join(', ')}`,
);
cek(
  'F2 setiap chip yang diklik menghasilkan baris',
  kosongChip.length === 0,
  (out.hasilChip ?? []).map((h) => `${h.id}=${h.n}`).join(' '),
);
cek(
  'F3 chip All mengembalikan seluruh daftar',
  (out.f3?.n ?? 0) === (out.f1?.kartu ?? -1),
  `${out.f1?.kartu} -> ${out.f3?.n}`,
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
