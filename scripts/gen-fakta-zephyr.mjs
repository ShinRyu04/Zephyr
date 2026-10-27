/*
 * gen-fakta-zephyr.mjs - hasilkan src/lib/zephyrFakta.ts
 *
 * Kenapa ada: Zeph (agen di dalam Zephyr) cuma tahu tiga baris tentang dirinya,
 * jadi begitu user bertanya "setelan ini di mana" atau "kenapa X gagal" dia
 * menebak - dan nama setelan yang dikarang lebih merugikan user daripada jujur
 * "saya cek dulu". Blok fakta ini dihasilkan LANGSUNG dari sumber Zephyr
 * (settings.rs, settingsStore.ts, vite.config.ts, mcp_server.rs) supaya isinya
 * tidak bisa menyimpang dari build yang sedang jalan.
 *
 * Pakai:
 *   node scripts/gen-fakta-zephyr.mjs          # tulis ulang src/lib/zephyrFakta.ts
 *   node scripts/gen-fakta-zephyr.mjs --check  # gagal (exit 1) kalau berkas tidak sinkron
 *
 * Sumber tiap bagian ditulis di FAKTA_ZEPHYR_SUMBER, dan harness
 * scripts/verify-fakta-zephyr.mjs memeriksa (a) sinkron, (b) tiap kunci setelan
 * benar-benar muncul di teks.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(akar, p), 'utf8');
const ada = (p) => existsSync(join(akar, p));

/* ---- 1. Setelan: parse default_settings() dari settings.rs ----------------
   Isinya JSON dengan komentar `//` dan koma ekor, jadi dibersihkan dulu. Kalau
   bentuknya berubah sampai tidak bisa di-parse, lebih baik GAGAL terang-terangan
   daripada diam-diam menghasilkan blok fakta yang kosong. */
function setelanDefault() {
  const teks = baca('src-tauri/src/settings.rs');
  const mulai = teks.indexOf('pub fn default_settings()');
  if (mulai < 0) throw new Error('settings.rs: default_settings() tidak ditemukan');
  const buka = teks.indexOf('json!({', mulai) + 'json!('.length;
  let depth = 0;
  let tutup = -1;
  for (let i = buka; i < teks.length; i++) {
    if (teks[i] === '{') depth++;
    else if (teks[i] === '}') {
      depth--;
      if (depth === 0) {
        tutup = i + 1;
        break;
      }
    }
  }
  if (tutup < 0) throw new Error('settings.rs: json!({ ... }) tidak seimbang');
  /* Komentar `//` harus dibuang TANPA menyentuh isi string: nilai setelan memuat
     URL seperti "http://localhost:7777", dan pembersih baris-naif akan memotong
     nilai itu di tengah - JSON.parse lalu gagal pada karakter kontrol. Jadi
     dipindai karakter per karakter dengan status "di dalam string". */
  const buangKomentar = (s) => {
    let keluar = '';
    let dalamString = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (dalamString) {
        keluar += c;
        if (c === '\\') {
          keluar += s[++i] ?? '';
        } else if (c === '"') dalamString = false;
        continue;
      }
      if (c === '"') {
        dalamString = true;
        keluar += c;
        continue;
      }
      if (c === '/' && s[i + 1] === '/') {
        while (i < s.length && s[i] !== '\n') i++;
        keluar += '\n';
        continue;
      }
      keluar += c;
    }
    return keluar;
  };
  const blok = buangKomentar(teks.slice(buka, tutup)).replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(blok);
}

/* ---- 2. Halaman setelan yang benar-benar ada di nav ---------------------- */
/* Dipisah dari penafsirannya supaya blok pop-up (2b) bisa memeriksa hal yang
   sama tanpa saling memanggil bolak-balik. */
function daftarSeksi() {
  const teks = baca('src/lib/settingsStore.ts');
  const nav = /SECTION_ORDER:\s*SectionId\[\]\s*=\s*\[([^\]]*)\]/.exec(teks);
  const tipe = /export type SectionId\s*=([^;]*);/.exec(teks);
  if (!nav || !tipe) throw new Error('settingsStore.ts: SECTION_ORDER/SectionId tidak ditemukan');
  const ambil = (s) => [...s.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  return { teks, diNav: ambil(nav[1]), semua: ambil(tipe[1]) };
}

/* ---- 2b. Pop-up setelan yang BERDIRI SENDIRI (bukan halaman Settings) ----
   "AI Models" dulu sebuah halaman Settings; sekarang pop-up sendiri, karena
   pembacanya membutuhkannya tepat saat chat di depannya gagal (401 / kunci
   belum diisi) - bukan setelah menyeberangi jendela ke halaman Settings.

   Fakta lama menyebutnya "seksi Chat Settings", dan itu tempat yang SALAH:
   user dikirim berburu ke sana. Yang dibaca di sini bukan cuma nama berkasnya:
   judul pop-up (kunci setelan yang dipakai modal), komponen seksi yang
   dirender, grup setelan yang diaturnya, dan SETIAP pintu masuk (berkas yang
   benar-benar memanggil buka()). Nama berkas yang dihapus, pintu yang ditambah,
   dan grup setelan yang hilang sama-sama membuat generator GAGAL - bukan
   diam-diam menghasilkan kalimat yang menunjuk tempat yang salah. */
/* Pola "pintu masuk AI Models". Sejak 1.1.14 permukaan ini jendela OS, jadi
   pintunya memanggil `bukaPanel('models')`, BUKAN `useAiModels.getState().buka()`
   lagi. Kedua bentuk diterima supaya fakta tidak menunjuk tempat yang salah dan
   generator tidak gagal hanya karena pemanggilnya berpindah API. */
