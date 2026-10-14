/**
 * aiZephyrState.ts
 *
 * Potret KEAADAAN RUNTIME Zephyr, dibaca saat itu juga, untuk Zephyr AI.
 *
 * `zephyrFakta.ts` + `zephyrIndeks.ts` tahu fakta STATIS (apa saja perintahnya,
 * di berkas mana sesuatu tinggal). Keduanya tidak tahu apa-apa tentang sesi yang
 * sedang berjalan, jadi AI-nya menjawab "belum tahu" untuk pertanyaan tentang
 * dirinya sendiri: setelan mana yang dipakai, ekstensi mana yang terpasang dan
 * mana yang gagal dimuat, LSP, MCP, layout, versi aplikasi. Berkas ini menutup
 * celah itu dengan SATU potret yang bisa disuntikkan ke prompt tiap giliran.
 *
 * Bentuknya sengaja dua lapis:
 *
 *   1. `susunKeadaan(sumber)` - MURNI. Nol impor store, nol `invoke`, nol
 *      jaringan, nol jam dinding. Semua data masuk lewat `SumberKeadaan`
 *      (dependency injection). Dampaknya: seluruh aturan "BISA dipakai vs TIDAK
 *      dipakai, dan alasannya apa" bisa diuji di Node tanpa Tauri, dan hasilnya
 *      deterministik - dua panggilan dengan sumber yang sama menghasilkan
 *      keluaran yang sama persis. Itu syarat agar potret ini aman dipotret
 *      ulang tiap giliran tanpa membuat prompt bergoyang sendiri.
 *
 *   2. `kumpulkanDariApp()` - ADAPTER tipis yang membaca store + perintah
 *      Tauri yang NYATA. Di dalamnya semua `import()` bersifat DINAMIS, jadi
 *      modul ini tetap bisa diimpor di Node (tanpa Tauri, tanpa DOM) dan tidak
 *      ada satu pun modul store/@tauri-apps yang ikut dimuat saat impor.
 *
 * ATURAN "BISA DIPAKAI vs TIDAK" DITULIS DI SINI, BUKAN DISERAHKAN KE MODEL.
 * Model yang harus menyimpulkan sendiri "paket ini tidak dipakai karena
 * grammar TextMate" akan menebak, dan tebakan yang salah lebih buruk daripada
 * jawaban "belum tahu" yang jujur. Jadi keputusan itu diambil kode: tiap paket
 * keluar dengan `status` dan `alasan` yang sudah pasti. Lihat
 * `nilaiEkstensi()` - di situlah tabel aturannya.
 */

/* ───────────────────────── 1. Data yang dibaca dari app ───────────────── */

export interface VersiApp {
  versi: string;
  arsitektur?: string;
  webview?: string;
  dataDir?: string;
  portable?: boolean;
}

export interface StatusUpdate {
  /** Nilai `UpdateStatus` updaterStore: idle | checking | up-to-date | available | ... */
  status: string;
  versi?: string | null;
  pesan?: string | null;
}

export interface SettingAktif {
  provider?: string;
  model?: string;
  bahasaJawaban?: string;
  gayaJawaban?: string;
  /** aiStore.approvalMode: auto | ask | work | readonly */
  modePersetujuan?: string;
  /** settings.subagent.allowWrite - gerbang SEMUA tulis berkas subagent. */
  izinTulisSubagent?: boolean;
  ragAktif?: boolean;
  temaAktif?: string;
  bahasaUi?: string;
  posisiSidebar?: string;
  layoutEditor?: string;
  /** settings.general.aiPanel: right | editor | window */
  panelAi?: string;
  perintahDiizinkan?: number;
}

export interface WorkspaceKeadaan {
  folder: string | null;
  berkasAktif?: string | null;
  berkasTerbuka?: number;
  belumDisimpan?: number;
  akar?: string[];
  terpercaya?: boolean;
}

export interface LayoutKeadaan {
  panelAi: string;
  kolomAiTerlihat: boolean;
  lebarKolomAi?: number;
  kolomAiMaksimal?: boolean;
  panelBawahTerlihat?: boolean;
  panelBawahTabAktif?: string;
  panelBawahTabTersedia?: string[];
  panelBawahTabTerlihat?: string[];
  sidebarTerlihat?: boolean;
  sidebarPosisi?: string;
  aktivitasSidebar?: string;
  infoSubagentDiKanan?: boolean;
}

export interface McpKeadaan {
  hidup: boolean;
  port?: number | null;
  portDiminta?: number | null;
  diaktifkan?: boolean;
  /**
   * Server MCP luar. SENGAJA hanya id/label/url: `McpServer.token` tidak pernah
   * ikut, karena potret ini berakhir di dalam prompt. Query/hash juga dibuang
   * dari url supaya token yang menempel di query tidak ikut terbawa.
   */
  serverLuar?: Array<{ id: string; label?: string; url?: string }>;
  galat?: string | null;
}

export interface LspKeadaan {
  aktif?: Array<{ server: string; pid: number }>;
  probe?: Array<{ server: string; ok: boolean; exe?: string; error?: string }>;
  galat?: string | null;
  serverDikonfigurasi?: string[];
}

/**
 * Satu jenis kontribusi milik satu paket, apa adanya.
 *
 * `diminta` vs `dipakai` adalah inti aturan: loader ekstensi (`extLoader.ts`)
 * melaporkan jumlah yang BENAR-BENAR dicatat sistem, bukan jumlah yang ditulis
 * manifest. Selisihnya itulah "TIDAK dipakai", dan `galat`/`alasanDilewati`
 * menyebut sebabnya.
 */
