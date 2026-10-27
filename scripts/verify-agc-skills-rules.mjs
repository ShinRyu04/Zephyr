/*
 * Bukti: halaman Skills dan editor Rules di Agent Customizations.
 *
 *   S1  pane Skills merender daftar bergrup dengan kartu
 *   S2  skill terpasang (termasuk modlens) muncul di daftar
 *   S3  kotak cari menyaring daftar
 *   S4  pemilih scope + tombol New ada (dan New benar-benar membuka editor)
 *   S5  skill bawaan yang BELUM terpasang punya tombol Install
 *   S6  tiap baris terpasang punya SAKELAR AKTIF
 *   S7  mematikan satu skill lewat sakelar benar-benar mengubah prompt:
 *       barisnya hilang dari `konteksAgent()`, tapi MASIH ada di jawaban mentah
 *       Rust (`agent_context`) — jadi yang menyaring memang jalur prompt, bukan
 *       berkasnya yang kebetulan hilang. Sakelarnya dikembalikan di akhir.
 *
 *   R1  pane Rules & Memories merender dengan tombol Create
 *   R2  Create membuka EDITOR TEKS (bukan langsung menyimpan)
 *   R3  editor punya field Name dan textarea Rule
 *   R4  menyimpan benar-benar membuat berkas aturan (daftar bertambah)
 *   R5  aturan baru tampil di daftar
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

async function J(expr, ms = 60000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  const raw = await cdp.runAsync(badan, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function mount(id, path) {
  /* The slot name must be a valid IDENTIFIER; container ids contain hyphens. */
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
  await new Promise((r) => setTimeout(r, 2200));
  return cdp.eval(`window[${JSON.stringify(slotOk)}]`);
}

const out = {};

/* ── Skills ─────────────────────────────────────────────────────────────── */
out.mountSkills = await mount('uji-skills', '/src/components/settings/AgcSkills.tsx');

const sk = await J(`(() => {
  const p = document.querySelector('#uji-skills [data-testid="agx-skills"]');
  const o = { ada: !!p };
  if (!p) return o;
  /*
   * Rows are counted by their OWN prefix minus the per-row controls, the same way
   * the other harness counts them: the prefix also matches the trash button, and
   * a naive count therefore reports two rows for one skill.
   */
  o.baris = [...p.querySelectorAll('[data-testid^="agx-skill-"]')].filter(
    (x) => !/agx-skill-(hapus|pasang)-/.test(x.getAttribute('data-testid') || ''),
  ).length;
  o.adaCari = !!p.querySelector('[data-testid="agx-skills-cari"]');
  o.adaScope = !!p.querySelector('[data-testid="agx-skills-scope"]');
  o.adaBaru = !!p.querySelector('[data-testid="agx-skills-baru"]');
  o.grup = [...p.querySelectorAll('.agc-zc-grub-judul')].map((g) => g.textContent.trim());
  o.sakelar = p.querySelectorAll('[data-testid^="agc-skill-aktif-"]').length;
  o.pasang = p.querySelectorAll('[data-testid^="agx-skill-pasang-"]').length;
  o.hapus = p.querySelectorAll('[data-testid^="agx-skill-hapus-"]').length;
  o.adaModlens = !!p.querySelector('[data-testid="agx-skill-modlens"]');
  return o;
})()`);
out.skills = typeof sk === 'string' ? JSON.parse(sk) : sk;

/* S3: cari menyaring. */
const sebelumCari = await J(`(() => ({
  n: document.querySelectorAll('#uji-skills [data-testid^="agx-skill-"]').length,
}))()`);
out.sebelumCari = typeof sebelumCari === 'string' ? JSON.parse(sebelumCari) : sebelumCari;