const POLA_PINTU_MODELS = /(?:bukaPanel\(\s*['"]models['"]\s*\)|useAiModels\.getState\(\)\.buka\(\))/;

const PINTU_POPUP = [
  {
    /*
     * Jendela Agents punya pintunya sendiri: peringatan "provider belum punya
     * API key" di layar awal composer menawarkan tombol AI Models. Itu pintu
     * yang benar (bukan Settings), dan karena komponennya memanggil
     * `bukaPanel('models')`, penjaga generator menuntutnya terdaftar di sini.
     */
    berkas: 'src/components/agents/AgentsComposer.tsx',
    kunci: 'AI Models',
    testid: 'agx-nokey-buka',
    tempat: 'the "AI Models" button on the missing-key warning under the Agents composer',
  },
  {
    berkas: 'src/components/ai/AiPanel.tsx',
    kunci: 'Open AI Models',
    testid: 'ai-nokey-open',
    tempat: 'the "Open AI Models" button on the 401 / missing-key notice in the chat panel',
  },
  {
    berkas: 'src/components/ai/ModelSelector.tsx',
    kunci: 'Add Model',
    tempat: 'the model dropdown (the full-width "Add Model" button at its foot)',
  },
  {
    /*
     * The subagent form's picker is a SECOND door, and it opens the same pop-up.
     * It was always a real way in; it simply was not counted until it started
     * matching the pattern by calling `bukaPanel('models')` directly.
     */
    berkas: 'src/components/ai/ModelMenu.tsx',
    kunci: 'Add Model',
    tempat: 'the subagent model picker (its "Add Model" button)',
  },
  {
    berkas: 'src/components/ai/ChatHeadActions.tsx',
    testid: 'ai-open-models',
    tempat: 'the "AI Models" row in the chat panel\'s "..." menu',
  },
  /*
   * `tunjuk` opens the same pop-up for "where do I put my API key". It is a real
   * door the reader reaches (the tool opens the pop-up for them), and it calls
   * `useAiModels.getState().buka()`, so the generator counts it - the table has
   * to as well or the fact block would omit a door that exists.
   */
  { berkas: 'src/lib/zephyrTools/tunjuk.ts', tempat: 'the `tunjuk` tool, when the reader asks where their API key goes' },
  { berkas: 'src/lib/commandRegistry.ts', perintah: true },
];

/* Berkas yang cuma masuk karena pop-up di atas: judulnya, komponen yang
   dirender, tempat menyimpan keadaan buka/tutup, kamus yang memuat judulnya, dan
   tiap pintu masuknya. Didaftarkan sekali di sini supaya daftar sumber di berkas
   hasil, dan hash sumber, tidak bisa ketinggalan saat pop-up-nya berubah. */
const SUMBER_POPUP = [
  'src/components/settings/AiModelsModal.tsx',
  'src/components/settings/SectionsAdvanced.tsx',
  'src/lib/aiModelsStore.ts',
  'src/lib/i18n.ts',
  ...PINTU_POPUP.map((p) => p.berkas),
];

/* Label dari src/lib/i18n.ts: berkas itu TIDAK ikut indeks label (kunci kamus
   di sana adalah label Setelan sendiri, sumbernya i18n-src/i18n-extra), tapi
   judul pop-up dibaca dari sana supaya blok inti menyebut nama yang benar-benar
   tampil di layar - bukan tebakan dari id seksi. */
function labelKamusI18n(kunci) {
  const potongan = baca('src/lib/i18n.ts')
    .replace(/\r/g, '')
    .split(/const\s+([A-Z]{2})\s*:\s*(?:Dict|Record<string,\s*string>)\s*=\s*\{/);
  for (let i = 1; i < potongan.length; i += 2) {
    if (potongan[i] !== 'EN') continue;
    const peta = pasanganKamus(potongan[i + 1] ?? '');
    if (peta.has(kunci)) return peta.get(kunci);
  }
  return null;
}

/* Perintah palet yang membuka pop-up: dicari dari BADAN perintahnya (`run:`),
   bukan dari judulnya, supaya id yang disebut fakta benar-benar milik perintah
   yang membuka pop-up itu. */
function pintuPerintahPopup(judul) {
  const teks = baca('src/lib/commandRegistry.ts');
  const batas = [...teks.matchAll(/\{\s*id:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*group:\s*'([^']+)'/g)];
  const pembuka = batas.filter((m, i) =>
    POLA_PINTU_MODELS.test(teks.slice(m.index, batas[i + 1]?.index ?? teks.length)),
  );
  if (pembuka.length !== 1)
    throw new Error(
      `commandRegistry.ts: harus TEPAT SATU perintah palet yang membuka pop-up "${judul}"; terbaca ${pembuka.length}`,
    );
  return { id: pembuka[0][1], judul: untaikan(pembuka[0][2]) };
}

function popupSetelan() {
  /*
   * AI Models is an OS WINDOW now, not an in-app modal.
   *
   * The surface moved to `#panel=models` (PanelWindow) as part of 1.1.14, and
   * `AiModelsModal.tsx` was deleted with the other in-app popups. The old check
   * here demanded the modal file and threw when it was gone - which broke the
   * release build for a file that was removed ON PURPOSE.
   *
   * What has to hold now is the pair that still exists: the store that owns the
   * settings, and the section component the window renders. The section is the
   * part that says which i18n key titles it, so the facts below keep pointing at
   * a real component rather than a remembered path.
   */
  const store = 'src/lib/aiModelsStore.ts';
  const seksi = 'src/components/settings/SectionsAdvanced.tsx';
  if (!ada(store)) return null;
  if (!ada(seksi))
    throw new Error(`pop-up setelan tidak utuh: ${store} ada, ${seksi} tidak - tempat setelan ini tidak boleh ditebak`);

  const isiSeksi = baca(seksi);

  /* Which `settings.<key>` titles the AI Models section, read from the section
     component itself. Exactly one, so the fact cannot name a section that does
     not own the store. */
  const id = [...new Set([...isiSeksi.matchAll(/tr\('settings\.(models|aimodels|ai)'\)/g)].map((m) => m[1]))];
  if (id.length !== 1)
    throw new Error(
      `${seksi}: seksi AI Models harus memakai TEPAT SATU kunci setelan (settings.models); terbaca: ${id.join(', ') || '(tidak ada)'}`,
    );
  const seksiId = id[0];
  const judul = labelKamusI18n(`settings.${seksiId}`);
  if (!judul) throw new Error(`src/lib/i18n.ts: label 'settings.${seksiId}' tidak ketemu`);

  const komponen = /export function ([A-Za-z0-9_]+)\s*\(/.exec(isiSeksi)?.[1];
  if (!komponen) throw new Error(`${seksi}: komponen seksi tidak terbaca`);
  if (!new RegExp(`export function ${komponen}\\b`).test(isiSeksi))
    throw new Error(`${seksi}: ${komponen} tidak ada`);

  /* Pop-up hanya boleh mengklaim seksi yang MEMANG sudah keluar dari Settings,
     dan komentar settingsStore.ts harus tetap menyebut perpindahannya: dua
     sumber ini yang menjaga fakta lama ("seksi Settings" / "seksi Chat
     Settings") tidak bisa kembali diam-diam. */
  const { teks, diNav, semua } = daftarSeksi();
  if (semua.includes(seksiId) || diNav.includes(seksiId))
    throw new Error(`settingsStore.ts: \`${seksiId}\` masih terdaftar sebagai seksi Settings - bukan pop-up berdiri sendiri lagi`);
  /*
   * The store comment must still name the surface that owns this section. It used
   * to name the deleted modal file; the surface is now the `models` panel window,
   * so the check asks for the PANEL id - the thing that actually exists and that
   * `bukaPanel('models')` routes to.
   */
  const namaPermukaan = 'models';
  if (!teks.includes(`\`${seksiId}\``) || !teks.includes(namaPermukaan))
    throw new Error(
      `settingsStore.ts: komentarnya tidak lagi menyebut \`${seksiId}\` pindah ke panel ${namaPermukaan} - sumber kebenarannya berubah?`,
    );

  const grup = setelanDefault()[seksiId];
  if (!grup || typeof grup !== 'object' || Array.isArray(grup))
    throw new Error(`settings.rs: grup setelan \`${seksiId}\` tidak ada, padahal panel ${namaPermukaan} mengaturnya`);

  /* Pintu masuk dihitung dari kode - berkas yang benar-benar memanggil buka() -
     lalu dicocokkan dengan tabel di atas. Pintu yang ditambah atau dihapus
     mengubah fakta yang dibaca model, jadi perubahannya harus disengaja. */
  const pemanggil = [];
  /* Berkas HASIL generate sendiri dikecualikan: blok fakta yang ditulis dari
     sini memuat contoh kode `useAiModels.getState().buka()` di dalam
     kalimatnya, jadi tanpa pengecualian ini output-nya menghitung dirinya
     sendiri sebagai pintu masuk - dan generator gagal terus setelah menulis. */
  const HASIL_SENDIRI = new Set(['zephyrFakta.ts', 'zephyrIndeks.ts']);
  /*
   * `devBridge.ts` MENGEKSPOS `buka()` supaya harness CDP bisa membuka pop-up.
   * Itu bukan pintu masuk yang dilihat pembaca, dan menghitungnya sebagai pintu
   * akan membuat fakta menyebut "dipanggil dari devBridge" - kalimat yang tidak
   * berguna bagi model maupun pembaca. Alasannya sama dengan HASIL_SENDIRI di
   * atas: berkas yang menyebut `buka()` sebagai JEMBATAN, bukan sebagai tombol.
   */
  const JEMBATAN = new Set(['devBridge.ts']);
  const telusuri = (rel) => {
    for (const e of readdirSync(join(akar, rel), { withFileTypes: true })) {
      if (['node_modules', 'dist', 'target', '__snapshots__'].includes(e.name)) continue;
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) telusuri(r);
      else if (
        /\.(ts|tsx)$/.test(e.name) &&
        !HASIL_SENDIRI.has(e.name) &&
        !JEMBATAN.has(e.name) &&
        r !== store &&
        POLA_PINTU_MODELS.test(baca(r))
      )
        pemanggil.push(r);
    }
  };
  telusuri('src');
  pemanggil.sort();
  const resmi = PINTU_POPUP.map((p) => p.berkas).sort();
  if (pemanggil.join() !== resmi.join())
    throw new Error(
      `pintu masuk pop-up "${judul}" berubah:\n  dipanggil dari : ${pemanggil.join(', ') || '(tidak ada)'}\n` +
        `  tabel generator: ${resmi.join(', ')}\n  Perbarui PINTU_POPUP supaya fakta menyebut pintu yang benar.`,
    );

  const pintu = PINTU_POPUP.map((p) => {
    const isi = baca(p.berkas);
    if (p.testid && !isi.includes(`data-testid="${p.testid}"`))
      throw new Error(`${p.berkas}: data-testid="${p.testid}" tidak ada lagi, padahal itu pintu pop-up "${judul}"`);
    if (p.kunci && !isi.includes(`tr('${p.kunci}')`))
      throw new Error(`${p.berkas}: label tr('${p.kunci}') tidak ada lagi, padahal itu pintu pop-up "${judul}"`);
    return { berkas: p.berkas, perintah: !!p.perintah, tempat: p.tempat };
  });
  const palet = pintuPerintahPopup(judul);
  for (const p of pintu) if (p.perintah) p.tempat = `the command palette command "${palet.judul}" (id ${palet.id})`;
  if (pintu.some((p) => !p.tempat))
    throw new Error(`pop-up "${judul}": ada pintu masuk yang belum punya keterangan tempat`);

  return {
    id: seksiId,
    judul,
    /* The surface that renders this section: the panel window, not a deleted
       modal. Facts generated from here must point at something that exists. */
    berkas: seksi,
    berkasStore: store,
    komponen,
    grup: Object.keys(grup),
    pintu: pintu.map(({ berkas, tempat }) => ({ berkas, tempat })),
  };
}

function seksiSetelan() {
  const { teks, diNav, semua } = daftarSeksi();
  const popup = popupSetelan();

  /* Seksi Setelan yang SUDAH PINDAH keluar dari nav.
     Dulu ini terbaca sendiri dari `SectionId` dikurangi `SECTION_ORDER`, dan itu
     tepat selama seksi yang pindah masih ikut ditulis di union-nya. SETELAN-PINDAH
     membuang `agents`, `rules`, `subagent` dan `permissions` dari union itu juga,
     jadi beda dua daftar tadi menyusut jadi `mcp` saja - dan blok fakta berhenti
     menyebut tempat yang sebenarnya: AI lalu mengirim user berburu di nav Setelan
     untuk setelan yang memang sudah tidak ada di sana.
     Yang MENYATAKAN perpindahan itu sekarang komentar settingsStore.ts sendiri
     ("... are NOT here", "... are NOT in the nav order any more", "... left the
     nav earlier", "... USED TO SIT HERE and no longer does"), jadi yang dibaca
     KALIMATNYA. Kalimat yang menyebut seksi yang dibuang TOTAL - `voice` dan
     `mic`, "left the type entirely" - memakai kata yang lain dan memang tidak
     ikut, karena tidak ada panel yang bisa ditunjuk untuknya.
     Urutan `tanpaNav` mengikuti urutan `SectionId`, supaya blok fakta dan indeks
     menyebut seksi-seksi itu seperti sumbernya mendaftarkannya. */
  const pindah = [
    ...new Set(
      [
        ...teks.matchAll(
          /([^\n;.]*?)\b(?:NOT\s+here|NOT\s+in\s+the\s+nav(?:\s+order)?|left\s+the\s+nav|no\s+longer\s+does)\b/g,
        ),
      ].flatMap((m) => [...m[1].matchAll(/`([a-z]+)`/g)].map((x) => x[1])),
    ),
  ];
  if (!pindah.length)
    throw new Error('settingsStore.ts: tidak ada seksi yang dinyatakan pindah dari nav (komentarnya berubah?)');
  /* Dibagi dua, karena dua tempatnya memang berbeda dan fakta tidak boleh
     menyamakan keduanya:
     - `keluar`: TIDAK lagi seksi Setelan sama sekali (keluar dari union
       `SectionId`) - rumahnya pop-up tabel 2b (kalau tidak dikenal: GAGAL);
     - `tanpaNav`: masih seksi Setelan, cuma kehilangan barisnya di nav. */
  const keluar = pindah.filter((p) => !semua.includes(p));
  /* Seksi yang keluar dari Setelan sama sekali HARUS punya rumah yang bisa
     ditunjuk. Tanpa pemeriksaan ini, mencabut angka dari union membuat blok
     fakta diam-diam berhenti menyebut setelan itu - dan AI kembali mengarang.
     Rumah yang dikenal generator sekarang cuma tabel pop-up di 2b; seksi lain
     yang keluar dari Settings (mis. ke Chat Settings) harus diajarkan dulu di
     sini, bukan diam-diam hilang dari fakta. */
  const takBerumah = keluar.filter((p) => p !== popup?.id);
  if (takBerumah.length)
    throw new Error(
      `settingsStore.ts menyatakan ${takBerumah.join(', ')} bukan lagi seksi Settings, tetapi generator tidak tahu rumah barunya ` +
        '(tabel pop-up di 2b belum mengenalnya)',
    );
  const tanpaNav = semua.filter((s) => !diNav.includes(s));
  /* Dua arah: komentar "pindah dari nav" harus cocok dengan `SectionId` minus
     `SECTION_ORDER`. Kalau tidak, salah satu sumbernya berubah dan daftar di
     blok fakta sudah tidak bisa dipercaya. */
  const diNavHilang = semua.filter((s) => !diNav.includes(s));
  const pindahDiTipe = pindah.filter((p) => semua.includes(p));
  const beda = [
    ...new Set([
      ...diNavHilang.filter((s) => !pindahDiTipe.includes(s)),
      ...pindahDiTipe.filter((s) => !diNavHilang.includes(s)),
    ]),
  ];
  if (beda.length)
    throw new Error(
      `settingsStore.ts: komentar "pindah dari nav" tidak cocok dengan SectionId/SECTION_ORDER untuk: ${beda.join(', ')}`,
    );
  return { diNav, semua, pindah, keluar, tanpaNav, hanyaChat: [...tanpaNav], popup };
}

/* ---- 3. Daftar shortcut bawaan (src/lib/shortcuts.ts) --------------------
   Keymap adalah pertanyaan yang paling sering muncul ("shortcut X apa?"), dan
   jawaban yang dikarang di sini langsung salah kalau user sudah mengubahnya.
   Jadi yang dicatat adalah NILAI BAWAAN, dengan catatan bahwa user bisa
   menggantinya di Settings > Shortcuts. */
function shortcutBawaan() {
  const teks = baca('src/lib/shortcuts.ts');
  const daftar = /export const ACTIONS[^=]*=\s*\[(.*?)\n\];/s.exec(teks);
  if (!daftar) throw new Error('shortcuts.ts: ACTIONS[] tidak ditemukan');
  const baris = [...daftar[1].matchAll(/\{[^}]*id:\s*'([^']+)'[^}]*label:\s*'([^']*)'[^}]*group:\s*'([^']*)'[^}]*default:\s*'([^']*)'[^}]*\}/g)];
  if (!baris.length) throw new Error('shortcuts.ts: tidak ada entri yang bisa dibaca');
  return baris.map((m) => ({ id: m[1], label: m[2], grup: m[3], tombol: m[4] }));
}

/* ---- 4. Seksi Chat Settings (src/components/ai/ChatSettingsPage.tsx) ----- */
function seksiChat() {
  const teks = baca('src/components/ai/ChatSettingsPage.tsx');
  /* `SECTIONS` changed shape: it used to be `const SECTIONS = [...] as const;`,
     and it is now a typed declaration (`const SECTIONS: ReadonlyArray<{ id:
     ChatSeksi; label: string }> = [...]`). The derivation reads the ARRAY, not
     the annotation, so it matches the assignment and closes on the array's own
     `];` - which keeps working for both shapes. */
  const daftar = /const SECTIONS[^=]*=\s*\[([\s\S]*?)\];/.exec(teks);
  if (!daftar) throw new Error('ChatSettingsPage.tsx: SECTIONS tidak ditemukan');
  return [...daftar[1].matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*label:\s*'([^']*)'\s*\}/g)].map((m) => `${m[2]}`);
}

/* ---- 5. Port: vite (UI dev) dan port yang direservasi WebView2 ---------- */
function portDev() {
  const vite = /port:\s*(\d+)/.exec(baca('vite.config.ts'));
  const cadangan = /PORT_DILARANG:\s*u16\s*=\s*(\d+)/.exec(baca('src-tauri/src/mcp_server.rs'));
  if (!vite || !cadangan) throw new Error('port vite.config.ts / PORT_DILARANG tidak ditemukan');
  return { vite: vite[1], cdp: cadangan[1] };
}

/* ---- 6. Nama bridge dev di `window` -------------------------------------
   Agen ini JALAN DI DALAM Zephyr, dan di build dev app-nya memasang bridge
   `window.__ZEPHYR_*__` yang membaca store yang sama dengan UI - jadi
   pertanyaan soal keadaan app bisa dijawab dari situ, bukan ditebak. Nama-namanya
   dibaca dari devBridge.ts; kalau tidak ada satu pun yang ketemu, generator GAGAL
   terang-terangan, karena blok fakta yang menyebut bridge yang tidak ada lebih
   merugikan user daripada tidak menyebutnya. */
function namaBridge() {
  const teks = baca('src/lib/devBridge.ts');
  const nama = [...teks.matchAll(/\bw\.(__ZEPHYR_[A-Z0-9_]*__)\s*=/g)].map((m) => m[1]);
  const unik = [...new Set(nama)].sort();
  if (!unik.length) throw new Error('devBridge.ts: tidak ada bridge __ZEPHYR_*__ yang ditemukan');
  return unik;
}

/* ---- 7. Kamus antarmuka: label dari i18n.ts, i18n-src.ts, i18n-extra.ts ---
   Pertanyaan \"label tombolnya persis apa\" tidak bisa dijawab dari blok inti:
   menaruh ribuan label di sana membuat prompt menggelembung dan menelan biaya
   tiap giliran. Jadi label masuk INDEKS (dicari saat ditanya), sementara blok
   inti cuma menyimpan aturan cara menjawabnya.

   Sumbernya dua berkas kamus, dan keduanya memakai KUNCI yang berbeda arah:
   i18n-src.ts memakai teks sumber sebagai kunci dengan padanan Inggris sebagai
   nilai, sedangkan i18n-extra.ts memakai kunci Inggris dengan nilai sepuluh
   bahasa antarmuka. Karena itu yang dicatat adalah KEDUA sisi: kunci dan nilai
   sama-sama bisa jadi kata yang dicari user. */
function untaikan(s) {
  return String(s).replace(/\\(['\"\\])/g, '$1');
}

function pasanganKamus(segmen) {
  const keluar = new Map();
  /* Satu baris boleh memuat lebih dari satu pasangan (pernah kejadian: penambahan
     kunci ditempelkan di ujung baris terakhir sebuah kamus). Pola yang mensyaratkan
     satu pasangan per baris akan melewati kunci seperti itu tanpa suara - dan kunci
     yang tak masuk indeks berarti AI menjawab "tidak tahu" untuk label yang ada.
     Jadi batasnya bukan akhir baris, tapi awal baris / setelah `,` atau `{`. */
  const re =
    /(?:^|[,{])\s*(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")\s*:\s*(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")/gm;
  for (const m of segmen.matchAll(re)) {
    const kunci = untaikan(m[1] ?? m[2] ?? '');
    const nilai = untaikan(m[3] ?? m[4] ?? '');
    if (kunci) keluar.set(kunci, nilai);
  }
  return keluar;
}

function labelAntarmuka() {
  const peta = new Map();
  const catat = (kunci, kode, nilai) => {
    if (!peta.has(kunci)) peta.set(kunci, { en: '', id: '', lain: new Set() });
    const e = peta.get(kunci);
    if (kode === 'EN') e.en = nilai;
    else if (kode === 'ID') e.id = nilai;
    else e.lain.add(kode);
  };
  const kumpulkan = (berkas) => {
    const teks = baca(berkas);
    const potongan = teks.split(/const\s+([A-Z]{2})\s*:\s*(?:Dict|Record<string,\s*string>)\s*=\s*\{/);
    /* Hasil split: [pembuka, KODE, isi, KODE, isi, ...] */
    if (potongan.length < 3) throw new Error(`${berkas}: kamus per bahasa tidak terbaca`);
    let n = 0;
    for (let i = 1; i < potongan.length; i += 2) {
      const kode = potongan[i];
      for (const [k, v] of pasanganKamus(potongan[i + 1] ?? '')) {
        catat(k, kode, v);
        n++;
      }
    }
    if (!n) throw new Error(`${berkas}: tidak ada pasangan kunci:nilai yang terbaca`);
    return n;
  };
  /* TIGA berkas kamus, bukan dua. `i18n.ts` adalah kamus yang PALING dulu dipakai
     runtime (`DICTS`), dan sebagian kuncinya tidak ada di dua berkas lain - justru
     kunci itulah yang dipakai layar Setelan (`settings.general`, `settings.editor`,
     ... lewat `NAV_KEY` di SettingsNav.tsx). Selama ia tidak dipanen, pertanyaan
     \"halaman Setelan Umum yang mana\" cuma bisa dijawab dari tebakan.
     Urutannya mengikuti prioritas runtime: `translate()` mendahulukan kamus
     tambahan (i18n-extra) di atas DICTS, jadi yang TERAKHIR dipanen = yang menang
     saat sebuah kunci punya nilai berbeda di dua berkas. */
  const jumlahI18n = kumpulkan('src/lib/i18n.ts');
  const jumlahSrc = kumpulkan('src/lib/i18n-src.ts');
  const jumlahExtra = kumpulkan('src/lib/i18n-extra.ts');
  if (peta.size < 100) throw new Error(`kamus antarmuka: cuma ${peta.size} kunci unik terbaca`);
  JUMLAH_KAMUS.i18n = jumlahI18n;
  JUMLAH_KAMUS.src = jumlahSrc;
  JUMLAH_KAMUS.extra = jumlahExtra;
  return { peta, jumlahI18n, jumlahSrc, jumlahExtra };
}

/* ---- 8. Perintah palet (command palette) --------------------------------
   \"Perintah X namanya apa / ada id-nya apa\" dijawab dari daftar yang benar-
   benar didaftarkan, bukan dari ingatan. */
function perintahPalet() {
  const teks = baca('src/lib/commandRegistry.ts');
  const re =
    /\{\s*id:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*group:\s*'([^']+)'/g;
  const daftar = [...teks.matchAll(re)].map((m) => ({
    id: m[1],
    judul: untaikan(m[2]),
    grup: m[3],
  }));
  if (daftar.length < 50) throw new Error(`commandRegistry.ts: cuma ${daftar.length} perintah terbaca`);
  return daftar;
}

/* ---- 9. Tool: perilaku dari catalog.ts, deskripsi dari deskripsiTool.ts --- */
function toolKatalog() {
  const katalog = baca('src/lib/zephyrTools/catalog.ts');
  const deskripsiTeks = baca('src/lib/zephyrTools/deskripsiTool.ts');
  const m = /export const DESKRIPSI_TOOL_ID: Record<string, string> = \{([\s\S]*?)\n\};/.exec(
    deskripsiTeks,
  );
  if (!m) throw new Error('deskripsiTool.ts: DESKRIPSI_TOOL_ID tidak ditemukan');
  const deskripsi = pasanganKamus(m[1]);
  const re =
    /^\s*\['([a-zA-Z0-9_]+)',\s*'([^']+)',\s*'(read|net|netWrite|appWrite|fsWrite|exec)',\s*(true|false),/gm;
  const daftar = [...katalog.matchAll(re)].map((x) => ({
    nama: x[1],
    grup: x[2],
    efek: x[3],
    izin: x[4] === 'true',
  }));
  if (daftar.length < 30) throw new Error(`catalog.ts: cuma ${daftar.length} baris tool terbaca`);
  return daftar.map((t) => ({ ...t, deskripsi: deskripsi.get(t.nama) ?? '' }));
}

/* ---- 10. Ekstensi bawaan (marketplace yang ikut aplikasi) ---------------- */
function ekstensiBundel() {
  const teks = baca('src/lib/extCatalog.ts');
  const mulai = teks.indexOf('export const KATALOG_BUNDLED');
  if (mulai < 0) throw new Error('extCatalog.ts: KATALOG_BUNDLED tidak ditemukan');
  const blok = teks.slice(mulai);
  const re =
    /\{\s*id:\s*'([^']+)',\s*name:\s*'((?:[^'\\]|\\.)*)'[^}]*?categories:\s*\[([^\]]*)\]/g;
  const daftar = [...blok.matchAll(re)].map((m) => ({
    id: m[1],
    nama: untaikan(m[2]),
    kategori: [...m[3].matchAll(/'([^']+)'/g)].map((x) => x[1]).join('/'),
  }));
  if (!daftar.length) throw new Error('extCatalog.ts: tidak ada entri terbaca');
  return daftar;
}

/* ---- 11. Dokumen yang dikirim bersama app, dipecah per judul ------------- */
function dokumenBundel() {
  const berkas = [
    'README.md',
    'ARCHITECTURE.md',
    'AGENTS.md',
    'CHANGELOG.md',
    'docs/ATURAN-KERJA.md',
    'docs/cara-pasang-plugin.md',
    'docs/rekomendasi-suara-lokal.md',
  ];
  for (const n of readdirSync(akar)
    .filter((f) => /^RELEASE_NOTES.*\.md$/.test(f))
    .sort())
    berkas.push(n);
  const potongan = [];
  for (const nama of berkas) {
    let isi = '';
    try {
      isi = baca(nama);
    } catch {
      continue;
    }
    if (!isi.trim()) continue;
    let judul = '(tanpa judul)';
    let buf = [];
    const tutup = () => {
      const teks = buf.join('\n').trim();
      if (teks) potongan.push({ nama, judul, teks });
      buf = [];
    };
    for (const baris of isi.split(/\r?\n/)) {
      const h = /^#{1,3}\s+(.*)$/.exec(baris);
      if (h) {
        tutup();
        judul = h[1].trim();
        continue;
      }
      buf.push(baris);
    }
    tutup();
  }
  if (potongan.length < 10) throw new Error(`dokumen bundel: cuma ${potongan.length} potongan terbaca`);
  return potongan;
}

/* ---- 12. Peta kode: berkas -> simbol + ringkasan -------------------------
   \"Fitur X diimplementasikan di mana\" harus dijawab tanpa folder user. Yang
   ikut bundel adalah PETA-nya (berkas, simbol yang diekspor, ringkasan satu
   baris), bukan isi berkasnya: ini yang menjawab \"di mana\", dan untuk \"isi
   lengkapnya apa\" jawabannya jujur di tool: berkas sumber tidak ikut bundel. */
function ringkasanBerkas(isi) {
  const blok = /^\s*\/\*\*?([\s\S]*?)\*\//.exec(isi) ?? /^((?:\s*\/\/[^\n]*\n)+)/.exec(isi);
  if (!blok) return '';
  const baris = blok[1]
    .split(/\r?\n/)
    .map((b) => b.replace(/^\s*\/?\*+\s?/, '').trim())
    .filter((b) => b && !b.startsWith('@'));
  const pilih = baris.find((b) => !/^SPDX|^Copyright/i.test(b) && b.length > 12) ?? baris[0] ?? '';
  return pilih.length > 200 ? `${pilih.slice(0, 197)}...` : pilih;
}

function petaKode() {
  const daftarBerkas = [];
  /* Keluaran generator ini sendiri TIDAK boleh masuk peta kode. Kalau ikut, isi
     berkas hasil berubah tiap kali digenerate (jumlah baris, teks), sehingga
     entri peta kode untuk berkas itu ikut berubah -> hasil generate tidak stabil
     dan `--check` gagal terus walau sumbernya belum berubah. */
  const HASIL_SENDIRI = new Set(['zephyrFakta.ts', 'zephyrIndeks.ts']);
  const telusuri = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== 'target' && e.name !== '__snapshots__') telusuri(p);
      } else if (/\.(ts|tsx|rs)$/.test(e.name) && !HASIL_SENDIRI.has(e.name)) daftarBerkas.push(p);
    }
  };
  telusuri(join(akar, 'src'));
  telusuri(join(akar, 'src-tauri', 'src'));
  const hasil = [];
  for (const p of daftarBerkas.sort()) {
    const rel = relative(akar, p).split('\\').join('/');
    let isi = '';
    try {
      isi = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    const simbol = [];
    const re =
      /^\s*export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)|^\s*pub\s+(?:async\s+)?(?:fn|struct|enum|trait|const|type)\s+([A-Za-z_][\w]*)/gm;
    for (const m of isi.matchAll(re)) simbol.push(m[1] ?? m[2]);
    const unik = [...new Set(simbol)];
    const ringkas = ringkasanBerkas(isi);
    /* Berkas tanpa ekspor & tanpa ringkasan TETAP didaftarkan: pertanyaannya
       "fitur ini ada di berkas mana", dan berkas yang tidak punya ekspor tetap
       jawaban yang benar untuk berkas itu. Yang tidak boleh terjadi adalah ada
       berkas sumber yang tidak muncul sama sekali di indeks. */
    hasil.push({ rel, ringkas, simbol: unik, baris: isi.split('\n').length });
  }
  if (hasil.length < 50) throw new Error(`peta kode: cuma ${hasil.length} berkas terbaca`);
  return hasil;
}

