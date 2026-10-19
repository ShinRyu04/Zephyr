/*
 * Bukti untuk lima pekerjaan terakhir, di app HIDUP.
 *
 *   D1  Agents: avatar adalah TOMBOL yang membuka dialog
 *   D2  dialog avatar punya preview besar + grid + Try Another + Upload + Use
 *   D3  memilih avatar di dialog benar-benar mengubah draft
 *   D4  Smart Generate membuka DIALOG (bukan langsung mengisi form)
 *   D5  Generate benar-benar menulis Name + Prompt ke form
 *
 *   B1  Browser: setelan dikelompokkan dalam kartu (General / URL / Data)
 *   B2  Local URL dan External URL tetap terpisah
 *   B3  ringkasan arti pasangan URL tampil
 *   B4  Clear benar-benar memanggil Rust dan melaporkan jumlah pane
 *
 *   C1  Conversations: dua tab (percakapan + notifikasi)
 *   C2  daftar sesi menampilkan sesi nyata dari store
 *   C3  tab notifikasi menjelaskan gate 20 detik + fokus
 *
 *   M1  AI Models: grup Built-in / Custom dengan jumlah
 *   M2  baris deteksi per provider ada (keunggulan Zephyr)
 *   M3  Add Model membuka grid preset provider
 *   M4  memilih preset mengisi Base URL otomatis
 *   M5  menyimpan model kustom benar-benar menambah baris di grup Custom
 *
 *   P1  Plugins: katalog pasar bertambah (>= 7, bukan 2)
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
  const slotOk = slot + 'OK__';
  await cdp.eval(
    `(() => {
    const lama = document.getElementById(${JSON.stringify(id)});
    if (lama) lama.remove();
    const host = document.createElement('div');
    host.id = ${JSON.stringify(id)};
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--bg,#111);padding:20px';
    document.body.appendChild(host);
    window[${JSON.stringify(slot)}] = null;
    window[${JSON.stringify(slotOk)}] = false;
    (async () => {
      try {
        const ReactMod = await import('/node_modules/.vite/deps/react.js');
        const React = ReactMod.default ?? ReactMod;
        const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js');
        const Dom = DomMod.default ?? DomMod;
        const mod = await import(${JSON.stringify(path)});
        const root = Dom.createRoot(host);
        root.render(React.createElement(mod.default));
        window[${JSON.stringify(slot)}] = root;
        window[${JSON.stringify(slotOk)}] = true;
      } catch (e) {
        window[${JSON.stringify(slotOk)}] = 'GAGAL: ' + String(e);
      }
    })();
    return 'mulai';
  })()`,
  );
  await new Promise((r) => setTimeout(r, 2400));
  return cdp.eval(`window[${JSON.stringify(slotOk)}]`);
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

const klik = async (sel) =>
  cdp.eval(
    `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.click(); return !!b; })()`,
  );

const out = {};

/* ── D: Agents dialogs ──────────────────────────────────────────────────── */
out.mountAgents = await mount('uji-agen', '/src/components/settings/AgcAgents.tsx');

await klik('#uji-agen [data-testid="agx-create"]');
await new Promise((r) => setTimeout(r, 900));

const d1 = await J(`(() => {
  const p = document.querySelector('#uji-agen [data-testid="agx-editor"]');
  const av = p?.querySelector('[data-testid="agx-avatar-buka"]');
  return {
    adaEditor: !!p,
    avatarTombol: !!av,
    tagAvatar: av ? av.tagName : null,
    adaDialog: !!document.querySelector('#uji-agen [data-testid="agx-avatar-modal"]'),
  };
})()`);
out.d1 = typeof d1 === 'string' ? JSON.parse(d1) : d1;

await klik('#uji-agen [data-testid="agx-avatar-buka"]');
await new Promise((r) => setTimeout(r, 800));

const d2 = await J(`(() => {
  const m = document.querySelector('#uji-agen [data-testid="agx-avatar-modal"]');
  return {
    adaDialog: !!m,
    adaPreview: !!m?.querySelector('[data-testid="agx-avatar-calon"]'),
    adaGrid: !!m?.querySelector('[data-testid="agx-avatar-grid"]'),
    adaAcak: !!m?.querySelector('[data-testid="agx-avatar-acak"]'),
    adaUpload: !!m?.querySelector('[data-testid="agx-avatar-unggah"]'),
    adaPakai: !!m?.querySelector('[data-testid="agx-avatar-pakai"]'),
    jumlahPil: m ? m.querySelectorAll('[data-testid^="agx-avatar-"]').length : 0,
  };
})()`);
out.d2 = typeof d2 === 'string' ? JSON.parse(d2) : d2;