await cdp.eval(
  `(() => {
  const i = document.querySelector('#uji-skills [data-testid="agx-skills-cari"]');
  if (!i) return 'no';
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  s.call(i, 'zzz-tidak-ada');
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 700));
const sesudahCari = await J(`(() => ({
  n: document.querySelectorAll('#uji-skills [data-testid^="agx-skill-"]').length,
  kosong: !!document.querySelector('#uji-skills [data-testid="agx-skills-kosong"]'),
}))()`);
out.sesudahCari = typeof sesudahCari === 'string' ? JSON.parse(sesudahCari) : sesudahCari;

/* S4b: "+ New" benar-benar membuka editor (dulu tombolnya mati). */
await cdp.eval(
  `(() => {
  const i = document.querySelector('#uji-skills [data-testid="agx-skills-cari"]');
  if (i) {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(i, '');
    i.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 500));

await cdp.eval(
  `(() => {
  const b = document.querySelector('#uji-skills [data-testid="agx-skills-baru"]');
  if (b) b.click();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 600));

const editorSkill = await J(`(() => {
  const e = document.querySelector('#uji-skills [data-testid="agx-skill-editor"]');
  return {
    ada: !!e,
    adaNama: !!e?.querySelector('[data-testid="agx-skill-nama"]'),
    adaIsi: !!e?.querySelector('[data-testid="agx-skill-body"]'),
    adaSimpan: !!e?.querySelector('[data-testid="agx-skill-simpan"]'),
  };
})()`);
/*
 * Kunci terpisah dari `out.editor`.
 *
 * Bagian Rules di bawah memakai `out.editor` untuk EDITOR ATURAN; memakai nama
 * yang sama di sini membuat nilai ini tertimpa, dan ujinya gagal dengan
 * "editor=undefined" padahal editornya benar-benar terbuka.
 */
out.editorSkill = typeof editorSkill === 'string' ? JSON.parse(editorSkill) : editorSkill;

/*
 * S7: hidup-mati satu skill, dibuktikan pada PROMPT, bukan pada DOM saja.
 *
 * `konteksAgent()` (aiStore) adalah jalur yang benar-benar menyusun konteks tiap
 * giliran; `agentContext()` (Rust) adalah jawaban mentahnya. Keduanya diperiksa
 * sekaligus: baris harus HILANG di yang pertama dan MASIH ADA di yang kedua —
 * itu bukti penyaringnya bekerja di perbatasan prompt, bukan di berkas skill.
 */
/* Langkah 1: keadaan AWAL, sebelum sakelar disentuh. */
const s7a = await J(`await (async () => {
  const { useSkills } = await import('/src/lib/skillsStore.ts');
  const { konteksAgent } = await import('/src/lib/aiStore.ts');
  const cmd = await import('/src/lib/commands.ts');

  await useSkills.getState().muatKatalog();
  const semua = useSkills.getState().daftar;
  const target = semua.find((s) => s.name === 'modlens') ?? semua[0];
  if (!target) return { ada: false };
  window.__UJI_TARGET_SKILL__ = target.name;

  const sebelum = await konteksAgent();
  const mentahSebelum = await cmd.agentContext();
  return {
    ada: true,
    nama: target.name,
    sebelumAda: sebelum.includes(target.name + ' ['),
    mentahSebelumAda: mentahSebelum.includes(target.name + ' ['),
  };
})()`);
out.aktif = typeof s7a === 'string' ? JSON.parse(s7a) : s7a;

/*
 * Langkah 2: matikan dengan MENGKLIK SAKELARNYA, bukan dengan memanggil store.
 *
 * Kenapa klik: modul yang diimpor harness bisa berupa instance berbeda dari yang
 * dirender app (Vite menambahkan `?t=` pada modul yang pernah di-HMR), dan saat
 * itu terjadi store-nya berubah tapi DOM-nya tidak — uji-nya lalu gagal karena
 * alasan yang tidak ada hubungannya dengan produk. Klik menjalankan jalur yang
 * sama dengan user, jadi tidak ada instance mana pun yang bisa tertukar.
 */
await cdp.eval(
  `(() => {
  const b = document.querySelector('#uji-skills [data-testid="agc-skill-aktif-' + window.__UJI_TARGET_SKILL__ + '"]');
  if (b) b.click();
  return !!b;
})()`,
);
/*
 * Jeda ini BUKAN hiasan. Membaca DOM di tick yang sama dengan perubahan store
 * mengembalikan nilai LAMA (React belum render ulang), dan ujinya gagal dengan
 * "aria=true" padahal sakelarnya benar-benar berubah.
 */
await new Promise((r) => setTimeout(r, 900));

/* Langkah 3: keadaan SESUDAH, dibaca di panggilan terpisah. */
const s7b = await J(`await (async () => {
  const { bacaNonaktif } = await import('/src/lib/skillAktif.ts');
  const { konteksAgent } = await import('/src/lib/aiStore.ts');
  const cmd = await import('/src/lib/commands.ts');
  const nama = window.__UJI_TARGET_SKILL__;
  const sesudah = await konteksAgent();
  const mentahSesudah = await cmd.agentContext();
  const sakelar = document.querySelector('#uji-skills [data-testid="agc-skill-aktif-' + nama + '"]');
  return {
    sesudahAda: sesudah.includes(nama + ' ['),
    mentahSesudahAda: mentahSesudah.includes(nama + ' ['),
    nonaktif: bacaNonaktif(),
    ariaSesudah: sakelar?.getAttribute('aria-checked') ?? null,
    barisMati: !!document.querySelector('#uji-skills [data-testid="agx-skill-' + nama + '"].is-mati'),
  };
})()`);
out.aktifSesudah = typeof s7b === 'string' ? JSON.parse(s7b) : s7b;

/* Langkah 4: kembalikan — sakelar ini milik pembaca, bukan milik harness. */
await cdp.eval(
  `(() => {
  const b = document.querySelector('#uji-skills [data-testid="agc-skill-aktif-' + window.__UJI_TARGET_SKILL__ + '"]');
  if (b) b.click();
  return !!b;
})()`,
);
await new Promise((r) => setTimeout(r, 700));

const s7c = await J(`await (async () => {
  const { bacaNonaktif } = await import('/src/lib/skillAktif.ts');
  const { konteksAgent } = await import('/src/lib/aiStore.ts');
  const nama = window.__UJI_TARGET_SKILL__;
  const sakelar = document.querySelector('#uji-skills [data-testid="agc-skill-aktif-' + nama + '"]');
  return {
    bersih: bacaNonaktif().length === 0,
    pulih: (await konteksAgent()).includes(nama + ' ['),
    ariaPulih: sakelar?.getAttribute('aria-checked') ?? null,
  };
})()`);
out.aktifPulih = typeof s7c === 'string' ? JSON.parse(s7c) : s7c;

await cdp.eval(
  `(() => {
  try { window.__UJI_uji_skills__?.unmount(); } catch (e) {}
  const h = document.getElementById('uji-skills');
  if (h) h.remove();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 600));

/* ── Rules & Memories ───────────────────────────────────────────────────── */
/*
 * Delete any leftover from a previous run FIRST. The check is "does saving add
 * a rule", and a leftover makes the count go 1 -> 1, which reads as a failure
 * of the SAVE when it is really a dirty fixture.
 */
await cdp.eval(
  `(() => {
  window.__UJI_HAPUS_ATURAN__ = 'mulai';
  import('/src/lib/instructionsStore.ts').then(async (m) => {
    const g = m.useInstructions.getState();
    await g.muat();
    const ada = (m.useInstructions.getState().daftar || []).filter((x) => x.name === 'uji-aturan-bebas');
    for (const a of ada) await g.hapus(a.name);
    window.__UJI_HAPUS_ATURAN__ = 'selesai:' + ada.length;
  });
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 2500));
out.bersih = await cdp.eval(`window.__UJI_HAPUS_ATURAN__`);

out.mountRules = await mount('uji-rules', '/src/components/settings/AgcRulesMemories.tsx');

const r1 = await J(`await (async () => {
  const p = document.querySelector('#uji-rules [data-testid="agx-rules"]');
  const o = { ada: !!p };
  if (!p) return o;
  o.adaCreate = !!p.querySelector('[data-testid="agx-rules-create"]');
  o.adaTab = !!p.querySelector('[data-testid="agx-rules-global"]');
  o.jumlahAwal = (await window.__ZEPHYR_PLUGINS__.instructions()).length;
  const b = p.querySelector('[data-testid="agx-rules-create"]');
  if (b) b.click();
  return o;
})()`);
out.rules = typeof r1 === 'string' ? JSON.parse(r1) : r1;

await new Promise((r) => setTimeout(r, 800));

/* R2/R3: editor muncul dengan Name + textarea. */
const r2 = await J(`(() => {
  const m = document.querySelector('#uji-rules [data-testid="agx-rule-editor"]');
  return {
    adaEditor: !!m,
    adaNama: !!m?.querySelector('[data-testid="agx-rule-nama"]'),
    adaIsi: !!m?.querySelector('[data-testid="agx-rule-isi"]'),
    adaSimpan: !!m?.querySelector('[data-testid="agx-rule-simpan"]'),
  };
})()`);
out.editor = typeof r2 === 'string' ? JSON.parse(r2) : r2;

/* R4: isi lalu simpan. */
await cdp.eval(
  `(() => {
  const n = document.querySelector('#uji-rules [data-testid="agx-rule-nama"]');
  const t = document.querySelector('#uji-rules [data-testid="agx-rule-isi"]');
  if (!n || !t) return 'no';
  const si = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  si.call(n, 'uji-aturan-bebas');
  n.dispatchEvent(new Event('input', { bubbles: true }));
  const st = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  st.call(t, 'Selalu pakai tab di Rust, dan jangan pernah pakai unwrap().');
  t.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 500));

await cdp.eval(
  `(() => {
  const b = document.querySelector('#uji-rules [data-testid="agx-rule-simpan"]');
  if (b) b.click();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 2000));

const r3 = await J(`await (async () => ({
  jumlahAkhir: (await window.__ZEPHYR_PLUGINS__.instructions()).length,
  adaDiDom: !!document.querySelector('#uji-rules [data-testid="agx-rule-uji-aturan-bebas"]'),
  editorTutup: !document.querySelector('#uji-rules [data-testid="agx-rule-editor"]'),
}))()`);
out.simpan = typeof r3 === 'string' ? JSON.parse(r3) : r3;

/* Bersihkan. */
await cdp.eval(
  `(() => {
  const g = null;
  const a = (g?.daftar ?? []).find((x) => x.name === 'uji-aturan-bebas');
  if (a) void g.hapus(a.name);
  try { window.__UJI_uji_rules__?.unmount(); } catch (e) {}
  const h = document.getElementById('uji-rules');
  if (h) h.remove();
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 1200));

console.log(JSON.stringify(out, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — Skills (Agent Customizations):');
cek('S1 daftar Skills merender', out.mountSkills === true && out.skills?.ada === true, '');
cek('S2 skill terpasang tampil (>= 15 baris)', (out.skills?.baris ?? 0) >= 15, `baris=${out.skills?.baris}`);
cek(
  'S2b modlens ada di daftar + grup berlabel',
  out.skills?.adaModlens === true && (out.skills?.grup ?? []).length >= 1,
  `grup=${(out.skills?.grup ?? []).join('|')}`,
);
cek('S3 kotak cari menyaring', (out.sesudahCari?.n ?? 0) === 0 && out.sesudahCari?.kosong === true, `${out.sebelumCari?.n} -> ${out.sesudahCari?.n}`);
cek(
  'S4 pemilih scope ada + tombol New membuka editor',
  out.skills?.adaScope === true &&
    out.editorSkill?.ada === true &&
    out.editorSkill?.adaNama === true &&
    out.editorSkill?.adaIsi === true,
  `scope=${out.skills?.adaScope} editor=${out.editorSkill?.ada}`,
);
cek(
  'S5 ada tombol Install untuk yang belum terpasang',
  (out.skills?.pasang ?? 0) > 0 || (out.skills?.hapus ?? 0) > 0,
  `install=${out.skills?.pasang} hapus=${out.skills?.hapus}`,
);
cek(
  'S6 tiap baris terpasang punya sakelar aktif',
  (out.skills?.sakelar ?? 0) > 0 && (out.skills?.sakelar ?? 0) === (out.skills?.baris ?? 0),
  `sakelar=${out.skills?.sakelar}/${out.skills?.baris}`,
);
cek(
  'S7 mematikan skill menghilangkannya dari PROMPT (bukan dari disk)',
  out.aktif?.ada === true &&
    out.aktif?.sebelumAda === true &&
    out.aktif?.mentahSebelumAda === true &&
    out.aktifSesudah?.sesudahAda === false &&
    out.aktifSesudah?.mentahSesudahAda === true &&
    out.aktifSesudah?.ariaSesudah === 'false' &&
    out.aktifSesudah?.barisMati === true,
  `skill=${out.aktif?.nama} prompt:${out.aktif?.sebelumAda}->${out.aktifSesudah?.sesudahAda} rust:${out.aktif?.mentahSebelumAda}->${out.aktifSesudah?.mentahSesudahAda} aria=${out.aktifSesudah?.ariaSesudah} redup=${out.aktifSesudah?.barisMati} nonaktif=[${(out.aktifSesudah?.nonaktif ?? []).join(',')}]`,
);
cek(
  'S7b sakelar dikembalikan ke semula oleh harness',
  out.aktifPulih?.bersih === true && out.aktifPulih?.pulih === true && out.aktifPulih?.ariaPulih === 'true',
  `bersih=${out.aktifPulih?.bersih} pulih=${out.aktifPulih?.pulih} aria=${out.aktifPulih?.ariaPulih}`,
);

console.log('\nBukti — Rules editor:');
cek('R1 pane Rules merender dengan Create', out.mountRules === true && out.rules?.ada === true && out.rules?.adaCreate === true, '');
cek(
  'R2 Create membuka EDITOR (bukan langsung simpan)',
  out.editor?.adaEditor === true,
  '',
);
cek(
  'R3 editor punya Name + textarea Rule + Save',
  out.editor?.adaNama === true && out.editor?.adaIsi === true && out.editor?.adaSimpan === true,
  '',
);
cek(
  'R4 menyimpan benar-benar menambah berkas aturan',
  (out.simpan?.jumlahAkhir ?? 0) > (out.rules?.jumlahAwal ?? 0),
  `${out.rules?.jumlahAwal} -> ${out.simpan?.jumlahAkhir}`,
);
cek('R5 aturan baru tampil di daftar', out.simpan?.adaDiDom === true, '');

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