/* ---- 13. Menu bar Zephyr: judul menu + tiap itemnya (src/lib/menu.ts) -----
   Menu bar adalah permukaan yang paling sering ditanya dalam bentuk \"perintah X
   ada di menu mana\" / \"menu View isinya apa\", dan jawabannya ADA di aplikasi:
   `MENUS` di menu.ts memuat judul menu, tombol Alt-nya, dan tiap item beserta
   id perintahnya. Sebelum ini indeks cuma mengenal id perintah (kategori
   `perintah`) tanpa tahu ia dipasang di menu mana - jadi pertanyaan soal menu
   dijawab dari tebakan walaupun jawabannya ada di bundle.

   Bentuk sumbernya bersarang (submenu lewat `children`), jadi pembacaannya
   memakai SEGMEN per judul menu: tiap judul membuka segmen yang berakhir di
   judul berikutnya, dan item dibaca di dalam segmen itu sendiri - begitulah
   item sebuah menu tidak pernah bocor ke menu lain. */
function menuBar() {
  const teks = baca('src/lib/menu.ts');
  const blok = /export const MENUS[^=]*=\s*\[([\s\S]*)\n\];/.exec(teks);
  if (!blok) throw new Error('menu.ts: MENUS[] tidak ditemukan');
  const badan = blok[1];
  /* Komentar di antara `label` dan `items` bukan hiasan: menu File memakai
     komentar tepat di sana, dan pola yang menuntut `items:` persis setelah
     `mnemonic:` melewati menu itu TANPA SUARA - beserta seluruh itemnya. */
  const kepala = [
    ...badan.matchAll(/label:\s*'((?:[^'\\]|\\.)*)',\s*mnemonic:\s*'([^']+)',(?:[^\n]*\n)*?:?\s*items:\s*\[/g),
  ];
  if (kepala.length < 6) throw new Error(`menu.ts: cuma ${kepala.length} judul menu terbaca`);
  const menu = [];
  for (let i = 0; i < kepala.length; i++) {
    const segmen = badan.slice(kepala[i].index, i + 1 < kepala.length ? kepala[i + 1].index : badan.length);
    const item = [
      ...segmen.matchAll(/\{\s*label:\s*'((?:[^'\\]|\\.)*)',\s*(?:command:\s*'([^']+)'|(children):)/g),
    ].map((m) => ({ label: untaikan(m[1]), command: m[2] ?? '', submenu: Boolean(m[3]) }));
    if (!item.length) throw new Error(`menu.ts: menu \`${kepala[i][1]}\` tidak punya item yang terbaca`);
    menu.push({ label: untaikan(kepala[i][1]), mnemonic: kepala[i][2], item });
  }
  const total = menu.reduce((n, m) => n + m.item.length, 0);
  if (total < 60) throw new Error(`menu.ts: cuma ${total} item menu terbaca`);
  return menu;
}

/* ---- 14. Panel, tab, dan tampilan (panelStore + aiTabsStore + ActivityBar) -
   \"Panel apa saja yang ada\" dan \"tampilan X tombolnya di mana\" punya jawaban
   pasti di sumber: `PANEL_TABS` (daftar tab panel bawah), `CLI_TABS` (tab CLI
   di panel AI), dan `LABEL`/`ORDER` di ActivityBar (ikon sidebar beserta
   urutannya di rel). Kuncinya labelnya sendiri, karena itulah yang dilihat dan
   disebut user; id internalnya ikut di teks supaya pencarian lewat id juga
   sampai. */