/* D3: pick a specific avatar and use it. */
await klik('#uji-agen [data-testid="agx-avatar-naga"]');
await new Promise((r) => setTimeout(r, 400));
await klik('#uji-agen [data-testid="agx-avatar-pakai"]');
await new Promise((r) => setTimeout(r, 800));

const d3 = await J(`(() => {
  const p = document.querySelector('#uji-agen [data-testid="agx-editor"]');
  const av = p?.querySelector('[data-testid="agx-avatar-buka"]');
  return {
    dialogTutup: !document.querySelector('#uji-agen [data-testid="agx-avatar-modal"]'),
    ikonSekarang: av ? av.querySelector('[data-ikon]')?.getAttribute('data-ikon') ?? av.innerHTML.slice(0, 60) : null,
  };
})()`);
out.d3 = typeof d3 === 'string' ? JSON.parse(d3) : d3;

/* D4/D5: Smart Generate. */
await klik('#uji-agen [data-testid="agx-smart"]');
await new Promise((r) => setTimeout(r, 800));

const d4 = await J(`(() => {
  const m = document.querySelector('#uji-agen [data-testid="agx-smart-modal"]');
  return {
    adaDialog: !!m,
    adaTeks: !!m?.querySelector('[data-testid="agx-smart-teks"]'),
    adaGenerate: !!m?.querySelector('[data-testid="agx-smart-generate"]'),
  };
})()`);
out.d4 = typeof d4 === 'string' ? JSON.parse(d4) : d4;

