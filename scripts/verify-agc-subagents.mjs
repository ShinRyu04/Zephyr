/*
 * Bukti: halaman Subagents (Agent Customizations) berbentuk ZCode dan hidup.
 *
 *   S1  pane merender dengan keluarga kelas `agc-zc-*` (judul + hitungan + cari)
 *   S2  grup "Built-in subagents" berisi 6 peran bawaan dan dropdown model
 *   S3  + New membuka editor `agc-zc-editor` dengan field lengkap
 *   S4  menyimpan membuat kartu `agc-zc-kartu` (nama, deskripsi, chip tool, aksi)
 *   S5  seluruh isian benar-benar tertulis ke `settings.subagentCustom`
 *   S6  hapus menghapus kartu dari daftar DAN dari setelan
 *   S7  cari menyaring daftar (tidak menampilkan yang tidak cocok)
 *
 * Jalankan dengan app dev + port debug 9223 (lihat AGENTS.md).
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

/** JSON helper - lihat catatan double-await di verify-agc-hooks-browser.mjs. */
async function J(expr, ms = 60000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  const raw = await cdp.runAsync(badan, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

const SLOT = '__UJI_agc_subagents__';
const HOST = 'uji-agc-subagents';

/* Pasang komponen ke host khusus supaya tidak mengganggu UI user. */
const mountHasil = await J(`await (async () => {
  try {
    const lama = document.getElementById(${JSON.stringify(HOST)});
    if (lama) lama.remove();
    const host = document.createElement('div');
    host.id = ${JSON.stringify(HOST)};
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--bg,#111);padding:24px';
    document.body.appendChild(host);
    const ReactMod = await import('/node_modules/.vite/deps/react.js');
    const React = ReactMod.default ?? ReactMod;
    const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js');
    const Dom = DomMod.default ?? DomMod;
    const createRoot = Dom.createRoot ?? DomMod.createRoot;
    const mod = await import('/src/components/settings/AgcSubagents.tsx');
    const root = createRoot(host);
    root.render(React.createElement(mod.default));
    window[${JSON.stringify(SLOT)}] = root;
    return { ok: true };
  } catch (e) {
    return { ok: false, galat: String(e) };
  }
})()`, 120000);
await new Promise((r) => setTimeout(r, 1400));

const panes = await J(`(() => {
  const pane = document.querySelector('#${HOST} [data-testid="agc-subagents"]');
  if (!pane) return { adaPane: false };
  const at = pane.querySelector('.agc-zc-atas');
  const daftar = pane.querySelector('[data-testid="agc-sub-daftar"]');
  const bawaan = pane.querySelector('[data-testid="agc-sub-bawaan"]');
  return {
    adaPane: true,
    adaAtas: !!at,
    judul: at?.querySelector('.agc-zc-judul')?.textContent ?? null,
    hitung: at?.querySelector('.agc-zc-hitung')?.textContent ?? null,
    adaCari: !!pane.querySelector('[data-testid="agc-sub-cari"]'),
    adaBaru: !!pane.querySelector('[data-testid="agc-sub-baru"]'),
    adaDaftar: !!daftar,
    jumlahBawaan: bawaan ? bawaan.querySelectorAll('.agc-zc-kartu').length : 0,
    jumlahSelectModel: bawaan ? bawaan.querySelectorAll('[data-testid^="agc-sub-model-"]').length : 0,
    kelasZc: [...new Set([...pane.querySelectorAll('*')].flatMap((e) => [...e.classList]).filter((c) => c.startsWith('agc-zc')))].length,
    kelasAsing: [...new Set([...pane.querySelectorAll('*')].flatMap((e) => [...e.classList]).filter((c) => c.startsWith('agset-') || c.startsWith('agc-sub-')))].slice(0, 8),
  };
})()`);

/* S3: buka editor. */
await J(`(() => {
  document.querySelector('#${HOST} [data-testid="agc-sub-baru"]')?.click();
  return 'ok';
})()`);
await new Promise((r) => setTimeout(r, 500));
const editor = await J(`(() => {
  const pane = document.querySelector('#${HOST} [data-testid="agc-subagents"]');
  const form = pane?.querySelector('[data-testid="agc-sub-form"]');
  if (!form) return { adaForm: false };
  return {
    adaForm: true,
    kelas: form.className,
    adaFieldKelas: !!form.querySelector('.agc-zc-field'),
    adaNama: !!form.querySelector('[data-testid="agc-sub-nama"]'),
    adaModel: !!form.querySelector('[data-testid="agc-sub-model"]'),
    adaDesk: !!form.querySelector('[data-testid="agc-sub-deskripsi"]'),
    adaPrompt: !!form.querySelector('[data-testid="agc-sub-prompt"]'),
    adaAlat: !!form.querySelector('[data-testid="agc-sub-alat"]'),
    jumlahAlat: form.querySelectorAll('.agc-zc-alat-item').length,
    adaSimpan: !!form.querySelector('[data-testid="agc-sub-simpan"]'),
  };
})()`);

/* S4/S5: isi dan simpan. */
const sebelum = await J(`(() => {
  const S = window.__ZEPHYR__.getState();
  return { jumlah: Array.isArray(S.settings.subagentCustom) ? S.settings.subagentCustom.length : 0 };
})()`);
const simpan = await J(`(async () => {
  const setNative = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const pane = document.querySelector('#${HOST} [data-testid="agc-subagents"]');
  const nama = pane.querySelector('[data-testid="agc-sub-nama"]');
  const desk = pane.querySelector('[data-testid="agc-sub-deskripsi"]');
  const prompt = pane.querySelector('[data-testid="agc-sub-prompt"]');
  if (!nama || !desk || !prompt) return { ok: false, kenapa: 'field hilang' };
  setNative(nama, 'Uji Auditor');
  setNative(desk, 'Periksa risiko perubahan kode');
  setNative(prompt, 'Kamu adalah auditor yang teliti.');
  await new Promise((r) => setTimeout(r, 300));
  pane.querySelector('[data-testid="agc-sub-simpan"]')?.click();
  await new Promise((r) => setTimeout(r, 1200));
  const kartu = [...pane.querySelectorAll('[data-testid="agc-sub-daftar"] .agc-zc-kartu')];
  const satu = kartu[0];
  const S = window.__ZEPHYR__.getState();
  const simpanan = Array.isArray(S.settings.subagentCustom) ? S.settings.subagentCustom : [];
  return {
    ok: true,
    jumlahKartu: kartu.length,
    judul: satu?.querySelector('.agc-zc-kartu-head')?.textContent ?? null,
    deskripsi: satu?.querySelector('.agc-zc-desk')?.textContent ?? null,
    chip: satu ? [...satu.querySelectorAll('.agc-zc-chip')].map((c) => c.textContent) : [],
    aksi: satu ? [...satu.querySelectorAll('button')].map((b) => b.getAttribute('data-testid')) : [],
    tersimpan: simpanan.map((d) => ({ nama: d.nama, deskripsi: d.deskripsi, prompt: d.prompt })),
  };
})()`, 120000);

/* S7: cari menyaring. */
const cari = await J(`(async () => {
  const setNative = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const pane = document.querySelector('#${HOST} [data-testid="agc-subagents"]');
  const kotak = pane.querySelector('[data-testid="agc-sub-cari"]');
  setNative(kotak, 'zzz-tidak-ada');
  await new Promise((r) => setTimeout(r, 500));
  const kosong = !!pane.querySelector('[data-testid="agc-sub-kosong"]');
  const kartuSaatCari = pane.querySelectorAll('[data-testid="agc-sub-daftar"] .agc-zc-kartu').length;
  setNative(kotak, '');
  await new Promise((r) => setTimeout(r, 400));
  return { kosong, kartuSaatCari };
})()`, 60000);

/* S6: hapus lewat tombol di kartu. */
const hapus = await J(`(async () => {
  const pane = document.querySelector('#${HOST} [data-testid="agc-subagents"]');
  pane.querySelector('[data-testid="agc-sub-daftar"] .agc-zc-ikon-hapus')?.click();
  await new Promise((r) => setTimeout(r, 900));
  const S = window.__ZEPHYR__.getState();
  const simpanan = Array.isArray(S.settings.subagentCustom) ? S.settings.subagentCustom : [];
  return {
    jumlahKartu: pane.querySelectorAll('[data-testid="agc-sub-daftar"] .agc-zc-kartu').length,
    jumlahSetelan: simpanan.length,
  };
})()`, 60000);

/* Bersihkan host. */
await cdp.eval(
  `(() => { try { window[${JSON.stringify(SLOT)}]?.unmount(); } catch (e) {} document.getElementById(${JSON.stringify(HOST)})?.remove(); return 'ok'; })()`,
);

console.log(JSON.stringify({ mountHasil, panes, editor, sebelum, simpan, cari, hapus }, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

cek('S1 pane memakai keluarga agc-zc-* + judul/hitungan/cari', mountHasil?.ok === true && panes?.adaPane === true && panes?.adaAtas === true && panes?.judul === 'Subagents' && panes?.adaCari === true && (panes?.kelasZc ?? 0) >= 12, `zc=${panes?.kelasZc} asing=${JSON.stringify(panes?.kelasAsing)}`);
cek('S2 Built-in subagents berisi 6 peran + dropdown model', (panes?.jumlahBawaan ?? 0) === 6 && (panes?.jumlahSelectModel ?? 0) === 6, `kartu=${panes?.jumlahBawaan} select=${panes?.jumlahSelectModel}`);
cek('S3 + New membuka editor agc-zc-editor dengan field lengkap', editor?.adaForm === true && (editor?.kelas ?? '').includes('agc-zc-editor') && editor?.adaFieldKelas === true && editor?.adaNama === true && editor?.adaModel === true && editor?.adaDesk === true && editor?.adaPrompt === true && editor?.adaAlat === true && editor?.adaSimpan === true, `alat=${editor?.jumlahAlat}`);
cek('S4 simpan membuat kartu agc-zc-kartu (nama + deskripsi + chip + aksi)', (simpan?.jumlahKartu ?? 0) >= 1 && simpan?.judul === 'Uji Auditor' && (simpan?.deskripsi ?? '').includes('risiko') && Array.isArray(simpan?.aksi) && simpan.aksi.some((x) => String(x).startsWith('agc-sub-edit-')) && simpan.aksi.some((x) => String(x).startsWith('agc-sub-hapus-')), `chip=${JSON.stringify(simpan?.chip)}`);
cek('S5 isian benar-benar tertulis ke settings.subagentCustom', (simpan?.tersimpan ?? []).some((d) => d.nama === 'Uji Auditor' && d.deskripsi.includes('risiko') && d.prompt.includes('auditor')), `tersimpan=${JSON.stringify(simpan?.tersimpan)}`);
cek('S6 hapus membersihkan kartu dan setelan', (hapus?.jumlahKartu ?? 1) === 0 && (hapus?.jumlahSetelan ?? 1) === (sebelum?.jumlah ?? 1), `kartu=${hapus?.jumlahKartu} setelan=${sebelum?.jumlah}->${hapus?.jumlahSetelan}`);
cek('S7 cari menyaring ke empty-state', cari?.kosong === true && (cari?.kartuSaatCari ?? 1) === 0, `kartu=${cari?.kartuSaatCari}`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);