function panelTampilan() {
  const panel = baca('src/lib/panelStore.ts');
  const blokPanel = /export const PANEL_TABS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(panel);
  if (!blokPanel) throw new Error('panelStore.ts: PANEL_TABS[] tidak ditemukan');
  const tab = [
    ...blokPanel[1].matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'([^']*)',\s*command:\s*'([^']+)'\s*\}/g),
  ].map((m) => ({ id: m[1], label: m[2], command: m[3] }));
  if (tab.length < 4) throw new Error(`panelStore.ts: cuma ${tab.length} tab panel terbaca`);

  const ai = baca('src/lib/aiTabsStore.ts');
  /*
   * The tab list is now `TAB_PANEL` + a `cliTabs()` builder, not a literal
   * `CLI_TABS[]` array. Reading the CONSTANT is still the right thing: it is the
   * closed list of CLIs that get a tab in the AI panel, and the labels come from
   * `list_agents()` at runtime so there is nothing else to read here.
   *
   * This generator used to demand `CLI_TABS[]` and failed outright when that
   * name went away - a reminder that a source-reading generator has to be
   * updated with the source it reads, not just the app.
   */
  const blokAi = /const TAB_PANEL: readonly string\[\] = \[([^\]]*)\]/.exec(ai);
  if (!blokAi) throw new Error('aiTabsStore.ts: TAB_PANEL[] tidak ditemukan');
  const cli = [...blokAi[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => ({ id: m[1], label: m[1] }));
  if (!cli.length) throw new Error('aiTabsStore.ts: tidak ada tab CLI yang terbaca');

  const bar = baca('src/components/shell/ActivityBar.tsx');
  const blokLabel = /const LABEL:\s*Record<ActivityId,\s*string>\s*=\s*\{([\s\S]*?)\n\};/.exec(bar);
  if (!blokLabel) throw new Error('ActivityBar.tsx: LABEL tidak ditemukan');
  const blokUrut = /const ORDER:\s*ActivityId\[\]\s*=\s*\[([\s\S]*?)\]/.exec(bar);
  const urut = blokUrut ? [...blokUrut[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
  /* `LABEL` bertipe `Record<ActivityId, string>`, jadi kelengkapannya dijaga
     TypeScript sendiri: menambah ActivityId tanpa label tidak bisa lulus tsc.
     Yang tetap diperiksa di sini adalah bahwa pembacaannya benar-benar dapat
     sesuatu - kalau bentuk berkasnya berubah, indeks berhenti menyebut tampilan
     apa pun tanpa suara, dan itu persis yang tidak boleh terjadi. */
  const tampilan = [...blokLabel[1].matchAll(/([a-z]+):\s*'([^']*)'/g)].map((m) => ({
    id: m[1],
    label: untaikan(m[2]),
    rail: urut.indexOf(m[1]),
  }));
  if (tampilan.length < 8) throw new Error(`ActivityBar.tsx: cuma ${tampilan.length} tampilan terbaca`);
  return { tab, cli, tampilan };
}

/* ---- 14b. Jendela Agents: inventaris lengkap, satu entri per layar -------
   Jendela `#agents` adalah permukaan KEDUA aplikasi ini: WebView sendiri, chat
   sendiri, dan halaman-halaman yang tidak ada di jendela utama. Tanpa entri
   khusus, yang bisa dijawab model tentangnya hanya potongan label per komponen
   (`permukaanUI`) - cukup untuk "tombol ini namanya apa", tidak cukup untuk
   "apa saja yang ada di jendela Agents".

   Karena itu di sini disusun satu entri per layar (sidebar, canvas, panel
   kanan, composer, Marketplace, Automation, My Artifacts), dan ISI daftarnya
   dipanen dari berkas jendela itu sendiri: nav sidebar, daftar view panel
   kanan, menu composer, dan ukuran/judul jendela. Menambah satu halaman atau
   satu opsi composer otomatis ikut - tidak ada daftar tangan yang bisa basi. */
function jendelaAgents() {
  const w = baca('src/lib/agentsWindow.ts');
  const url = /url:\s*'([^']*#agents)'/.exec(w)?.[1];
  if (!url) throw new Error('agentsWindow.ts: url #agents tidak ditemukan');
  const label = /AGENTS_WINDOW_LABEL\s*=\s*'([^']+)'/.exec(w)?.[1] ?? 'agents';
  const ukuran = /width:\s*(\d+),\s*\n?\s*height:\s*(\d+)/.exec(w);
  const minimum = /minWidth:\s*(\d+),\s*\n?\s*minHeight:\s*(\d+)/.exec(w);

  const side = baca('src/components/agents/AgentsSidebar.tsx');
  const nav = [
    ...side.matchAll(
      /data-testid="agx-(new-task|marketplace|automation|artifacts)"[\s\S]{0,260}?<span>([^<]+)<\/span>/g,
    ),
  ].map((m) => ({ id: m[1], label: m[2].trim() }));
  if (nav.length < 4) throw new Error(`AgentsSidebar.tsx: cuma ${nav.length} item nav terbaca`);

  const dd = baca('src/components/agents/AgentsViewDropdown.tsx');
  const butir = [
    ...dd.matchAll(/id:\s*'([a-z-]+)',\s*\n?\s*label:\s*'([^']+)',\s*\n?\s*ket:\s*'((?:[^'\\]|\\.)*)'/g),
  ].map((m) => ({ id: m[1], label: m[2], ket: untaikan(m[3]) }));
  if (butir.length < 5) throw new Error(`AgentsViewDropdown.tsx: cuma ${butir.length} view terbaca`);

  const komp = baca('src/components/agents/AgentsComposer.tsx');
  const blokLokal = /const LOKAL\s*=\s*\[([^\]]+)\]/.exec(komp);
  const lokal = blokLokal ? [...blokLokal[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
  if (!lokal.length) throw new Error('AgentsComposer.tsx: daftar LOKAL tidak terbaca');
  const izin = [...komp.matchAll(/label:\s*'([^']+)',\s*\n?\s*hint:\s*'/g)].map((m) => m[1]);
  const blokChip = /const CHIP[^=]*=\s*\[([\s\S]*?)\n\];/.exec(komp);
  const chip = blokChip ? [...blokChip[1].matchAll(/judul:\s*'([^']+)'/g)].map((m) => m[1]) : [];

  const ukuranTeks = ukuran
    ? `${ukuran[1]}x${ukuran[2]} px` +
      (minimum ? ` (minimum ${minimum[1]}x${minimum[2]})` : '')
    : 'ukuran mengikuti layar';
  const daftar = (arr) => arr.join(' \u00b7 ');

  const entri = [];
  const tambah = (kunci, teks) => entri.push({ kunci, teks });

  tambah(
    'Agents window',
    `jendela KEDUA Zephyr (label ${label}, ${url}, ${ukuranTeks}, tanpa title bar bawaan) - bukan kolom AI di jendela utama ` +
      'dan bukan jendela chat melayang. Tiga kolom: sidebar sesi di kiri, canvas di tengah, panel kanan yang bisa dibuka-tutup ' +
      'dan lebarnya di-drag. Chat-nya PERCAKAPAN SENDIRI: daftar chat jendela ini terpisah dari chat jendela utama (kunci ' +
      'penyimpanan sendiri), dan mulai percakapan baru di sini tidak menimpa percakapan di editor. Pilihan provider/model juga milik ' +
      'jendela ini (disimpan sendiri): memilih model di sini tidak mengubah model jendela utama, dan sebaliknya. Tool tetap sama - shell, baca/tulis ' +
      'berkas, LSP, browser - karena kedua jendela memakai backend Rust yang sama. Permukaan chat-nya berkunci `agents` ' +
      '(sidebar memilih sesi lewat kunci itu).',
  );
  tambah(
    'Agents window sidebar',
    `sidebar kiri jendela Agents: ${daftar(nav.map((n) => n.label))} (id ${daftar(nav.map((n) => n.id))}), ` +
      'lalu daftar percakapan yang DIKELOMPOKKAN MENURUT FOLDER PROYEK: tiap proyek punya chevron yang membuka chat-chat ' +
      'miliknya (yang di-pin lebih dulu, lalu yang terbaru), ditambah satu kelompok Default untuk percakapan tanpa folder. ' +
      'Di kepala daftar ada Collapse All/Expand All dan View Options (Grouped View / List View, Filter All/Cloud/Local; ' +
      'Cloud belum tersedia). Baris tugas punya tombol ⋮ (Pin task, Open in Explorer, File Management, Rename, Delete Task) ' +
      'dan kartu info (Local Task, path folder, Updated at) saat di-hover; baris proyek punya ⋯ (Create a new task, File ' +
      'Management, Open in Explorer, Add Folder to Zephyr, Delete) plus tombol + untuk task baru di folder itu. Lebar sidebar ' +
      'bisa di-drag (batas 200-360 px). "New task" membuat percakapan kosong baru di permukaan `agents` dan mengembalikan ' +
      'canvas ke layar awal.',
  );
  tambah(
    'Agents window canvas',
    `canvas tengah jendela Agents punya empat halaman: chat (layar awal "Build With Zephyr" + transkrip), Marketplace, ` +
      'Automation, dan My Artifacts. Selama halaman chat, kontrol sudut kanan-atas berisi tombol IDE \u2197 (membuka berkas di ' +
      'jendela editor) dan tombol buka/tutup panel kanan. Setelah pesan pertama, canvas menampilkan panel chat penuh untuk ' +
      'permukaan `agents`: transkrip, kartu tool, pertanyaan agen, persetujuan, dan kotak input berikutnya.',
  );
  tambah(
    'Agents window right panel',
    `panel kanan jendela Agents adalah panel bertab (bukan satu halaman): ${daftar(
      butir.map((b) => `${b.label} (${b.ket})`),
    )}. Tanpa tab terbuka ia menampilkan layar "Start here"; tombol + di bar panel membuka daftar view yang sama. ` +
      'Tab Terminal tidak singleton (tiap klik shell baru), view lain singleton (sudah terbuka = difokuskan). ' +
      'Side Chat di sini percakapan KETIGA yang terpisah, untuk bertanya tanpa mengganggu chat utama jendela ini.',
  );
  tambah(
    'Agents window composer',
    `kotak input layar awal jendela Agents: dropdown lokasi ${daftar(lokal)}, tombol folder (pilih folder kerja dari folder ` +
      `yang pernah dipakai; bawaannya workspace yang sedang terbuka), menu izin ${daftar(izin)} + Custom (membuka Chat Settings), ` +
      `pemilih model, dan tombol kirim. Empat chip saran di bawahnya: ${daftar(chip)}. ` +
      'Enter mengirim, Shift+Enter baris baru; setelah percakapan dimulai, judul, strip lokasi, dan chip hilang.',
  );
  tambah(
    'Agents window Marketplace',
    'halaman Marketplace di jendela Agents memakai komponen Marketplace yang sama dengan jendela utama, tetapi hanya tiga tab ' +
      'yang berlaku untuk agen: Plugins, Skills, MCP. Tombol Manage membuka HALAMAN Manage (bukan modal): tab Plugins/Skills/MCP ' +
      'dengan penghitung, pencarian, dan baris terpasang - plugin punya sakelar aktif/nonaktif, skill dan server MCP punya tombol ' +
      'Buang. Tab tema/ikon/keymap/bahasa/snippet tidak ada di sini karena semuanya mengubah tampilan editor di jendela utama.',
  );
  tambah(
    'Agents window Automation',
    'halaman Automation di jendela Agents menjadwalkan tugas ala TRAE: daftar tugas, interval, perintah yang dijalankan, dan ' +
      'riwayat jalan terakhir. Penjadwalnya hidup selama jendela Agents terbuka (`useAutomationScheduler`), jadi tugas tetap ' +
      'jalan walau halaman Automation sedang tidak dibuka.',
  );
  tambah(
    'Agents window My Artifacts',
    'halaman My Artifacts di jendela Agents mendaftar berkas hasil karya (folder artifacts di workspace) dan membukanya di ' +
      'JENDELA EDITOR: jendela Agents tidak punya tab editor.',
  );
  return entri;
}

/* ---- 15. Permukaan antarmuka: tombol, tooltip, teks yang DI-RENDER komponen -
   Celah terbesar yang tersisa setelah blok inti dipotong: kamus i18n cuma
   memuat teks yang DITERJEMAHKAN. Teks yang ditulis langsung di komponen
   (`title=\"Clear console\"`, `aria-label=\"Activity Bar\"`, anak elemen, dan
   `tr('...')` yang kuncinya tidak ada di kamus mana pun) tidak pernah masuk
   indeks - padahal itu yang user lihat di layar dan sebut saat bertanya
   (\"tombol Clear console di mana\"). Karena itu permukaan dipanen dari berkas
   komponennya sendiri, dua arah:

   - per BERKAS: satu entri berkunci nama komponen, memuat daftar
     label/tooltip/aria/placeholder/testid yang dirender berkas itu - menjawab
     \"panel ini tombolnya apa saja\";
   - per TEKS: entri berkunci teksnya sendiri untuk teks yang BELUM punya entri
     di kategori lain, memuat berkas mana saja yang merendernya - menjawab
     \"tombol/teks ini ada di mana\".

   Teks yang sudah punya entri (label kamus, item menu, tab panel) TIDAK
   diduplikasi: tempatnya sudah dijelaskan entri berkasnya. */
let memoBerkasPermukaan = null;
function berkasPermukaan() {
  if (memoBerkasPermukaan) return memoBerkasPermukaan;
  const daftar = [];
  const telusuri = (rel) => {
    for (const e of readdirSync(join(akar, rel), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '__snapshots__') continue;
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) telusuri(r);
      /* Keluaran generator sendiri tidak punya JSX, dan berkas uji tidak
         dirender oleh aplikasi - keduanya cuma menambah derau. */
      else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) &&
        e.name !== 'zephyrFakta.ts' && e.name !== 'zephyrIndeks.ts')
        daftar.push(r);
    }
  };
  telusuri('src');
  memoBerkasPermukaan = daftar.sort();
  return memoBerkasPermukaan;
}