export interface KontribusiMasuk {
  /** themes | keymaps | snippets | languages | iconThemes | commands | grammars */
  jenis: string;
  diminta: number;
  dipakai: number;
  /** Gagal dibaca/dimatikan loader (berkas hilang, JSON rusak, ...). */
  galat?: string;
  /** Diterima tapi tidak berpengaruh (binding tanpa command, .ext sudah ada, ...). */
  alasanDilewati?: string[];
}

export interface EkstensiMasuk {
  id: string;
  nama: string;
  versi: string;
  enabled: boolean;
  /** false = masih di katalog bundled, belum pernah di-Install. */
  terpasang: boolean;
  dariKatalog: boolean;
  kontribusi: KontribusiMasuk[];
  /** Manifest sendiri tidak bisa dibaca (ExtManifestStatus.error). */
  error?: string | null;
  engineOk?: boolean;
  butuhEngine?: string;
  /** Kegagalan loader yang tidak bisa dilekatkan ke satu jenis kontribusi. */
  gagalUmum?: string[];
  perluReload?: boolean;
}

export type EkstensiStatus = 'ok' | 'gagal' | 'tak-terpakai';

export interface EkstensiKeadaan {
  id: string;
  nama: string;
  versi: string;
  jenis: string[];
  status: EkstensiStatus;
  alasan?: string;
  /** Bisa dipakai, tapi tidak seluruhnya - mis. sebagian binding inert. */
  catatan?: string;
  bisaDipakai: boolean;
}

export interface PotretKeadaan {
  versi: VersiApp | null;
  update: StatusUpdate | null;
  setting: SettingAktif | null;
  workspace: WorkspaceKeadaan | null;
  layout: LayoutKeadaan | null;
  mcp: McpKeadaan | null;
  lsp: LspKeadaan | null;
  ekstensi: EkstensiKeadaan[];
  /** Nama sumber yang gagal dibaca; sisanya tetap dilaporkan apa adanya. */
  gagalBaca: string[];
}

/**
 * Pembaca yang DISUNTIKKAN. Semuanya async dan mengembalikan data sederhana -
 * bukan store, bukan hasil `invoke` mentah - supaya `susunKeadaan` tidak perlu
 * tahu apa-apa tentang zustand atau Tauri.
 */
export interface SumberKeadaan {
  versiApp: () => Promise<VersiApp>;
  statusUpdate: () => Promise<StatusUpdate>;
  settingAktif: () => Promise<SettingAktif>;
  workspace: () => Promise<WorkspaceKeadaan | null>;
  layout: () => Promise<LayoutKeadaan>;
  mcp: () => Promise<McpKeadaan>;
  lsp: () => Promise<LspKeadaan>;
  ekstensi: () => Promise<EkstensiMasuk[]>;
}

/* ───────────────────────────── 2. Aturan status ───────────────────────── */

/*
 * Urutannya berpengaruh dan itu disengaja: yang PALING menentukan sebabnya
 * diperiksa lebih dulu. Manifest yang tidak terbaca menjelaskan lebih banyak
 * daripada "belum dipasang", dan setelan yang mati tidak menjelaskan apa-apa
 * kalau berkasnya memang rusak.
 *
 * "Belum dipasang" dan "dimatikan" sengaja diperiksa SEBELUM aturan tema:
 * paket katalog bundled yang belum di-Install tidak pernah dimuat loader, jadi
 * menghitungnya sebagai "tema tidak menghasilkan token" akan menuduh paket
 * yang belum pernah dicoba. Aturan tema hanya bicara soal paket yang memang
 * dipasang dan menyala.
 *
 *   R1 manifest tidak terbaca            -> gagal
 *   R2 mesin (engine) tidak cocok        -> gagal
 *   R3 satu jenis kontribusi gagal baca  -> gagal
 *   R4 belum dipasang (masih di katalog) -> tak-terpakai
 *   R5 dimatikan user                    -> tak-terpakai
 *   R6 tema diminta, nol token dihasilkan-> gagal
 *   R7 kegagalan loader lain             -> gagal
 *   R8 tidak ada satu pun jenis yang terpakai -> tak-terpakai
 *   R9 sisanya                           -> ok (bisaDipakai)
 */

const URUT_KONTRIBUSI = ['themes', 'snippets', 'iconThemes', 'keymaps', 'languages', 'commands', 'grammars'];

/** Jenis kontribusi yang Zephyr memang belum punya mesinnya. */
const JENIS_TAK_DIDUKUNG: Record<string, string> = {
  grammars: 'Zephyr belum punya mesin TextMate - penyorotan warna tetap memakai bahasa bawaan',
};

const urutTeks = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const unikTerurut = (xs: string[]): string[] => Array.from(new Set(xs)).sort(urutTeks);

/** Buang duplikat TANPA mengubah urutan - urutan tab panel itu bermakna. */
const unikUrut = (xs: string[]): string[] => Array.from(new Set(xs));

const rapikanSebab = (jenis: string, teks: string): string => {
  const awalan = `${jenis}: `;
  return teks.startsWith(awalan) ? teks.slice(awalan.length) : teks;
};