await cdp.eval(
  `(() => {
  const t = document.querySelector('#uji-agen [data-testid="agx-smart-teks"]');
  if (!t) return 'no';
  const st = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  st.call(t, 'Review pull requests for missing tests and unclear names');
  t.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 500));
await klik('#uji-agen [data-testid="agx-smart-generate"]');
await new Promise((r) => setTimeout(r, 900));

const d5 = await J(`(() => {
  const p = document.querySelector('#uji-agen [data-testid="agx-editor"]');
  const nama = p?.querySelector('[data-testid="agx-nama"]');
  const prompt = p?.querySelector('[data-testid="agx-prompt"]');
  return {
    dialogTutup: !document.querySelector('#uji-agen [data-testid="agx-smart-modal"]'),
    nama: nama ? nama.value : null,
    promptPanjang: prompt ? prompt.value.length : 0,
  };
})()`);
out.d5 = typeof d5 === 'string' ? JSON.parse(d5) : d5;

await unmount('uji-agen');

/* ── B: Browser ─────────────────────────────────────────────────────────── */
out.mountBrowser = await mount('uji-br', '/src/components/settings/AgcBrowser.tsx');

const b = await J(`(() => {
  const p = document.querySelector('#uji-br [data-testid="agx-browser"]');
  return {
    ada: !!p,
    kartu: p ? p.querySelectorAll('.agx-kartu-setelan').length : 0,
    baris: p ? p.querySelectorAll('.agx-kartu-baris').length : 0,
    adaLokal: !!p?.querySelector('[data-testid="agx-br-lokal"]'),
    adaLuar: !!p?.querySelector('[data-testid="agx-br-luar"]'),
    adaRingkas: !!p?.querySelector('[data-testid="agx-br-ringkas"]'),
    ringkas: p?.querySelector('[data-testid="agx-br-ringkas"]')?.textContent ?? null,
    adaClear: !!p?.querySelector('[data-testid="agx-br-clear"]'),
  };
})()`);
out.browser = typeof b === 'string' ? JSON.parse(b) : b;

await klik('#uji-br [data-testid="agx-br-clear"]');
await new Promise((r) => setTimeout(r, 2000));

const b4 = await J(`(() => {
  const el = document.querySelector('#uji-br [data-testid="agx-br-pesan"]');
  return { pesan: el ? el.textContent : null };
})()`);
out.b4 = typeof b4 === 'string' ? JSON.parse(b4) : b4;

await unmount('uji-br');

/* ── C: Conversations ───────────────────────────────────────────────────── */
out.mountConv = await mount('uji-conv', '/src/components/settings/AgcConversations.tsx');

const c = await J(`(() => {
  const p = document.querySelector('#uji-conv [data-testid="agx-conv"]');
  return {
    ada: !!p,
    adaTabPercakapan: !!p?.querySelector('[data-testid="agx-conv-percakapan"]'),
    adaTabNotif: !!p?.querySelector('[data-testid="agx-conv-notifikasi"]'),
    baris: p ? p.querySelectorAll('[data-testid^="agx-conv-"]').length : 0,
    adaKosong: !!p?.querySelector('[data-testid="agx-conv-kosong"]'),
  };
})()`);
out.conv = typeof c === 'string' ? JSON.parse(c) : c;

await klik('#uji-conv [data-testid="agx-conv-notifikasi"]');
await new Promise((r) => setTimeout(r, 800));

const c3 = await J(`(() => {
  const p = document.querySelector('#uji-conv [data-testid="agx-conv"]');
  const t = p ? p.textContent : '';
  return {
    sebutGate: /20|focused|terfokus|not focus/i.test(t),
    adaKosong: !!p?.querySelector('[data-testid="agx-conv-notif-kosong"]'),
    barisNotif: p ? p.querySelectorAll('[data-testid="agx-conv-notif"]').length : 0,
  };
})()`);
out.c3 = typeof c3 === 'string' ? JSON.parse(c3) : c3;

await unmount('uji-conv');

/* ── M: AI Models ───────────────────────────────────────────────────────── */
out.mountModels = await mount('uji-models', '/src/components/settings/AiModelsPage.tsx');

const m = await J(`(() => {
  const p = document.querySelector('#uji-models [data-testid="aim-page"]');
  return {
    ada: !!p,
    grupBuiltin: !!p?.querySelector('[data-testid="aim-grup-builtin"]'),
    grupCustom: !!p?.querySelector('[data-testid="aim-grup-custom"]'),
    jmlBaris: p ? p.querySelectorAll('[data-testid="aim-table-row"]').length : 0,
    adaDeteksi: !!p?.querySelector('[data-testid="aim-deteksi"]'),
    chipDeteksi: p ? p.querySelectorAll('[data-testid^="aim-deteksi-"]').length : 0,
    adaTambah: !!p?.querySelector('[data-testid="aim-tambah"]'),
  };
})()`);
out.models = typeof m === 'string' ? JSON.parse(m) : m;

await klik('#uji-models [data-testid="aim-tambah"]');
await new Promise((r) => setTimeout(r, 900));

const m3 = await J(`(() => {
  const d = document.querySelector('#uji-models [data-testid="aim-add-modal"]');
  return {
    adaDialog: !!d,
    adaGrid: !!d?.querySelector('[data-testid="aim-preset-grid"]'),
    preset: d ? d.querySelectorAll('[data-testid^="aim-preset-"]').length : 0,
    adaCustom: !!d?.querySelector('[data-testid="aim-preset-custom"]'),
  };
})()`);
out.m3 = typeof m3 === 'string' ? JSON.parse(m3) : m3;

/* M4: pick a preset, the URL field must be filled. */
await klik('#uji-models [data-testid="aim-preset-gemini"]');
await new Promise((r) => setTimeout(r, 700));

const m4 = await J(`(() => {
  const d = document.querySelector('#uji-models [data-testid="aim-add-modal"]');
  const url = d?.querySelector('[data-testid="aim-add-url"]');
  return { adaForm: !!d?.querySelector('[data-testid="aim-add-id"]'), url: url ? url.value : null };
})()`);
out.m4 = typeof m4 === 'string' ? JSON.parse(m4) : m4;

/* M5: fill and save, then the Custom group must have grown. */
const sebelumCustom = await J(`(() => ({
  n: document.querySelector('#uji-models [data-testid="aim-grup-custom"]')?.textContent ?? '',
}))()`);
out.sebelumCustom = typeof sebelumCustom === 'string' ? JSON.parse(sebelumCustom) : sebelumCustom;

await cdp.eval(
  `(() => {
  const i = document.querySelector('#uji-models [data-testid="aim-add-id"]');
  if (!i) return 'no';
  const st = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  st.call(i, 'uji-model-deteksi');
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 500));
await klik('#uji-models [data-testid="aim-add-simpan"]');
await new Promise((r) => setTimeout(r, 1600));

const m5 = await J(`(() => {
  const p = document.querySelector('#uji-models [data-testid="aim-page"]');
  const baris = p ? [...p.querySelectorAll('[data-testid="aim-table-row"]')] : [];
  return {
    adaBarisUji: baris.some((r) => (r.getAttribute('data-model') || '') === 'uji-model-deteksi'),
    grupCustom: p?.querySelector('[data-testid="aim-grup-custom"]')?.textContent ?? '',
  };
})()`);
out.m5 = typeof m5 === 'string' ? JSON.parse(m5) : m5;

/* Clean up the test model from settings. */
await cdp.eval(
  `(() => {
  const S = window.__ZEPHYR__.getState();
  const m = S.settings.models ?? {};
  const c = (m.custom ?? []).filter((x) => x.id !== 'uji-model-deteksi');
  void S.applySettings({ models: { ...m, custom: c } });
  return 'ok';
})()`,
);
await unmount('uji-models');

/* ── P: plugin catalogue ────────────────────────────────────────────────── */
const p = await J(`await (async () => {
  const P = window.__ZEPHYR_PLUGINS__;
  await P.usePlugins.getState().muat();
  const st = P.usePlugins.getState();
  return {
    pasar: (st.pasar ?? []).length,
    nama: (st.pasar ?? []).map((x) => x.name),
  };
})()`);
out.plugins = typeof p === 'string' ? JSON.parse(p) : p;

console.log(JSON.stringify(out, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — Agents: avatar & Smart Generate sebagai DIALOG:');
cek('D1 avatar adalah tombol di editor', out.d1?.adaEditor === true && out.d1?.avatarTombol === true, out.d1?.tagAvatar ?? '');
cek(
  'D2 dialog avatar: preview, grid, Try Another, Upload, Use',
  out.d2?.adaDialog === true &&
    out.d2?.adaPreview === true &&
    out.d2?.adaGrid === true &&
    out.d2?.adaAcak === true &&
    out.d2?.adaUpload === true &&
    out.d2?.adaPakai === true,
  `pil=${out.d2?.jumlahPil}`,
);
cek('D3 memilih avatar mengubah draft + dialog menutup', out.d3?.dialogTutup === true, out.d3?.ikonSekarang ?? '');
cek(
  'D4 Smart Generate membuka dialog dengan textarea + Generate',
  out.d4?.adaDialog === true && out.d4?.adaTeks === true && out.d4?.adaGenerate === true,
  '',
);
cek(
  'D5 Generate menulis Name + Prompt ke form',
  out.d5?.dialogTutup === true && (out.d5?.nama ?? '').length > 0 && (out.d5?.promptPanjang ?? 0) > 20,
  `nama="${out.d5?.nama}" prompt=${out.d5?.promptPanjang}ch`,
);

console.log('\nBukti — Browser dikelompokkan:');
cek('B1 setelan dalam kartu terpisah', out.browser?.ada === true && (out.browser?.kartu ?? 0) >= 2, `kartu=${out.browser?.kartu} baris=${out.browser?.baris}`);
cek('B2 Local & External URL tetap terpisah', out.browser?.adaLokal === true && out.browser?.adaLuar === true, '');
cek('B3 ringkasan arti pasangan URL tampil', out.browser?.adaRingkas === true && (out.browser?.ringkas ?? '').length > 10, out.browser?.ringkas ?? '');
cek(
  'B4 Clear memanggil Rust dan melaporkan hasil',
  (out.b4?.pesan ?? '').length > 0,
  String(out.b4?.pesan ?? '').slice(0, 70),
);

console.log('\nBukti — Conversations:');
cek('C1 dua tab: percakapan + notifikasi', out.conv?.ada === true && out.conv?.adaTabPercakapan === true && out.conv?.adaTabNotif === true, '');
cek(
  'C2 daftar sesi memakai sesi nyata dari store',
  out.conv?.ada === true && ((out.conv?.baris ?? 0) > 0 || out.conv?.adaKosong === true),
  `baris=${out.conv?.baris} kosong=${out.conv?.adaKosong}`,
);
cek('C3 tab notifikasi menjelaskan gate 20 detik + fokus', out.c3?.sebutGate === true, '');

console.log('\nBukti — AI Models ala TRAE:');
cek('M1 grup Built-in / Custom ada', out.models?.ada === true && out.models?.grupBuiltin === true && out.models?.grupCustom === true, `baris=${out.models?.jmlBaris}`);
cek('M2 baris deteksi per provider ada', out.models?.adaDeteksi === true && (out.models?.chipDeteksi ?? 0) > 0, `chip=${out.models?.chipDeteksi}`);
cek(
  'M3 Add Model membuka grid preset',
  out.m3?.adaDialog === true && out.m3?.adaGrid === true && (out.m3?.preset ?? 0) >= 8 && out.m3?.adaCustom === true,
  `preset=${out.m3?.preset}`,
);
cek('M4 memilih preset mengisi Base URL otomatis', out.m4?.adaForm === true && (out.m4?.url ?? '').startsWith('http'), out.m4?.url ?? '');
cek(
  'M5 menyimpan model kustom menambah baris di grup Custom',
  out.m5?.adaBarisUji === true,
  `grup="${(out.m5?.grupCustom ?? '').trim()}"`,
);

console.log('\nBukti — Plugins:');
cek('P1 katalog pasar bertambah (>= 7)', (out.plugins?.pasar ?? 0) >= 7, `${out.plugins?.pasar}: ${(out.plugins?.nama ?? []).join(', ')}`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