function permukaanUI(kunciKamus) {
  const berkas = [];
  /* teks -> { jenis: Set, berkas: Set } */
  const peta = new Map();
  const catatTeks = (teks, jenis, rel) => {
    if (!peta.has(teks)) peta.set(teks, { jenis: new Set(), berkas: new Set() });
    peta.get(teks).jenis.add(jenis);
    peta.get(teks).berkas.add(rel);
  };
  const unik = (a) => [...new Set(a)].sort();
  for (const rel of berkasPermukaan()) {
    const isi = baca(rel);
    const ambil = (re, jenis) => {
      const keluar = [];
      for (const m of isi.matchAll(re)) {
        const t = untaikan(m[1] ?? '').trim();
        if (t.length > 1) {
          keluar.push(t);
          catatTeks(t, jenis, rel);
        }
      }
      return unik(keluar);
    };
    /* Label lewat pemanggilan terjemahan: `tr('...')` / `tf('...')` / `tx('...')`.
       Kunci yang TIDAK ada di kamus mana pun ditandai terpisah: itu label yang
       tampil mentah di layar (tidak diterjemahkan), dan model harus tahu bedanya
       supaya tidak mengarang padanannya. */
    const label = ambil(/\b(?:tr|tf|tx)\(\s*'((?:[^'\\]|\\.)*)'/g, 'label');
    const tanpaKamus = label.filter((t) => !kunciKamus.has(t));
    for (const t of label) if (!kunciKamus.has(t)) peta.get(t).jenis.add('label tanpa kamus');
    const judul = ambil(/\btitle="([^"]*)"/g, 'tooltip title');
    const aria = ambil(/aria-label="([^"]*)"/g, 'aria-label');
    const placeholder = ambil(/\bplaceholder="([^"]*)"/g, 'placeholder');
    const testid = ambil(/data-testid="([^"]*)"/g, 'data-testid');
    const teks = [];
    for (const m of isi.matchAll(/>\s*([A-Za-z][^<>{}\n]{2,60}?)\s*</g)) {
      const t = m[1].trim();
      /* Derau dibuang SEBELUM dicatat: potongan jalur/kelas CSS/ekspresi bukan
         teks yang pernah dilihat user, dan menaruhnya di indeks membuat
         pencarian mendarat di fakta yang tidak berarti. */
      if (t.length < 3 || /^[\w./-]+$/.test(t) || /=>|::|\/\//.test(t)) continue;
      teks.push(t);
      catatTeks(t, 'teks elemen', rel);
    }
    const bagian = [rel];
    if (label.length) bagian.push(`${label.length} label: ${label.slice(0, 40).join(', ')}`);
    if (judul.length) bagian.push(`tooltip: ${judul.join(', ')}`);
    if (aria.length) bagian.push(`aria-label: ${aria.join(', ')}`);
    if (placeholder.length) bagian.push(`placeholder: ${placeholder.join(', ')}`);
    if (testid.length) bagian.push(`${testid.length} data-testid: ${testid.slice(0, 30).join(', ')}`);
    if (teks.length) bagian.push(`teks: ${teks.slice(0, 25).join(' · ')}`);
    const punyaPermukaan = label.length + judul.length + aria.length + placeholder.length + testid.length + teks.length;
    if (punyaPermukaan)
      berkas.push({
        rel,
        komponen: rel.split('/').pop().replace(/\.tsx$/, ''),
        teks: bagian.join(' · '),
        jumlah: {
          label: label.length,
          tanpaKamus: tanpaKamus.length,
          judul: judul.length,
          aria: aria.length,
          placeholder: placeholder.length,
          testid: testid.length,
          teks: teks.length,
        },
      });
  }
  if (berkas.length < 20) throw new Error(`permukaan UI: cuma ${berkas.length} berkas permukaan terbaca`);
  const belum = [...peta.entries()].map(([teks, v]) => ({
    teks,
    jenis: [...v.jenis].sort(),
    berkas: [...v.berkas].sort(),
  }));
  return { berkas, belum };
}

/* ---- 4. Rangkai teksnya ------------------------------------------------- */
const garis = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