const urutJenis = (xs: string[]): string[] =>
  unikTerurut(xs).sort((a, b) => {
    const ia = URUT_KONTRIBUSI.indexOf(a);
    const ib = URUT_KONTRIBUSI.indexOf(b);
    if (ia === -1 && ib === -1) return urutTeks(a, b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

/**
 * Satu paket ekstensi -> status + alasan. Lihat tabel R1-R9 di atas.
 */
export function nilaiEkstensi(e: EkstensiMasuk): EkstensiKeadaan {
  const jenis = urutJenis(e.kontribusi.filter((k) => k.diminta > 0).map((k) => k.jenis));
  const dasar = { id: e.id, nama: e.nama, versi: e.versi, jenis };
  const gagal = (alasan: string): EkstensiKeadaan => ({
    ...dasar,
    status: 'gagal',
    alasan,
    bisaDipakai: false,
  });
  const takTerpakai = (alasan: string): EkstensiKeadaan => ({
    ...dasar,
    status: 'tak-terpakai',
    alasan,
    bisaDipakai: false,
  });

  // R1
  if (e.error) return gagal(`manifest tidak bisa dibaca: ${e.error}`);
  // R2
  if (e.engineOk === false) {
    return gagal(
      e.butuhEngine
        ? `butuh Zephyr ${e.butuhEngine}, versi aplikasi tidak cocok`
        : 'versi mesin (engine) tidak cocok',
    );
  }
  // R3 - galat baca milik satu jenis kontribusi
  const kontribusiGagal = e.kontribusi.find((k) => !!k.galat);
  if (kontribusiGagal) return gagal(kontribusiGagal.galat as string);
  // R4
  if (!e.terpasang) {
    return takTerpakai(
      e.dariKatalog ? 'belum dipasang (opt-in dari Marketplace)' : 'belum dipasang',
    );
  }
  // R5
  if (!e.enabled) return takTerpakai('dimatikan di Settings › Extensions');
  // R6 - paket bertema yang tokennya nol hasil
  const tema = e.kontribusi.find((k) => k.jenis === 'themes' && k.diminta > 0);
  if (tema && tema.dipakai === 0) {
    return gagal('berkas tema tidak menghasilkan token yang dikenali');
  }
  // R7
  const gagalUmum = (e.gagalUmum ?? []).filter(Boolean);
  if (gagalUmum.length > 0) return gagal(gagalUmum[0]);

  // R8 - ada jenis yang diminta, tapi tidak satu pun benar-benar terpakai
  const dipakaiAda = e.kontribusi.some((k) => k.diminta > 0 && k.dipakai > 0);
  if (!dipakaiAda) {
    const sebab: string[] = [];
    for (const k of e.kontribusi) {
      if (k.diminta <= 0) continue;
      const jenjang = JENIS_TAK_DIDUKUNG[k.jenis];
      const dilewati = (k.alasanDilewati ?? [])[0];
      sebab.push(`${k.jenis}: ${rapikanSebab(k.jenis, dilewati ?? jenjang ?? 'tidak dipakai loader')}`);
    }
    if (sebab.length === 0) {
      return takTerpakai(
        'tidak menyumbang apa pun yang dikenali Zephyr (themes/snippets/icons/keymaps/languages/commands)',
      );
    }
    return takTerpakai(sebab[0]);
  }

  // R9 - bisa dipakai; catat sisa yang tidak ikut terpakai supaya tidak hilang
  const sisa: string[] = [];
  for (const k of e.kontribusi) {
    if (k.diminta <= 0) continue;
    const dilewati = k.alasanDilewati ?? [];
    const kurang = k.dipakai < k.diminta;
    if (dilewati.length === 0 && !kurang) continue;
    const jenjang = JENIS_TAK_DIDUKUNG[k.jenis];
    const sebab = rapikanSebab(k.jenis, dilewati[0] ?? jenjang ?? 'sebagian tidak dipakai loader');
    sisa.push(`${k.jenis}: ${sebab}`);
  }
  const catatan = sisa.length > 0 ? `sebagian tidak dipakai - ${sisa.join('; ')}` : undefined;
  const restart = e.perluReload ? 'aktif setelah aplikasi dimuat ulang' : undefined;
  const gabung = [catatan, restart].filter(Boolean).join('; ');

  return {
    ...dasar,
    status: 'ok',
    bisaDipakai: true,
    ...(gabung ? { catatan: gabung } : {}),
  };
}

/* ───────────────────────────── 3. Inti murni ──────────────────────────── */

const normalisasiWorkspace = (w: WorkspaceKeadaan): WorkspaceKeadaan => ({
  ...w,
  akar: w.akar ? unikTerurut(w.akar) : undefined,
});

const normalisasiLayout = (l: LayoutKeadaan): LayoutKeadaan => ({
  ...l,
  panelBawahTabTersedia: unikUrut(l.panelBawahTabTersedia ?? []),
  panelBawahTabTerlihat: unikUrut(l.panelBawahTabTerlihat ?? []),
});

const normalisasiMcp = (m: McpKeadaan): McpKeadaan => ({
  ...m,
  serverLuar: (m.serverLuar ?? [])
    .map((s) => ({ ...s, url: s.url ? tanpaRahasia(s.url) : undefined }))
    .sort((a, b) => urutTeks(a.id, b.id)),
});

/** Buang query/hash: token yang menempel di url tidak perlu ikut ke prompt. */
const tanpaRahasia = (url: string): string => {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
};

const normalisasiLsp = (l: LspKeadaan): LspKeadaan => ({
  ...l,
  aktif: (l.aktif ?? []).slice().sort((a, b) => urutTeks(a.server, b.server)),
  probe: (l.probe ?? []).slice().sort((a, b) => urutTeks(a.server, b.server)),
  serverDikonfigurasi: l.serverDikonfigurasi ? unikTerurut(l.serverDikonfigurasi) : undefined,
});

/**
 * Susun potret dari sumber yang disuntikkan. Murni: tidak ada impor store, tidak
 * ada `invoke`, tidak ada jaringan, tidak ada waktu. Sumber yang melempar tidak
 * menggagalkan seluruh potret - namanya dicatat di `gagalBaca`, bagian itu
 * menjadi null, sisanya tetap dilaporkan.
 */
export async function susunKeadaan(s: SumberKeadaan): Promise<PotretKeadaan> {
  const gagalBaca: string[] = [];

  const ambil = async <T>(nama: string, kerja: () => Promise<T>): Promise<T | null> => {
    try {
      return await kerja();
    } catch {
      gagalBaca.push(nama);
      return null;
    }
  };

  // Urutan pembacaan tetap supaya `gagalBaca` deterministik.
  const versi = await ambil('versiApp', () => s.versiApp());
  const update = await ambil('statusUpdate', () => s.statusUpdate());
  const setting = await ambil('settingAktif', () => s.settingAktif());
  const ws = await ambil('workspace', () => s.workspace());
  const layout = await ambil('layout', () => s.layout());
  const mcp = await ambil('mcp', () => s.mcp());
  const lsp = await ambil('lsp', () => s.lsp());
  const ekstensiMentah = await ambil('ekstensi', () => s.ekstensi());

  const ekstensi = (ekstensiMentah ?? [])
    .map(nilaiEkstensi)
    .sort((a, b) => urutTeks(a.id, b.id));

  return {
    versi,
    update,
    setting,
    workspace: ws && ws.folder ? normalisasiWorkspace(ws) : null,
    layout: layout ? normalisasiLayout(layout) : null,
    mcp: mcp ? normalisasiMcp(mcp) : null,
    lsp: lsp ? normalisasiLsp(lsp) : null,
    ekstensi,
    gagalBaca,
  };
}

/* ─────────────────────── 4. Ringkasan untuk prompt ────────────────────── */

const teksUpdate = (u: StatusUpdate): string => {
  const versi = u.versi ? ` ${u.versi}` : '';
  if (u.status === 'up-to-date') return 'sudah versi terbaru';
  if (u.status === 'available') return `tersedia${versi}`;
  if (u.status === 'downloading') return `mengunduh${versi}`;
  if (u.status === 'ready') return `siap dipasang${versi}`;
  if (u.status === 'unconfigured') return 'pemeriksaan update belum dikonfigurasi';
  return u.pesan ? `${u.status}: ${u.pesan}` : u.status;
};

const teksWorkspace = (w: WorkspaceKeadaan): string => {
  const bagian = [
    `${w.folder}`,
    `${w.berkasTerbuka ?? 0} berkas terbuka`,
    `${w.belumDisimpan ?? 0} belum disimpan`,
    `aktif: ${w.berkasAktif ?? '-'}`,
  ];
  if (w.terpercaya === false) bagian.push('folder belum dipercaya');
  if (w.akar && w.akar.length > 1) bagian.push(`${w.akar.length} root`);
  return bagian.join(' · ');
};

const teksLayout = (l: LayoutKeadaan): string => {
  const kolom = l.kolomAiTerlihat
    ? `terlihat${l.lebarKolomAi ? ` ${l.lebarKolomAi}px` : ''}${l.kolomAiMaksimal ? ' (maksimal)' : ''}`
    : 'tersembunyi';
  const bawah = l.panelBawahTerlihat === false
    ? 'panel bawah tertutup'
    : `panel bawah ${l.panelBawahTabAktif ?? '-'}${l.panelBawahTabTerlihat && l.panelBawahTabTerlihat.length > 0 ? ` [${l.panelBawahTabTerlihat.join(', ')}]` : ''}`;
  const sisi = l.sidebarTerlihat === false
    ? 'sidebar tertutup'
    : `sidebar ${l.sidebarPosisi ?? '-'}${l.aktivitasSidebar ? ` (${l.aktivitasSidebar})` : ''}`;
  return `panel AI ${l.panelAi} ${kolom} · ${bawah} · ${sisi}${l.infoSubagentDiKanan ? ' · info subagent di kanan' : ''}`;
};

const barisInti = (p: PotretKeadaan): string[] => {
  const L: string[] = [];
  const v = p.versi;
  L.push(
    `versi: ${v ? v.versi : '(tidak terbaca)'}` +
      (v?.arsitektur ? ` · ${v.arsitektur}` : '') +
      (v?.webview ? ` · ${v.webview}` : '') +
      (v?.portable === true ? ' · portable' : ''),
  );
  L.push(`update: ${p.update ? teksUpdate(p.update) : '(tidak ada kabar)'}`);
  L.push(`workspace: ${p.workspace ? teksWorkspace(p.workspace) : '(tidak ada folder dibuka)'}`);
  L.push(`layout: ${p.layout ? teksLayout(p.layout) : '(tidak diketahui)'}`);
  if (p.gagalBaca.length > 0) L.push(`sumber tidak terbaca: ${p.gagalBaca.join(', ')}`);
  return L;
};

/**
 * Bagian terpenting dari potret: yang TIDAK bisa dipakai, dan kenapa. Baris di
 * sini tidak dibuang saat memotong - lihat `ringkasKeadaan`.
 */
const barisMasalahEkstensi = (p: PotretKeadaan): string[] => {
  const rusak = p.ekstensi.filter((e) => e.status !== 'ok');
  if (rusak.length === 0) return [];
  const L = [`ekstensi gagal/tak dipakai (${rusak.length}):`];
  for (const e of rusak) {
    const tanda = e.status === 'gagal' ? '✗' : '○';
    L.push(`- ${tanda} ${e.id} v${e.versi} (${e.status}) - ${e.alasan ?? 'tanpa alasan tercatat'}`);
  }
  return L;
};

const barisSetting = (p: PotretKeadaan): string[] => {
  const s = p.setting;
  if (!s) return [];
  const bagian: string[] = [];
  if (s.provider || s.model) bagian.push(`provider=${s.provider ?? '-'} model=${s.model ?? '-'}`);
  if (s.modePersetujuan) bagian.push(`persetujuan=${s.modePersetujuan}`);
  bagian.push(`tulis-subagent=${s.izinTulisSubagent === true ? 'ya' : 'tidak'}`);
  bagian.push(`rag=${s.ragAktif === true ? 'ya' : 'tidak'}`);
  if (s.bahasaJawaban) bagian.push(`bahasa=${s.bahasaJawaban}`);
  if (s.gayaJawaban) bagian.push(`gaya=${s.gayaJawaban}`);
  if (s.temaAktif) bagian.push(`tema=${s.temaAktif}`);
  if (s.bahasaUi) bagian.push(`ui=${s.bahasaUi}`);
  if (typeof s.perintahDiizinkan === 'number') bagian.push(`perintah-diizinkan=${s.perintahDiizinkan}`);
  return [`setelan: ${bagian.join(' ')}`];
};

const barisSisa = (p: PotretKeadaan): string[] => {
  const L: string[] = [];
  const ok = p.ekstensi.filter((e) => e.status === 'ok');
  L.push(
    ok.length > 0
      ? `ekstensi dipakai (${ok.length}): ${ok.map((e) => `${e.id} [${e.jenis.join('/')}]`).join(', ')}`
      : 'ekstensi dipakai: tidak ada',
  );
  const catatan = p.ekstensi.filter((e) => e.catatan);
  for (const e of catatan) L.push(`catatan ${e.id}: ${e.catatan}`);
  if (p.lsp) {
    const aktif = (p.lsp.aktif ?? []).map((a) => `${a.server}(${a.pid})`).join(', ') || 'tidak ada';
    const probe = (p.lsp.probe ?? [])
      .map((q) => `${q.server} ${q.ok ? 'ok' : `gagal${q.error ? `: ${q.error}` : ''}`}`)
      .join(', ');
    L.push(`lsp: aktif ${aktif}${probe ? ` · probe ${probe}` : ''}${p.lsp.galat ? ` · galat: ${p.lsp.galat}` : ''}`);
  } else {
    L.push('lsp: (tidak terbaca)');
  }
  if (p.mcp) {
    const server = (p.mcp.serverLuar ?? []).map((x) => x.id).join(', ');
    L.push(
      `mcp: ${p.mcp.hidup ? `hidup${p.mcp.port ? ` port ${p.mcp.port}` : ''}` : 'mati'}` +
        `${p.mcp.diaktifkan === false ? ' (dimatikan)' : ''}` +
        `${server ? ` · server luar: ${server}` : ''}` +
        `${p.mcp.galat ? ` · galat: ${p.mcp.galat}` : ''}`,
    );
  } else {
    L.push('mcp: (tidak terbaca)');
  }
  return L;
};

const pendek = (baris: string, lebar: number): string =>
  baris.length <= lebar ? baris : `${baris.slice(0, Math.max(1, lebar - 1)).replace(/\s+$/, '')}…`;

const PENANDA_POTONG = '… (terpotong)';

/**
 * Baris kepala potret. Dipisah jadi fungsi supaya teksnya punya SATU tempat,
 * dan supaya nanti bisa diambil dari kamus tanpa menyentuh `rakit()`.
 *
 * TODO(i18n - PROMPT 7): kepala (dan seluruh baris label di berkas ini) masih
 * satu bahasa tetap dan belum punya kunci kamus. Usulan kunci kamus:
 * `ai.state.snapshotHead`. Setelah kunci itu ada, fungsi INI yang mengembalikan
 * hasil terjemahannya.
 */
export function kepalaKeadaan(): string {
  return 'ZEPHYR · KEADAAN RUNTIME';
}

const rakit = (bagian: string[][]): string => {
  const baris: string[] = [kepalaKeadaan()];
  for (const b of bagian) baris.push(...b);
  return baris.join('\n');
};

const potongPaksa = (teks: string, batas: number): string => {
  const jatah = batas - PENANDA_POTONG.length - 1;
  if (jatah <= 0) return teks.slice(0, batas);
  return `${teks.slice(0, jatah).replace(/\s+$/, '')}\n${PENANDA_POTONG}`;
};

/**
 * Teks ringkas untuk disuntikkan ke prompt. DIJAMIN tidak lebih panjang dari
 * `batasToken * 4` karakter (perkiraan 1 token ~ 4 karakter).
 *
 * Urutan pemangkasan mengikuti nilai informasi, bukan urutan tampilan:
 *   (a) versi + workspace + layout  - kerangka jawaban "di mana saya"
 *   (b) ekstensi gagal/tak dipakai  - pertanyaan yang paling sering salah
 *   (c) setelan aktif
 *   (d) sisanya (ekstensi ok, lsp, mcp)
 *
 * Jadi (d) dibuang lebih dulu, lalu (c); (b) TIDAK dibuang - kalau masih
 * kepanjangan, alasan di tiap barisnya yang dipendekkan, dan baru setelah itu
 * (a) ikut dipendekkan. Pemotongan buta hanya tersisa sebagai jaring terakhir
 * supaya janji "<= batas" tidak pernah bocor.
 */
export function ringkasKeadaan(p: PotretKeadaan, batasToken = 900): string {
  const batas = Math.max(24, Math.floor(batasToken * 4));
  const inti = barisInti(p);
  const masalah = barisMasalahEkstensi(p);
  const setting = barisSetting(p);
  const sisa = barisSisa(p);

  const muat = (bagian: string[][], penanda: boolean): string | null => {
    const teks = rakit(bagian);
    const penuh = penanda ? `${teks}\n${PENANDA_POTONG}` : teks;
    return penuh.length <= batas ? penuh : null;
  };

  const utuh = muat([inti, masalah, setting, sisa], false);
  if (utuh) return utuh;

  // (d) sisa dibuang dari bawah
  for (let n = sisa.length - 1; n >= 0; n--) {
    const t = muat([inti, masalah, setting, sisa.slice(0, n)], true);
    if (t) return t;
  }
  // (c) setelan dibuang dari bawah
  for (let n = setting.length - 1; n >= 0; n--) {
    const t = muat([inti, masalah, setting.slice(0, n)], true);
    if (t) return t;
  }
  // (b) seluruh baris masalah dipertahankan, alasannya yang dipendekkan
  for (const lebar of [80, 56, 36, 24, 16, 12]) {
    const t = muat([inti, masalah.map((l) => pendek(l, lebar))], true);
    if (t) return t;
  }
  // (a) terakhir: kerangkanya ikut dipendekkan
  for (const lebar of [120, 80, 48, 32, 20]) {
    const t = muat([inti.map((l) => pendek(l, lebar)), masalah.map((l) => pendek(l, 12))], true);
    if (t) return t;
  }
  return potongPaksa(rakit([inti, masalah, setting, sisa]), batas);
}

/* ────────────────────────── 5. Adapter ke app ─────────────────────────── */

const FOLDER_KATALOG: Record<string, string> = {
  themes: 'themes',
  keymaps: 'keymaps',
  snippets: 'snippets',
  languages: 'languages',
  'icon themes': 'iconThemes',
  icons: 'iconThemes',
  commands: 'commands',
  grammars: 'grammars',
};

const kategoriKeJenis = (kategori: string[]): string[] =>
  urutJenis(kategori.map((k) => FOLDER_KATALOG[k.toLowerCase().trim()] ?? k.toLowerCase().trim()));

/**
 * Baca keadaan NYATA (store + perintah Tauri) dan susun potretnya.
 *
 * Semua impor di bawah DINAMIS dan berada di dalam fungsi: berkas ini tetap
 * bisa diimpor di Node (harness uji, alat lain) tanpa Tauri, tanpa DOM, dan
 * tanpa memuat satu pun modul store saat impor. Tidak perlu diuji di Node -
 * cukup dijamin tidak dieksekusi saat impor.
 */
export async function kumpulkanDariApp(): Promise<PotretKeadaan> {
  const [{ useStore }, { useUpdater }, { useAi }, { usePanel }, { useTerminal }, { useLayoutCustom }] =
    await Promise.all([
      import('./store'),
      import('./updaterStore'),
      import('./aiStore'),
      import('./panelStore'),
      import('./terminalStore'),
      import('./layoutStore'),
    ]);
  const [{ useLsp }, { useMcp }, { useExt19 }, { KATALOG_BUNDLED }, { PANEL_TABS }, cmd] = await Promise.all([
    import('./lspStore'),
    import('./mcpStore'),
    import('./extensionsStore19'),
    import('./extCatalog'),
    import('./panelStore'),
    import('./commands'),
  ]);

  const st = () => useStore.getState();

  return susunKeadaan({
    versiApp: async () => {
      const s = st();
      let info = s.appInfo;
      if (!info) {
        try {
          info = await cmd.getAppInfo();
        } catch {
          info = null;
        }
      }
      return {
        versi: info ? info.version : '(belum diketahui)',
        arsitektur: info?.arch,
        webview: info?.webview,
        dataDir: info?.dataDir,
        portable: info?.portable,
      };
    },

    statusUpdate: async () => {
      const u = useUpdater.getState();
      const banner = st().updateBanner;
      return {
        status: banner && u.status === 'idle' ? 'available' : u.status,
        versi: u.version ?? banner?.version ?? null,
        pesan: u.message ?? null,
      };
    },

    settingAktif: async () => {
      const s = st();
      const ai = useAi.getState();
      const provider = ai.provider || s.settings.models.activeProvider;
      return {
        provider,
        model: ai.model || s.settings.models.providers?.[provider]?.model,
        bahasaJawaban: s.settings.models.answerLang,
        gayaJawaban: s.settings.models.answerStyle,
        modePersetujuan: ai.approvalMode,
        izinTulisSubagent: s.settings.subagent?.allowWrite === true,
        ragAktif: s.settings.models.ragEnabled === true,
        temaAktif: s.activeTheme,
        bahasaUi: s.settings.general.uiLang,
        posisiSidebar: s.settings.sidebar,
        layoutEditor: s.settings.layout,
        panelAi: s.settings.general.aiPanel,
        perintahDiizinkan: Array.isArray(s.settings.allowCommands) ? s.settings.allowCommands.length : 0,
      };
    },

    workspace: async () => {
      const s = st();
      if (!s.workspace) return null;
      const aktif = s.tabs.find((t) => t.id === s.activeTabId) ?? null;
      let akar: string[] | undefined;
      let terpercaya: boolean | undefined;
      try {
        const info = await cmd.workspaceInfo();
        akar = (info.roots ?? []).map((r) => r.path);
        terpercaya = info.trusted;
      } catch {
        /* di luar Tauri (dev/browser) tidak ada workspace_info: store saja cukup */
      }
      return {
        folder: s.workspace,
        berkasAktif: aktif?.path ?? null,
        berkasTerbuka: s.tabs.filter((t) => t.path).length,
        belumDisimpan: s.tabs.filter((t) => t.unsaved).length,
        akar,
        terpercaya,
      };
    },

    layout: async () => {
      const s = st();
      const aiPanelPos = s.settings.general.aiPanel ?? 'right';
      const kolomTerlihat = aiPanelPos === 'right' && s.aiKolomVisible;
      const panel = usePanel.getState();
      const lc = useLayoutCustom.getState();
      return {
        panelAi: aiPanelPos,
        kolomAiTerlihat: kolomTerlihat,
        lebarKolomAi: s.aiWidth,
        kolomAiMaksimal: s.aiMax,
        panelBawahTerlihat: useTerminal.getState().visible,
        panelBawahTabAktif: panel.activeTab,
        panelBawahTabTersedia: PANEL_TABS.map((t) => t.id),
        panelBawahTabTerlihat: panel.visibleTabs,
        sidebarTerlihat: s.sidebarVisible,
        sidebarPosisi: lc.posisiSidebar,
        aktivitasSidebar: s.activity,
        infoSubagentDiKanan: lc.subKanan,
      };
    },

    mcp: async () => {
      const s = st();
      const m = useMcp.getState();
      const status = m.status;
      // SUMBER KEBENARAN: status runtime MCP dari Rust (`mcp_status`) yang
      // dicerminkan `useMcp`. Kalau belum terbaca, cadangannya = setelan
      // TERSAVED (`settings.mcp`) - bukan field warisan `store.mcp`, yang
      // ketahuan 2026-10-13 tidak pernah ditulis siapa pun (tetap
      // {enabled:false, running:false, port:9222} padahal MCP hidup di 9225)
      // sehingga ia menyuntik "fakta" palsu ke potret yang masuk prompt.
      const setelanMcp = s.settings?.mcp;
      return {
        hidup: status ? status.running : false,
        port: status ? status.port : (setelanMcp?.port ?? null),
        portDiminta: status ? status.requestedPort : null,
        diaktifkan: status ? status.enabled : (setelanMcp?.enabled ?? false),
        // sengaja TANPA token: potret ini berakhir di dalam prompt.
        serverLuar: (m.servers ?? []).map((x) => ({ id: x.id, label: x.label, url: x.url })),
        galat: m.mcpError ?? (status ? null : 'status runtime MCP belum terbaca'),
      };
    },

    lsp: async () => {
      const l = useLsp.getState();
      const cfg = l.settings();
      return {
        aktif: Object.values(l.aktif).map((a) => ({ server: a.id, pid: a.pid })),
        probe: Object.entries(l.probe).map(([server, hasil]) => ({
          server,
          ok: hasil.ok,
          exe: hasil.exe,
          error: hasil.error,
        })),
        galat: l.lspError,
        serverDikonfigurasi: Object.keys(cfg?.servers ?? {}),
      };
    },

    ekstensi: async () => {
      const ex = useExt19.getState();
      let manifests = ex.manifests;
      let ringkasan = ex.ringkasan;
      if (manifests.length === 0) {
        try {
          manifests = await cmd.extensionsManifests();
        } catch {
          /* tanpa daftar manifest, katalog bundled tetap bisa dilaporkan */
        }
      }
      const katalog = new Map(KATALOG_BUNDLED.map((k) => [k.id, k]));
      const keluar: EkstensiMasuk[] = [];

      for (const status of manifests) {
        const m = status.manifest;
        if (!m) {
          const namafolder = status.path.split(/[\\/]/).pop() ?? status.path;
          keluar.push({
            id: namafolder,
            nama: namafolder,
            versi: '-',
            enabled: false,
            terpasang: true,
            dariKatalog: false,
            kontribusi: [],
            error: status.error ?? 'manifest tidak bisa dibaca',
          });
          continue;
        }

        const gagalId = ringkasan.gagal.filter((g) => g.id === m.id).map((g) => g.alasan);
        const didukungId = ringkasan.tidakDidukung.filter((t) => t.id === m.id);
        const c = m.contributes;
        const temaTerdaftar = ringkasan.themes.filter((t) => t.startsWith(`ext.${m.id}.`)).length;
        const bahasaTerdaftar = c.languages.filter((l) => ringkasan.languages.includes(l.id)).length;
        const grammars = c.grammars ?? [];
        const alasanFitur = (fitur: string) =>
          didukungId.filter((t) => t.fitur === fitur).map((t) => t.alasan);
        const mulaidengan = (awalan: string) => gagalId.find((a) => a.startsWith(awalan));

        const kontribusi: KontribusiMasuk[] = [];
        const tambah = (k: KontribusiMasuk) => {
          if (k.diminta > 0) kontribusi.push(k);
        };

        /*
         * "tidak memuat warna yang dikenali" SENGAJA tidak dipetakan ke `galat`:
         * itu bukan kegagalan baca, melainkan tanda tema menghasilkan NOL token -
         * dan perbedaan itu punya aturannya sendiri (R4, lihat `nilaiEkstensi`).
         */
        tambah({
          jenis: 'themes',
          diminta: c.themes.length,
          dipakai: temaTerdaftar,
          galat: gagalId.find(
            (a) => a.startsWith('tema ') && !a.includes('tidak memuat warna yang dikenali'),
          ),
        });
        /*
         * keymaps/snippets/iconThemes: loader hanya melaporkan TOTAL, bukan
         * per-paket, jadi yang dinyatakan "dipakai" adalah jumlah yang diminta
         * kecuali loader mencatat kegagalan baca untuk paket ini. Binding yang
         * inert tetap sampai lewat `alasanDilewati` (dari `tidakDidukung`).
         */
        tambah({
          jenis: 'keymaps',
          diminta: c.keymaps.length,
          dipakai: mulaidengan('keymap ') ? 0 : c.keymaps.length,
          galat: mulaidengan('keymap '),
          alasanDilewati: alasanFitur('keymap'),
        });
        tambah({
          jenis: 'snippets',
          diminta: c.snippets.length,
          dipakai: mulaidengan('snippet ') ? 0 : c.snippets.length,
          galat: mulaidengan('snippet '),
        });
        tambah({
          jenis: 'iconThemes',
          diminta: c.iconThemes.length,
          dipakai: mulaidengan('icon theme ') ? 0 : c.iconThemes.length,
          galat: mulaidengan('icon theme '),
        });
        tambah({
          jenis: 'languages',
          diminta: c.languages.length,
          dipakai: bahasaTerdaftar,
          alasanDilewati: alasanFitur('bahasa'),
        });
        tambah({ jenis: 'commands', diminta: c.commands.length, dipakai: c.commands.length });
        tambah({
          jenis: 'grammars',
          diminta: grammars.length,
          dipakai: 0,
          alasanDilewati: alasanFitur('grammars'),
        });

        const katalogItem = katalog.get(m.id);
        keluar.push({
          id: m.id,
          nama: m.name,
          versi: m.version,
          enabled: status.enabled !== false,
          terpasang: true,
          dariKatalog: !!katalogItem,
          kontribusi,
          error: status.error ?? null,
          engineOk: m.engineOk,
          butuhEngine: m.engine,
          gagalUmum: gagalId.filter(
            (a) => !a.startsWith('tema ') && !a.startsWith('keymap ') && !a.startsWith('snippet ') && !a.startsWith('icon theme '),
          ),
          perluReload: ex.perluReload,
        });
      }

      // Katalog bundled yang belum pernah di-Install: opt-in, bukan rusak.
      const terpasang = new Set(manifests.filter((x) => x.manifest).map((x) => x.manifest!.id));
      for (const item of KATALOG_BUNDLED) {
        if (terpasang.has(item.id)) continue;
        const jenis = kategoriKeJenis(item.categories);
        keluar.push({
          id: item.id,
          nama: item.name,
          versi: item.version || '-',
          enabled: false,
          terpasang: false,
          dariKatalog: true,
          kontribusi: jenis.map((j) => ({ jenis: j, diminta: 1, dipakai: 0 })),
        });
      }

      return keluar;
    },
  });
}

/*
 * ─────────── Potret yang sedang berlaku (cache modul, sinkron) ────────────
 *
 * `kumpulkanDariApp` async, sedangkan perakit prompt (`systemPrompt.ts`)
 * SINKRON: ia dipanggil di tengah perakitan riwayat, di jalur yang sudah lama
 * ada, dan tidak boleh jadi async hanya demi blok keadaan. Karena itu potretnya
 * dikumpulkan di hulu - `aiStore.ts`, tepat sebelum ia merakit prompt, di dalam
 * `Promise.all` yang sudah ada di sana - lalu hasilnya ditaruh di sini dan
 * dibaca sinkron oleh perakit prompt. Satu tempat mengumpulkan, satu tempat
 * membaca; tidak ada dua sumber keadaan yang bisa berbeda cerita.
 *
 * `null` berarti "belum ada potret" (halaman baru dibuka, kolektor gagal, atau
 * pembaca cache dipanggil dari jalur yang tidak mengumpulkan - mis. jembatan
 * dev). Pemanggil WAJIB menyiapkan cadangan untuk itu, bukan menganggapnya
 * "tidak ada masalah".
 */
let potretBerlaku: PotretKeadaan | null = null;

export function setPotretKeadaan(p: PotretKeadaan | null): void {
  potretBerlaku = p;
}

export function potretKeadaan(): PotretKeadaan | null {
  return potretBerlaku;
}

/**
 * Blok ringkas dari potret yang sedang berlaku; `''` bila belum ada potret.
 * `batasToken` sama artinya dengan di `ringkasKeadaan` (default 900).
 */
export function blokKeadaanRingkas(batasToken = 900): string {
  return potretBerlaku ? ringkasKeadaan(potretBerlaku, batasToken) : '';
}