function susunTeks() {
  const setelan = setelanDefault();
  const { diNav, tanpaNav, hanyaChat, popup } = seksiSetelan();
  const { vite, cdp } = portDev();
  const pintasan = shortcutBawaan();
  const chat = seksiChat();
  const bridge = namaBridge();

  /* ---------------------------------------------------------------------- *
   * ANGGARAN BLOK INTI (keputusan `ai-tahu-100-7(a)`): blok ini ikut SETIAP
   * giliran, jadi panjangnya diikat angka - <= 2.000 token, perkiraan
   * konservatif 4 char/token = 8.000 char - dan dijaga
   * `scripts/cek-batas-inti.mjs`. Aturan pembagiannya ditulis DI SINI, bukan
   * diserahkan ke model:
   *
   *   - TETAP di blok inti: identitas, aturan menjawab, kunci setelan yang
   *     aturannya sendiri menyebut (panel/mcp/subagent/agents) atau yang
   *     hampir tiap hari ditanya (tema, bahasa, font, tab, simpan-otomatis,
   *     port), pintasan yang menjawab "di mana X", port, jalur log, dan
   *     aturan "jangan mengarang".
   *   - DICARI di indeks (`src/lib/zephyrIndeks.ts`, lewat tool `zephyr_self`
   *     -> `cariFakta()`): SELURUH tabel setelan + default, semua pintasan,
   *     label antarmuka, perintah palet, tool, ekstensi bawaan, dokumen
   *     bundel, dan peta kode. Blok inti menyebut PINTU-nya, bukan isinya.
   *   - Konsekuensinya diuji, bukan diandaikan: `cek-batas-inti.mjs` (a-e)
   *     dan `verify-fakta-zephyr.mjs` (tiap kunci setelan tetap terjawab -
   *     dari blok inti ATAU dari indeks).
   * ---------------------------------------------------------------------- */

  /*
 * Semua kunci setelan dari bentuknya sendiri: `setelan` sudah berupa objek
 * bersarang hasil pembacaan settings.rs, jadi daftarnya diturunkan - tidak ada
 * nama yang diketik tangan dan tidak ada kunci yang bisa tertinggal.
 *
 * Kunci level atas yang nilainya bukan objek (mis. `allowCommands`) ikut
 * sebagai dirinya sendiri; kunci di dalam grup jadi `grup.kunci`.
 */
function daftarSemuaKunciSetelan(setelan) {
  const out = [];
  for (const [grup, isi] of Object.entries(setelan)) {
    if (isi && typeof isi === 'object' && !Array.isArray(isi)) {
      for (const kunci of Object.keys(isi)) out.push(`${grup}.${kunci}`);
    } else {
      out.push(grup);
    }
  }
  return out;
}

/* Kunci setelan yang tetap dibawa blok inti. Kalau salah satu hilang dari
     settings.rs, generator GAGAL - bukan diam-diam lenyap dari prompt (itu
     persis kesalahan yang bikin Zeph bilang "tidak ada setelan itu"). */
  /*
   * Kunci setelan di blok inti: DUA hal, dan itu keputusan anggaran.
   *
   * Riwayatnya dua arah, dan keduanya nyata:
   *
   * 1. Versi pertama membawa 25 dari 129 kunci pilihan tangan. 104 kunci tidak
   *    ada di kepala model, jadi ditanya soal setelan di luar daftar itu ia
   *    menjawab "tidak ada setelan itu" - keluhan persis user ("tau semua
   *    settingan di Zephyr").
   * 2. Versi kedua membawa SEMUA 130 kunci beserta nilai bawaannya: ~5.400
   *    karakter, 52% dari seluruh blok fakta, dan bersama blok aturan ia
   *    menembus AMBANG_TOKEN_INTI (4.303 tok vs 3.400) sehingga setiap giliran
   *    membayar ~900 token hanya untuk daftar default yang jarang ditanya.
   *
   * Yang menyelesaikan keduanya bukan memilih salah satu, tapi MEMISAHKAN
   * "kunci apa yang ada" dari "nilai bawaannya berapa":
   *   - SETIAP grup setelan tetap disebut di blok inti, beserta kunci yang
   *     paling sering ditanya. Jadi model tahu grupnya ada; tidak ada lagi
   *     "tidak ada setelan itu".
   *   - Nilai bawaan lengkap 130 kunci tetap ada di INDEKS (zephyrIndeks.ts),
   *     yang memang dibangun untuk itu dan dibaca lewat `zephyr_self` saat
   *     ditanya. Blok inti tidak perlu menyalinnya.
   *
   * KUNCI_CADANGAN adalah daftar kurasi yang sudah ada untuk peran ini; ia
   * dipakai apa adanya supaya kunci yang terbukti paling sering ditanya tidak
   * ikut terbuang.
   */
  /* Grup yang tidak punya satu pun kunci terkurasi tetap DISEBUT di blok inti,
     dengan satu wakil kunci pertama dari sumbernya. Tanpa ini grup seperti
     `history` atau `devenv` hilang sama sekali dari kepala model, dan
     pertanyaan "apakah Zephyr punya setelan itu" dijawab "tidak". */
  const KUNCI_CADANGAN = [
    'general.theme',
    'general.uiLang',
    'general.fontSize',
    'general.zoom',
    'general.aiPanel',
    'editor.tabSize',
    'editor.wordWrap',
    'editor.autoSave',
    'editor.formatOnSave',
    'editor.vimMode',
    'theme.current',
    'theme.accent',
    'agents.maxPanes',
    'agents.attachActiveFile',
    'subagent.maxParallel',
    'subagent.maxSteps',
    'subagent.allowWrite',
    'subagent.model',
    'mcp.enabled',
    'mcp.port',
    'mcp.allow_terminal_control',
    'panel.visibleTabs',
    'panel.activeTab',
    'panel.height',
    'allowCommands',
  ];
  const KUNCI_INTI = KUNCI_CADANGAN;
  const SEMUA = daftarSemuaKunciSetelan(setelan);
  const grupTerpilih = new Set(KUNCI_INTI.map((j) => (j.includes('.') ? j.slice(0, j.indexOf('.')) : 'top level')));
  for (const jalur of SEMUA) {
    const grup = jalur.includes('.') ? jalur.slice(0, jalur.indexOf('.')) : 'top level';
    if (!grupTerpilih.has(grup)) {
      KUNCI_INTI.push(jalur);
      grupTerpilih.add(grup);
    }
  }
  const nilaiKunci = (jalur) => {
    const titik = jalur.indexOf('.');
    if (titik < 0) {
      if (!(jalur in setelan))
        throw new Error(`gen-fakta-zephyr: setelan level atas '${jalur}' tidak ada di settings.rs`);
      return { grup: 'top level', teks: `${jalur}=${garis(setelan[jalur])}` };
    }
    const grup = jalur.slice(0, titik);
    const kunci = jalur.slice(titik + 1);
    const isi = setelan[grup];
    if (!isi || typeof isi !== 'object' || Array.isArray(isi) || !(kunci in isi))
      throw new Error(`gen-fakta-zephyr: setelan '${jalur}' tidak ada di settings.rs`);
    return { grup, teks: `${kunci}=${garis(isi[kunci])}` };
  };
  const barisKunci = new Map();
  for (const jalur of KUNCI_INTI) {
    const { grup, teks } = nilaiKunci(jalur);
    if (!barisKunci.has(grup)) barisKunci.set(grup, []);
    barisKunci.get(grup).push(teks);
  }

  /* Pintasan yang tetap dibawa: yang menjawab "di mana X / kenapa panel saya
     hilang". Sisanya (semua 34 bawaan) ada di indeks dengan kunci tombol DAN
     label, jadi pertanyaan "Ctrl+Shift+G itu apa" tetap terjawab saat ditanya. */
  const PINTASAN_INTI = [
    'view.settings',
    'view.panel',
    'view.palette',
    'view.explorer',
    'view.sidebar',
    'terminal.toggle',
    'terminal.new',
    'ai.panel',
    'ai.send',
    'file.save',
    'edit.find',
  ];
  const pintasanInti = PINTASAN_INTI.map((id) => {
    const p = pintasan.find((x) => x.id === id);
    if (!p) throw new Error(`gen-fakta-zephyr: pintasan '${id}' tidak ada di shortcuts.ts ACTIONS[]`);
    return p;
  });

  /* Bridge yang tetap disebut namanya: yang dipakai aturan/tool di atas dan
     yang dipegang harness. Daftar penuhnya (59 nama) ada di indeks. */
  const BRIDGE_INTI = ['__ZEPHYR_AI__', '__ZEPHYR_TODO__', '__ZEPHYR_PROMPT__', '__ZEPHYR_MCP__'];
  const bridgeHilang = BRIDGE_INTI.filter((b) => !bridge.includes(b));
  if (bridgeHilang.length)
    throw new Error(`gen-fakta-zephyr: bridge ${bridgeHilang.join(', ')} tidak ada di devBridge.ts`);

  const jumlahKunci = Object.entries(setelan).reduce(
    (n, [, v]) => n + (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).length : 1),
    0,
  );

  const baris = [];
  baris.push('# What Zephyr is - the app you are running inside');
  baris.push(
    'Zephyr is a desktop code editor: a Tauri 2 shell in Rust with a React/TypeScript UI, built for Windows. ' +
      'You are Zeph, its AI agent. Everything below is generated from Zephyr\'s own source, so it matches the build you are in - ' +
      'treat it as the truth about the app, and prefer it over what you remember about other editors.',
  );
  baris.push('');
  /*
   * IDENTITAS PEMBUAT - selalu ikut, di depan.
   *
   * Ditanya "siapa yang bikin aplikasi ini", model tanpa blok ini menjawab dari
   * ingatan tentang editor lain, atau mengarang nama. Itu bukan sekadar salah
   * informasi: ini aplikasi orang, dan nama pembuatnya adalah fakta yang paling
   * sering ditanyakan pertama kali. Jadi ditulis di sini, dari sumber yang sama
   * dengan README, bukan dihafal.
   *
   * Pendek dengan sengaja: nama, akun GitHub, dan repo. Pemilik aplikasi meminta
   * HANYA itu - tidak ada daftar lisensi, ukuran, atau tumpukan teknologi di
   * sini. Yang tidak diminta tidak ditambahkan, karena blok ini dibayar pada
   * setiap giliran.
   */
  baris.push('## Who made Zephyr');
  baris.push(
    '- Creator and maintainer: **Muhammad Khalid** (GitHub: **ShinRyu04**), ' +
      'https://github.com/ShinRyu04/Zephyr. Asked who made it, who maintains it, or who to credit: answer with ' +
      'exactly that name, account and link, nothing more.',
  );
  baris.push(
    '- The public repository deliberately does NOT contain `src/`, `src-tauri/` or `scripts/` - a decision, not ' +
      'damage. Never call the repo incomplete or broken for that, and never suggest committing those folders there.',
  );
  baris.push('');
  baris.push('## Looking things up - this block is the CORE, the rest is searchable');
  baris.push(
    '- The always-on core: identity, answer rules, the daily setting keys and shortcuts, ports, logs, the never-invent rule. ' +
      'NOT the whole truth - the rest is one search away.',
  );
  baris.push(
    `- Everything else ships in a LOCAL search index: ALL ${jumlahKunci} setting keys + defaults, all ${pintasan.length} ` +
      'shortcuts, every interface label, palette command, tool, bundled extension, bundled document and the code map. Reach ' +
      'it with `zephyr_self`: pass the user\'s own words; it searches locally (no folder, no network). Use it BEFORE naming ' +
      'a setting, shortcut, command, label or tool not written above, and before telling the user something does not exist.',
  );
  /*
   * Angka-angka diambil dari SUMBERNYA, bukan ditulis tangan: batas dari
   * `BATAS_TOOL_TUGAS` (subsetTugas.ts), jumlah tool dari katalog yang sama
   * dipakai blok tool di bawah, dan daftar tool kode disaring dari grup
   * 'Code intelligence' di katalog itu juga. Angka yang ditulis tangan di
   * blok fakta akan basi begitu kodenya berubah - dan blok inilah yang dibaca
   * model, jadi basi di sini berarti salah jawab, bukan sekadar catatan usang.
   */
  const batasToolTugas = (() => {
    const m = /export const BATAS_TOOL_TUGAS\s*=\s*(\d+)/.exec(baca('src/lib/subsetTugas.ts'));
    if (!m) throw new Error('subsetTugas.ts: BATAS_TOOL_TUGAS tidak ditemukan');
    return Number(m[1]);
  })();
  const semuaTool = toolKatalog();
  const toolInti = semuaTool.filter((x) => x.grup !== 'Web' && x.grup !== 'Browser');
  const daftarLsp = semuaTool.filter((x) => x.grup === 'Code intelligence').map((x) => x.nama);

  /*
   * Batas tool per giliran + jalur penemuan tool.
   *
   * Bagian ini DULU tidak ada, dan model yang ditanya "berapa batas tool yang
   * dikirim ke model" menjawab dengan daftar tool baca-kode sambil membakar 17
   * langkah mencari di indeks - jawaban yang salah arah, karena angkanya memang
   * tidak pernah ditulis di blok fakta. Angka yang mengatur perilaku agen
   * sendiri harus ada di blok selalu-nyala, bukan hanya di kode.
   */
  baris.push('');
  baris.push('## Your own tool budget');
  baris.push(
    `- At most ${batasToolTugas} tools are offered to you in ONE request, chosen per task from the ` +
      `${toolInti.length} the app ships (built-in + MCP; the web/browser group is counted separately). It is a window, ` +
      'not the whole set.',
  );
  baris.push(
    '- The rest stay reachable: call `tool_search` with what you want to do, then `tool_call` with the name it ' +
      'returns. Both are always in the window. Never tell the user a capability does not exist because it was not ' +
      'in the last request - search first.',
  );
  baris.push(
    '- Reading CODE (not plain text) has its own group, `Code intelligence`, powered by the language server: ' +
      `${daftarLsp.join(', ')}. Prefer these over grep when the question is about a symbol rather than a string; ` +
      'they degrade to an honest sentence when no language server is available for the file.',
  );
  baris.push('');
  baris.push('## Settings');
  baris.push(
    '- Open them with the Settings command (Ctrl+comma). The page has a search box that filters by setting name.',
  );
  baris.push(
    '- Stored as JSON in two layers: the global file %APPDATA%\\zephyr\\settings.json, and a per-project file ' +
      '<open folder>\\.zephyr\\settings.json. A value in the project file wins over the global one.',
  );
  baris.push(`- Pages in the nav, in order: ${diNav.join(', ')}.`);
  if (hanyaChat.length) {
    /* Satu kalimat, satu daftar: seksi yang kehilangan barisnya di nav TAPI
       masih seksi Settings (deep link dan panel masih memakainya) - jadi daftar
       tidak diulang dua kali seperti saat ada seksi yang keluar dari union. */
    baris.push(
      `- Settings sections that are NOT in that nav: ${hanyaChat.join(', ')} - never send the user hunting in the Settings ` +
        'nav for them. They are still Settings keys, but the nav has no row for them, so opening the Settings window for ' +
        'one of them lands the reader on a page that does not list it. Where each one actually lives: ' +
        '`agents` (agent behaviour: fixed instructions, step limit, context budget) is the Agents tab of the Agent ' +
        'Customizations panel; `rules` is its Rules & Memories tab; `mcp` (MCP servers, port, token) is its MCP tab; ' +
        '`subagent` and `permissions` are sections of Chat Settings (the "..." menu in the AI view). ' +
        'Open them with `tunjuk` rather than naming a place.',
    );
  }
  /* Pop-up yang BERDIRI SENDIRI: bukan halaman Settings (tidak ada barisnya di
     nav) dan bukan juga seksi Chat Settings. Dulu fakta menyebut `models` di
     kalimat "seksi Chat Settings" di atas, dan itu mengirim pembacanya ke
     tempat yang salah untuk sesuatu yang harus bisa dibetulkan tepat di depan
     chat yang gagal - jadi tempatnya sekarang berdiri sendiri, dan pintu
     masuknya disebut satu per satu. */
  if (popup)
    baris.push(
      `- "${popup.judul}" (Settings group \`${popup.id}\`: ${popup.grup.join(', ')}) is NOT a Settings page and has no row in the nav: ` +
        `it is a pop-up of its own, opened by \`useAiModels.getState().buka()\` - \`${popup.komponen}\` in \`${popup.berkas}\`, ` +
        'the same section component the editor-area Settings page used to show. ' +
        `${popup.pintu.length} ways in, all without leaving the chat: ${popup.pintu.map((p) => p.tempat).join('; ')}. ` +
        'Providers, API keys, base URLs and the model list live HERE - never send the user to a Settings page for them.',
    );
  if (chat.length)
    baris.push(
      `- Chat Settings (opened from the AI panel, separate from the Settings page) has these sections: ` +
        `${chat.join(', ')}.`,
    );
  /*
   * Dua jendela ini sering mendarat di Settings karena `view.settings` adalah
   * satu-satunya id yang terlihat seperti pintu. Kalimat di bawah menyebut
   * pintu yang benar beserta id-nya, supaya tidak ada alasan menebak.
   */
  /*
   * Jendela Agents: satu paragraf penunjuk, bukan inventarisnya.
   *
   * Blok inti punya anggaran char yang dijaga `cek-batas-inti.mjs`, sedangkan
   * inventaris jendela ini (sidebar, empat halaman canvas, tab panel kanan,
   * menu composer, Marketplace + halaman Manage, Automation, My Artifacts)
   * terlalu panjang untuk dibayar setiap giliran. Jadi yang ditulis di sini
   * adalah HAL YANG PALING SERING SALAH DIJAWAB - bahwa jendela itu punya chat
   * sendiri dan tool yang sama - beserta pintu ke rinciannya di indeks.
   */
  baris.push(
    '- The Agents window (`index.html#agents`) is a SECOND window with its own chat - separate from the editor tab and ' +
      'the right-hand column, same tools and backend. Search its inventory in the index ("Agents window") with ' +
      '`zephyr_self` before describing it; never describe it from the main window\'s layout.',
  );
  baris.push(
    '- Chat Settings and Agent Customizations are NOT Settings pages: the Settings command (`view.settings`) opens the ' +
      'WRONG window for them. Their own commands: "AI: Open Chat Settings" (`ai.chatSettings`) and "Agent: Open ' +
      'Customizations" (`ai.agentCustomizations`). The sure way is `tunjuk`, which picks the section from the ' +
      "reader's own words.",
  );
  /*
   * To-Do List: the one question about it that keeps coming back is "why does
   * `todo_write` never do anything". Three separate gates stand between the
   * tool and a visible list, and a model that only knows the first one tells the
   * reader it is broken. Stated here as fact, not as a guess.
   */
  baris.push(
    '- To-Do List has THREE gates; `todo_write` looks broken when any one is shut: (1) the ' +
      '`conversation.todoListIde` / `conversation.todoListSolo` switches (Agent Customizations > Conversations, ' +
      'first section, columns IDE/Agent), both default false - while false the tool is filtered out of the request ' +
      'and refused if called; (2) a plan must be ready: it unlocks once `todo_write` plus two other plan tools have ' +
      'run; (3) the task card is hidden by default - open it from the chat header "..." menu, "Show task list". ' +
      'Never say the tool does not exist; name the shut gate and open it with `tunjuk`.',
  );
  baris.push(
    `- Setting keys here (${KUNCI_INTI.length} of ${jumlahKunci}; EVERY group is listed, the rest + all defaults are in the ` +
      'index via `zephyr_self`):',
  );
  for (const [grup, daftar] of barisKunci) baris.push(`  - ${grup}: ${daftar.join(', ')}`);
  baris.push('');
  baris.push('## Links: open them in the browser pane, do not just print them');
  /*
   * Perilaku yang diminta langsung oleh pemilik aplikasi: percakapan berisi URL
   * biasanya segera ditinggalkan orang untuk membuka browsernya sendiri.
   *
   * Tempatnya PANE ZEPHYR, bukan browser OS: halaman tampil di sebelah kode
   * sementara pembaca tetap bekerja, dan agen bisa MEMBACA halaman yang sama
   * lewat `browser` (aksi read), bukan menebak isinya.
   *
   * Dipadatkan: lima butir pertama memakan 1.451 karakter untuk aturan yang
   * bisa dibawa dalam empat baris. Isinya tidak ada yang dibuang - hanya
   * pengulangan ("do not print the URL" muncul tiga kali dalam bentuk berbeda).
   */
  baris.push(
    '- A link the user shares (any http/https URL) IS the request: OPEN it with `open_link` in the same turn and ' +
      'say one line that you did. It opens in Zephyr\'s browser pane beside the code. Never print a URL and wait, ' +
      'never ask permission first. Several links: open the one the message is about (or the first), mention the rest.',
  );
  baris.push(
    '- To say what the page contains, READ it with `browser` (action: read) on that same pane - one call, never ' +
      '`web_fetch` the same URL and never guess. Use `browser` (action: open) when you need to read as you open, and ' +
      '`web_fetch` only for a page that is NOT open in a pane. Never open a URL from the terminal.',
  );
  baris.push(
    '- If `open_link` refuses a host outside the allowlist, name the host and say Settings > Security controls it. ' +
      'Do not retry and do not fall back to another tool - the gate is shared.',
  );
  baris.push('');
baris.push('## Panels, ports and logs');
  const panel = setelan.panel ?? {};
  if (panel.visibleTabs)
    baris.push(
      `- Bottom panel tabs: ${panel.visibleTabs.join(', ')}; default active: ${garis(panel.activeTab)}, height: ` +
        `${garis(panel.height)} px.`,
    );
  const mcp = setelan.mcp ?? {};
  baris.push(
    `- MCP server: ${mcp.enabled === true ? 'on' : 'off'} by default (mcp.enabled=${garis(mcp.enabled)}); default port ` +
      `mcp.port=${garis(mcp.port)}. Port ${cdp} is reserved for the WebView2 CDP debug port and is never used by MCP.`,
  );
  baris.push(`- Dev server for the UI: port ${vite} (vite.config.ts).`);
  baris.push(
    '- Debug bridges on `window` (dev builds; they read the live stores, so answer a question about the running app ' +
      `from them instead of guessing): ${BRIDGE_INTI.join(', ')}. Full roster (${bridge.length} names) in the index - ` +
      'look a name up before using it.',
  );
  baris.push(
    '- Logs: %APPDATA%\\zephyr\\logs\\zephyr-YYYY-MM-DD.log, rotated to zephyr-1.log, zephyr-2.log ... ' +
      'The same folder holds settings.json.',
  );
  baris.push('');
  baris.push('## Shortcuts (the DEFAULTS - the user may have rebound them in Settings > Shortcuts)');
  baris.push(
    /*
     * A default whose key IS a backtick (Ctrl+`) gets the word "backtick"
     * spelled out. The raw character in this line was what taught the model
     * that a bare backtick after `Ctrl+` is normal - it then wrote one into an
     * answer, the renderer swallowed the rest of the sentence into a code
     * card, and the user read a paragraph cut into pieces. Spelling it here
     * removes the example; rule 9 in the limits block states the rule.
     */
    `  ${pintasanInti
      .map((p) => `${p.tombol === 'Ctrl+`' ? 'Ctrl+backtick' : p.tombol || '(no default)'} = ${p.label} [${p.grup}]`)
      .join(', ')} ` +
      `- the defaults that answer the usual questions; the other ${pintasan.length - pintasanInti.length} are in the index ` +
      '(searchable by key AND by what they do).',
  );
  /* Fakta perilaku, bukan turunan tabel: HARUS cocok dengan `akarCwd()` di
     src/lib/zephyrTools/builtins.ts (dua tool shell memakainya). Kalau kode itu
     berubah dan baris ini tidak, harness akan gagal - itu tujuannya. */
  baris.push('');
  baris.push('## Running commands');
  baris.push(
    '- Shell tools (bash_run, bash_background) start in the folder of the file that is open in the editor; with no file open they start in the open folder, ' +
      'and with no folder open the backend decides. Zephyr\u2019s own source folder is NOT the user\u2019s project - never run the user\u2019s commands there just because that is the folder that happens to be open.',
  );
  baris.push('- Tools that search "the project" use the open folder as their root, and a tool that needs a folder says so instead of silently using the wrong one.');
  baris.push('');
  baris.push('## Answering questions about Zephyr itself');
  baris.push(
    '- This block is about the app you ARE: answer questions about Zephyr (settings, panels, ports, shortcuts, tools, ' +
      'extensions) from here plus the index behind `zephyr_self`. Do not open a folder, grep the project or run programs to ' +
      'check a documented default. A question about Zephyr is ANSWERED, not "worked on".',
  );
  baris.push(
    '- A SYMPTOM ("my panel disappeared") is answered like a question: name the setting key (group `panel`), the panel, and ' +
      'its default shortcut (bottom panel = Ctrl+J), THEN name WHERE THE VALUE LIVES - the exact path, not just "Settings": ' +
      '%APPDATA%\\zephyr\\settings.json (project override: <folder>\\.zephyr\\settings.json). Naming the key without the file ' +
      'leaves the reader stuck. Do NOT run shell commands, do not open Zephyr-own files, and do not start a diagnosis hunt for ' +
      'a "why is this happening" turn - the defaults are here and in the index. Offer the deeper check as a next step.',
  );
  baris.push(
    '- Never answer a chat question by shell-reading Zephyr-own files: the shell starts in the user project, quoting there is ' +
      'fragile, and this block or the index already has the value. Read them only when the user asks you to open that file.',
  );
  baris.push(
    '- To change a setting or bring a panel back, give the path inside Zephyr: Settings page and section, panel name, ' +
      'shortcut, or the exact setting key.',
  );
  /*
   * `tunjuk` is the one tool that acts on the UI, and a model that has not been
   * told it exists answers "where is it" with prose. The facts block is where
   * the model learns what it can DO about Zephyr, so the tool is named here
   * next to the rules about answering Zephyr questions - not only in its own
   * spec, which the model may never read.
   */
  baris.push(
    '- "Where is it" is answered with a SCREEN: call `tunjuk` with the reader\'s own words ("di mana picker model", "panel ' +
      'terminal hilang"). It opens the matching Settings section, bottom-panel tab, model picker, Chat Settings, Agent ' +
      'Customizations, palette or Explorer, and reports what it opened; buka=false just names the location. No match: answer ' +
      'from this block, never invent a menu name.',
  );
  baris.push(
    '- Where to look for a symptom: Problems (diagnostics), Output (task/tool), Debug, a terminal, Ports (what is listening); ' +
      'Settings > About for version/update; the log file above when the answer really lives there.',
  );
  baris.push('');
  baris.push('## Never invent');
  baris.push(
    '- A setting name, label, shortcut or port not in this block or in a file you actually read: say where the user can look ' +
      'and offer to check it. ' +
      `If it is one of the ${jumlahKunci} settings or ${pintasan.length} shortcuts the app ships, \`zephyr_self\` finds it - ` +
      'look it up instead of guessing. A wrong name costs more than an honest "let me check".',
  );
  return baris.join('\n');
}

const teks = susunTeks();
/* Daftar sumber pop-up (kalau ada): dipisah supaya blok komentar dan array
   FAKTA_ZEPHYR_SUMBER di berkas hasil memakai daftar yang sama. */
const sumberPopup = popupSetelan() ? SUMBER_POPUP : [];
const komentarSumber = sumberPopup.length
  ? `${sumberPopup.map((s) => ` *   - ${s}`).join('\n')}\n *                (pop-up AI Models: judul setelan, komponen seksi, pintu masuk)\n`
  : '';
const eksporSumber = sumberPopup.map((s) => `  '${s}',`).join('\n');
const tsv = `/* BERKAS HASIL GENERATE - jangan disunting tangan.
 * Dihasilkan oleh scripts/gen-fakta-zephyr.mjs dari:
 *   - src-tauri/src/settings.rs      (default_settings: ${Object.keys(setelanDefault()).length} grup setelan)
 *   - src/lib/settingsStore.ts       (SECTION_ORDER & SectionId)
 *   - vite.config.ts                 (port dev UI)
 *   - src-tauri/src/mcp_server.rs    (PORT_DILARANG = port CDP WebView2)
 *   - src/lib/devBridge.ts           (nama bridge __ZEPHYR_*__)
${komentarSumber} * Hasilkan ulang: node scripts/gen-fakta-zephyr.mjs
 * Periksa sinkron: node scripts/gen-fakta-zephyr.mjs --check
 *
 * Kenapa digenerate: Zeph harus bisa menjawab soal setelan/fitur Zephyr tanpa
 * mengarang, dan daftar yang dihafal di kepala berkas pasti basi. Sumber kode
 * adalah satu-satunya daftar yang ikut berubah saat aplikasinya berubah.
 */
export const FAKTA_ZEPHYR_SUMBER = [
  'src-tauri/src/settings.rs',
  'src/lib/settingsStore.ts',
  'vite.config.ts',
  'src-tauri/src/mcp_server.rs',
  'src/lib/devBridge.ts',
${eksporSumber}
] as const;

/* Blok teks siap pakai untuk system prompt. Escape backtick, backslash dan
   \${ supaya nilai setelan yang mengandung karakter itu tidak memutus template. */
export const FAKTA_ZEPHYR = \`${teks.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\`;
`;
const tujuan = join(akar, 'src/lib/zephyrFakta.ts');

/* ------------------------------------------------------------------------ */
/* INDEKS: data yang DICARI, bukan yang selalu dibawa                       */
/* ------------------------------------------------------------------------ */
/*
 * Pembagiannya disengaja dan angkanya ditulis di sini, bukan diserahkan ke
 * model:
 *
 *   - blok inti (zephyrFakta.ts)  : identitas, aturan, default setelan,
 *     pintasan, port, log, dan aturan \"jangan mengarang\" - selalu ikut tiap
 *     giliran, jadi harus tetap kecil.
 *   - indeks (berkas ini)         : SEMUA label antarmuka, perintah palet,
 *     tool, ekstensi bawaan, potongan dokumen yang dikirim bersama app, dan
 *     peta kode (berkas -> simbol). Dicari saat ada pertanyaan, bukan dibawa
 *     terus.
 *
 * Isi indeks TIDAK diketik tangan: semuanya dipanen dari sumber yang sama yang
 * dipakai aplikasi saat berjalan (kamus i18n, commandRegistry, catalog tool,
 * extCatalog, docs/*, src/**), jadi label atau perintah yang baru ditambahkan
 * tidak bisa \"ketinggalan\" tanpa membuat harness cakupan gagal.
 */
const BATAS_POTONGAN_DOKUMEN = 1800;
const BATAS_SIMBOL_BERKAS = 40;
const BATAS_TEKS_KODE = 1200;
/* Entri permukaan (`layar`) memuat daftar label/tooltip/testid sebuah komponen.
   1400 cukup untuk berkas komponen terbesar, dan tetap memotong yang keterlaluan
   dengan tanda elipsis - jadi panjang entri tidak ditentukan ukuran berkas. */
const BATAS_TEKS_LAYAR = 1400;

/* Jumlah kunci tiap kamus yang dipanen `labelAntarmuka()`, dilaporkan di akhir
   supaya kenaikan/penurunan cakupan label kelihatan sebagai ANGK A di keluaran
   generator - bukan cuma terlihat kalau orang menghitung ulang isi indeks. */
const JUMLAH_KAMUS = { i18n: 0, src: 0, extra: 0 };

/* Berkas yang isinya masuk hitungan hash: kalau salah satu berubah, hash di
   FAKTA_VERSI ikut berubah, dan harness bisa membuktikan indeks yang dibundel
   memang dibuat dari sumber versi ini - bukan dari salinan lama. Berkas HASIL
   (zephyrFakta.ts, zephyrIndeks.ts) sengaja TIDAK ikut, karena keduanya
   keluaran, bukan sumber. */
const SUMBER_HASH = [
  'package.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/src/settings.rs',
  'src-tauri/src/mcp_server.rs',
  'src/lib/settingsStore.ts',
  'src/lib/devBridge.ts',
  'src/lib/i18n.ts',
  'src/lib/i18n-src.ts',
  'src/lib/i18n-extra.ts',
  'src/lib/menu.ts',
  'src/lib/panelStore.ts',
  /* Jendela Agents ikut: label jendela, url `#agents`, dan daftar view panel
     kanannya menentukan entri `Agents window ...` yang dibaca model. */
  'src/lib/agentsWindow.ts',
  'src/lib/agentsTabs.ts',
  'src/components/agents/AgentsViewDropdown.tsx',
  'src/lib/aiTabsStore.ts',
  'src/components/shell/ActivityBar.tsx',
  'src/components/settings/SettingsNav.tsx',
  /* ChatSettingsPage.tsx sudah lama menentukan seksi Chat Settings, tapi belum
     pernah ikut hash - jadi indeks bisa menyebut daftar seksi yang sudah basi
     tanpa satu pun tanda. Sekarang ikut, seperti sumber lain. */
  'src/components/ai/ChatSettingsPage.tsx',
  'src/lib/commandRegistry.ts',
  'src/lib/extCatalog.ts',
  'src/lib/zephyrTools/catalog.ts',
  'src/lib/zephyrTools/deskripsiTool.ts',
  'vite.config.ts',
  /* Pop-up setelan ikut: judul, komponen seksi, store, kamus, dan pintu
     masuknya semuanya menentukan fakta yang dibaca model. */
  ...SUMBER_POPUP,
];

function versiAplikasi() {
  const tauri = JSON.parse(baca('src-tauri/tauri.conf.json'));
  const pkg = JSON.parse(baca('package.json'));
  return String(tauri.version ?? pkg.version ?? '0.0.0');
}

/* DAFTAR TERTUTUP berkas yang masuk hash, urut, dalam SATU tempat: hashSumber()
   memakainya untuk menghitung, dan generator MENCETAKNYA ke artefak. Kalau dua
   tempat menyusun daftar ini sendiri-sendiri, keduanya bisa berbeda diam-diam -
   dan cap yang tidak bisa dihitung ulang sama saja dengan tidak ada cap. */
function daftarHash() {
  return [...SUMBER_HASH, ...berkasPermukaan()];
}

function hashSumber() {
  const h = createHash('sha1');
  const masukkan = (nama, isi) => {
    h.update(nama);
    h.update('\u0000');
    h.update(isi);
    h.update('\u0000');
  };
  /* Berkas permukaan IKUT (lihat daftarHash), karena isi indeks bergantung
     padanya: label dan tombol dipanen dari JSX-nya. Berkas yang hilang dicatat
     sebagai '(tidak ada)' - jadi menghapus sumber JUGA menggeser hash. */
  for (const p of daftarHash()) {
    let isi = '';
    try {
      isi = baca(p);
    } catch {
      isi = '(tidak ada)';
    }
    masukkan(p, isi);
  }
  return h.digest('hex').slice(0, 16);
}

const potong = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function susunIndeks() {
  const entri = [];
  const tambah = (kat, kunci, teks) => {
    const k = String(kunci ?? '').trim();
    const t = String(teks ?? '').replace(/\s+/g, ' ').trim();
    if (k && t) entri.push([kat, k, t]);
  };

  /* Kolektornya dipanggil lagi di sini (bukan disimpan): biayanya cuma membaca
     berkas, dan menyimpan hasilnya di variabel bersama akan menambah satu
     keadaan yang bisa lupa disegarkan. */
  const setelan = setelanDefault();
  for (const [grup, isi] of Object.entries(setelan)) {
    if (isi && typeof isi === 'object' && !Array.isArray(isi)) {
      for (const [k, v] of Object.entries(isi)) {
        tambah('setelan', `${grup}.${k}`, `default: ${garis(v)} (grup ${grup})`);
      }
    } else tambah('setelan', grup, `default: ${garis(isi)} (level atas)`);
  }

  for (const p of shortcutBawaan()) {
    tambah(
      'pintasan',
      p.label,
      `tombol bawaan: ${p.tombol || '(tanpa bawaan)'} · grup ${p.grup} · id ${p.id}`,
    );
    /*
     * Sama seperti baris fakta: tombol yang ISINYA backtick ditulis sebagai
     * kata "backtick", supaya tidak ada satu pun tempat di bahan sumber yang
     * mencontohkan backtick nyasar setelah Ctrl+.
     */
    if (p.tombol) {
      const tombol = p.tombol === 'Ctrl+`' ? 'Ctrl+backtick' : p.tombol;
      tambah('pintasan', tombol, `untuk: ${p.label} · grup ${p.grup}`);
    }
  }

  const { diNav, tanpaNav, hanyaChat, popup } = seksiSetelan();
  for (const p of diNav) tambah('seksi', p, 'halaman Settings (ada di nav kiri)');
  for (const p of tanpaNav)
    tambah('seksi', p, 'halaman Settings yang TIDAK ada di nav - dibuka dari area agen/MCP atau Chat Settings');
  if (hanyaChat.length !== tanpaNav.length) throw new Error('indeks: daftar seksi di luar nav tidak utuh');
  /* Pop-up berdiri sendiri: kuncinya judul antarmukanya (`AI Models`) supaya
     pertanyaan "AI Models di mana?" mendarat di entri yang menjelaskan bahwa
     tempatnya BUKAN halaman Settings - plus id setelannya ikut di teks, jadi
     pencarian "models" juga sampai ke sini. */
  if (popup)
    tambah(
      'seksi',
      popup.judul,
      `BUKAN halaman Settings dan bukan seksi Chat Settings - pop-up berdiri sendiri (\`${popup.komponen}\` di ` +
        `\`${popup.berkas}\`, dibuka \`useAiModels.getState().buka()\`) tanpa baris di nav · grup setelan \`${popup.id}\` ` +
        `(${popup.grup.join(', ')}) · ${popup.pintu.length} pintu masuk: ${popup.pintu.map((p) => p.tempat).join(' · ')}`,
    );
  for (const s of seksiChat()) tambah('seksi', s, 'seksi di Chat Settings (panel AI)');

  /* Menu bar: satu entri per judul menu (isinya apa) + satu entri per item
     (item ini di menu mana, perintahnya apa). */
  for (const m of menuBar()) {
    const daftar = m.item.map((i) => (i.command ? `${i.label} → ${i.command}` : `${i.label} (submenu)`));
    tambah('menu', m.label, `menu bar Zephyr (Alt+${m.mnemonic.toUpperCase()}) · ${m.item.length} item: ${daftar.join(' · ')}`);
    for (const i of m.item)
      tambah(
        'menu',
        i.label,
        i.command ? `item menu \`${m.label}\` (Alt+${m.mnemonic.toUpperCase()}) · perintah ${i.command}` : `judul submenu di menu \`${m.label}\``,
      );
  }

  /* Panel, tab, dan tampilan sidebar. */
  const panel = panelTampilan();
  for (const t of panel.tab)
    tambah('panel', t.label, `tab panel bawah · id ${t.id} · perintah ${t.command}`);
  for (const t of panel.cli) tambah('panel', t.label, `tab CLI di panel AI · id ${t.id}`);
  for (const t of panel.tampilan)
    tambah(
      'panel',
      t.label,
      `ikon activity bar (sidebar) · id ${t.id}` + (t.rail >= 0 ? ` · urutan ${t.rail + 1} di rel` : ' · tidak di rel utama'),
    );

  const kamus = labelAntarmuka();
  for (const [kunci, v] of kamus.peta) {
    const bagian = [];
    if (v.en) bagian.push(`EN: ${v.en}`);
    if (v.id) bagian.push(`ID: ${v.id}`);
    if (v.lain.size) bagian.push(`+${v.lain.size} bahasa lain: ${[...v.lain].sort().join('/')}`);
    tambah('label', kunci, `label antarmuka · ${bagian.join(' · ') || 'belum diterjemahkan'}`);
  }

  for (const p of perintahPalet())
    tambah('perintah', p.judul, `perintah palet · id ${p.id} · grup ${p.grup}`);

  for (const t of toolKatalog())
    tambah(
      'tool',
      t.nama,
      `tool · kelompok ${t.grup} · efek ${t.efek} · perlu izin: ${t.izin ? 'ya' : 'tidak'}` +
        (t.deskripsi ? ` · ${t.deskripsi}` : ''),
    );

  for (const e of ekstensiBundel())
    tambah('ekstensi', e.id, `ekstensi bawaan · ${e.nama} · kategori ${e.kategori || '(tanpa kategori)'}`);

  const { vite, cdp } = portDev();
  tambah('port', 'vite dev UI', `port ${vite} (dev server antarmuka)`);
  tambah('port', 'CDP WebView2', `port ${cdp} dicadangkan untuk debug WebView2, tidak pernah dipakai MCP`);
  tambah('port', 'MCP server', `default mcp.port=${garis((setelan.mcp ?? {}).port)}`);
  tambah('port', 'log Zephyr', '%APPDATA%\\zephyr\\logs\\zephyr-YYYY-MM-DD.log, rotasi zephyr-1.log dst');
  tambah('bridge', 'window.__ZEPHYR_*__', `bridge dev untuk membaca store yang sama dengan UI: ${namaBridge().join(', ')}`);

  /* Jendela Agents: entri per layar, lebih dulu daripada panen permukaan supaya
     teks yang sudah dijelaskan di sini tidak dibuatkan entri kedua yang lebih
     sempit ("tombol ini di berkas mana") tanpa konteks halamannya. */
  for (const e of jendelaAgents()) tambah('layar', e.kunci, potong(e.teks, BATAS_TEKS_LAYAR));

  for (const d of dokumenBundel())
    tambah('dokumen', `${d.nama}#${d.judul}`, potong(d.teks, BATAS_POTONGAN_DOKUMEN));

  for (const f of petaKode()) {
    const simbol =
      f.simbol.length > BATAS_SIMBOL_BERKAS
        ? `${f.simbol.slice(0, BATAS_SIMBOL_BERKAS).join(', ')}, …(+${f.simbol.length - BATAS_SIMBOL_BERKAS})`
        : f.simbol.join(', ');
    tambah(
      'kode',
      f.rel,
      potong(
        `${f.baris} baris · ${f.ringkas ? `${f.ringkas} · ` : ''}` +
          `${f.simbol.length ? `ekspor: ${simbol}` : 'tanpa ekspor'}`,
        BATAS_TEKS_KODE,
      ),
    );
  }

  /* Permukaan antarmuka: tombol/tooltip/teks yang benar-benar dirender komponen.
     Ditaruh paling akhir supaya daftar kunci yang sudah dikenal sudah lengkap -
     teks yang sudah dijelaskan kategori lain tidak dibuatkan entri kedua di sini.
     Yang kurang dari entri lama bukan keberadaan teksnya, melainkan TEMPATNYA,
     dan itu dijawab entri per-berkas di bawah. */
  const permukaan = permukaanUI(new Set(kamus.peta.keys()));
  for (const f of permukaan.berkas) tambah('layar', f.komponen, potong(f.teks, BATAS_TEKS_LAYAR));
  const kunciDikenal = new Set(entri.map((e) => e[1].toLowerCase()));
  for (const p of permukaan.belum) {
    if (kunciDikenal.has(p.teks.toLowerCase())) continue;
    tambah(
      'layar',
      p.teks,
      potong(
        `${p.jenis.join('/')} di layar · dirender ${p.berkas.length} berkas: ${p.berkas.slice(0, 6).join(', ')}`,
        BATAS_TEKS_LAYAR,
      ),
    );
  }

  entri.sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0,
  );
  return entri;
}

const indeksEntri = susunIndeks();
const kategoriTerpakai = [...new Set(indeksEntri.map((e) => e[0]))].sort();
const jumlahKategori = Object.fromEntries(
  kategoriTerpakai.map((k) => [k, indeksEntri.filter((e) => e[0] === k).length]),
);
const versiApp = versiAplikasi();
const hashIndeks = hashSumber();
const tujuanIndeks = join(akar, 'src/lib/zephyrIndeks.ts');
const indeksTsv = `/* BERKAS HASIL GENERATE - jangan disunting tangan.
 * Dihasilkan oleh scripts/gen-fakta-zephyr.mjs. Isinya ${indeksEntri.length} entri
 * (${kategoriTerpakai.map((k) => `${k}=${jumlahKategori[k]}`).join(', ')}).
 *
 * Kenapa ada: pertanyaan soal Zephyr sendiri (\"label tombol ini apa\", \"perintah
 * itu id-nya apa\", \"fitur X di berkas mana\") tidak boleh dijawab dari ingatan
 * dan tidak boleh menuntut folder proyek user. Semuanya dipanen dari sumber yang
 * dipakai aplikasi saat berjalan; yang TIDAK muat di blok inti (label, perintah,
 * tool, ekstensi, dokumen, peta kode) tinggal di sini dan dicari lewat
 * src/lib/zephyrCari.ts.
 *
 * Kenapa bukan grep: aplikasi yang dipasang user tidak membawa folder sumbernya,
 * jadi pencarian harus jalan dari data yang IKUT BUNDEL - bukan dari disk user.
 *
 * Versi app: ${versiApp} · hash sumber: ${hashIndeks}
 * Hasilkan ulang: node scripts/gen-fakta-zephyr.mjs
 * Periksa sinkron: node scripts/gen-fakta-zephyr.mjs --check
 */
export type FaktaKategori = ${kategoriTerpakai.map((k) => `'${k}'`).join(' | ')};

/** Satu fakta: [kategori, kunci yang dicari, teks jawabannya]. */
export type FaktaEntri = readonly [kat: FaktaKategori, kunci: string, teks: string];

export const FAKTA_KATEGORI: readonly FaktaKategori[] = [${kategoriTerpakai.map((k) => `'${k}'`).join(', ')}];

/** Versi aplikasi + hash sumber yang menghasilkan indeks ini. Dipakai untuk
 *  menjawab \"fakta ini basi atau tidak\", bukan untuk pamer. */
/* Bentuk baris ini SENGAJA tetap tertutup - dua checker luar mencocokkannya
   dengan pola 'FAKTA_VERSI = { aplikasi: ..., hashSumber: ... }':
   scripts/cek-indeks-sinkron.mjs:65 dan scripts/uji-versi-indeks.mjs:111.
   Menambah field di baris yang sama membuat capnya TIDAK TERBACA, dan cap yang
   tidak terbaca sama saja dengan tidak ada cap. Angka berkas/entri yang juga
   dilaporkan --print-cakupan bisa diturunkan dari artefak yang sama:
   FAKTA_HASH_BERKAS.length (berkas) dan FAKTA_INDEKS.length (entri) di bawah. */
export const FAKTA_VERSI = { aplikasi: '${versiApp}', hashSumber: '${hashIndeks}' } as const;

/** Berkas (nama relatif, urut) yang isinya masuk hashSumber, plus resep
 *  hitungnya. Dengan ini cap bisa DIHITUNG ULANG dari luar generator - di mesin
 *  kerja, harness, atau saat repo terbuka - tanpa menyalin daftarnya tangan.
 *  Urutannya sama dengan urutan hashSumber() memasukkan isi tiap berkas;
 *  berkas yang HILANG ikut terdaftar dan dihitung sebagai '(tidak ada)'. */
export const FAKTA_HASH_BERKAS: readonly string[] = [
${daftarHash().map((p) => `  ${JSON.stringify(p)},`).join('\n')}
];
export const FAKTA_HASH_ALGO = 'sha1:hex[0:16] atas urutan (nama\\u0000 isi\\u0000); berkas hilang = "(tidak ada)"';

export const FAKTA_INDEKS: readonly FaktaEntri[] = [
${indeksEntri.map((e) => `  ${JSON.stringify(e)},`).join('\n')}
];
`;

/* --print-keys: cetak semua kunci setelan (group.key) sebagai JSON. Harness
   memakainya untuk membuktikan TIAP kunci benar-benar muncul di teks fakta -
   tanpa menyalin parser ini ke dalam harness. */
if (process.argv.includes('--print-keys')) {
  const s = setelanDefault();
  const kunci = [];
  for (const [grup, isi] of Object.entries(s)) {
    if (isi && typeof isi === 'object' && !Array.isArray(isi)) {
      for (const k of Object.keys(isi)) kunci.push(`${grup}.${k}`);
    } else kunci.push(grup);
  }
  console.log(JSON.stringify(kunci));
  process.exit(0);
}

/* --print-cakupan: cetak SEMUA kunci indeks per kategori sebagai JSON, plus
   versi app + hash sumber. Dipakai scripts/cek-cakupan-fakta.mjs untuk
   membuktikan tidak ada label/perintah/tool/berkas yang tertinggal dari data
   yang benar-benar dibundel di aplikasi. */
if (process.argv.includes('--print-cakupan')) {
  const kumpul = (kat) => indeksEntri.filter((e) => e[0] === kat).map((e) => e[1]);
  console.log(
    JSON.stringify({
      versi: versiApp,
      hashSumber: hashIndeks,
      jumlah: jumlahKategori,
      kategori: kategoriTerpakai,
      kunci: Object.fromEntries(kategoriTerpakai.map((k) => [k, kumpul(k)])),
    }),
  );
  process.exit(0);
}

if (process.argv.includes('--check')) {
  const periksa = (berkas, isi, label) => {
    let lama = '';
    try {
      lama = readFileSync(berkas, 'utf8');
    } catch {
      console.error(`${label} belum ada - jalankan: node scripts/gen-fakta-zephyr.mjs`);
      process.exit(1);
    }
    if (lama !== isi) {
      console.error(`${label} TIDAK SINKRON dengan sumbernya.
Jalankan: node scripts/gen-fakta-zephyr.mjs`);
      process.exit(1);
    }
  };
  periksa(tujuan, tsv, 'src/lib/zephyrFakta.ts');
  periksa(tujuanIndeks, indeksTsv, 'src/lib/zephyrIndeks.ts');
  console.log(
    `sinkron: zephyrFakta.ts ${tsv.length} byte + zephyrIndeks.ts ${indeksTsv.length} byte ` +
      `(${indeksEntri.length} entri; ${kategoriTerpakai.map((k) => `${k}=${jumlahKategori[k]}`).join(', ')}).`,
  );
  process.exit(0);
}

writeFileSync(tujuan, tsv, 'utf8');
writeFileSync(tujuanIndeks, indeksTsv, 'utf8');
console.log(
  `tulis src/lib/zephyrFakta.ts ${tsv.length} byte + src/lib/zephyrIndeks.ts ${indeksTsv.length} byte ` +
    `(${indeksEntri.length} entri; ${kategoriTerpakai.map((k) => `${k}=${jumlahKategori[k]}`).join(', ')}).`,
);
console.log(
  `kamus antarmuka dipanen: i18n.ts=${JUMLAH_KAMUS.i18n} pasangan, i18n-src.ts=${JUMLAH_KAMUS.src}, ` +
    `i18n-extra.ts=${JUMLAH_KAMUS.extra} → ${jumlahKategori.label} kunci label unik masuk indeks ` +
    `(+${jumlahKategori.layar} entri permukaan layar dari ${berkasPermukaan().length} berkas komponen).`,
);
