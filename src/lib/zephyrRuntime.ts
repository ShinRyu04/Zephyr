/* Keadaan RUNTIME Zephyr, siap disuntik ke prompt sistem tiap giliran.
 *
 * Kenapa ada: `zephyrFakta.ts` (hasil `scripts/gen-fakta-zephyr.mjs`) tahu
 * BENTUK Zephyr - daftar setelan, nama panel, port dev - tapi tidak tahu
 * KEADAAN saat ini: ekstensi mana yang terpasang, mana yang GAGAL dimuat dan
 * kenapa, LSP mana yang jalan, server MCP hidup di port berapa, panel mana yang
 * sedang terbuka, versi app dan status update, nilai setelan yang benar-benar
 * berlaku. Dibangun dari sumber yang sama sepanjang waktu, teks statis itu
 * membuat Zeph menebak ("sepertinya ada ekstensi yang gagal") atau menjawab
 * "belum tahu" atas pertanyaan tentang dirinya sendiri padahal jawabannya ada
 * di dalam prosesnya. Modul ini membaca store YANG SAMA dengan yang dibaca UI,
 * jadi tidak ada dua sumber kebenaran dan tidak ada permintaan "buka folder
 * dulu" hanya untuk tahu folder mana yang terbuka.
 *
 * Batas keras: lihat BATAS_KEADAAN. Blok ini ikut di SETIAP permintaan, jadi
 * ukurannya harus kecil dan isinya hanya yang TIDAK bisa dibaca model dari
 * sumber lain. Isinya juga harus deterministik untuk keadaan yang sama - urutan
 * Map, pid, jam dinding, dan `Date.now()` tidak masuk: dua panggilan pada
 * keadaan yang sama harus menghasilkan teks yang identik, kalau tidak setiap
 * giliran tampak seperti keadaan yang berubah.
 */

import { useStore } from './store';
import { useExtensions } from './extensionStore';
import { useLsp } from './lspStore';
import { useMcp } from './mcpStore';
import { mcpRingkas } from './mcpTools';
import { usePanel } from './panelStore';
import { useUpdater } from './updaterStore';

/* Target panjang blok. Lewat dari ini: baris yang bisa dipendekkan dipendekkan,
   lalu blok dipotong - lebih baik satu baris hilang daripada seluruh blok
   mendorong konteks percakapan keluar. */
export const BATAS_KEADAAN = 900;

const MAKS_NAMA_EKSTENSI = 4;
const MAKS_EKSTENSI_GAGAL = 2;
const MAKS_PROBE_LSP = 4;
const MAKS_SERVER_MCP = 3;
const MAKS_TAB_PANEL = 5;

/** Rapatkan jadi satu baris: pesan galat sering mengandung newline/tab. */
function rapat(s: unknown, maks = 120): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > maks ? `${t.slice(0, maks - 1)}\u2026` : t;
}

function daftar(xs: string[], maks: number): string {
  const pakai = xs.slice(0, maks);
  const sisa = xs.length - pakai.length;
  return pakai.join(', ') + (sisa > 0 ? ` and ${sisa} more` : '');
}

/** Versi app + status update: dibaca dari store, bukan dari paket di disk. */
function barisApp(): string {
  const st = useStore.getState();
  const u = useUpdater.getState();
  let upd: string;
  switch (u.status) {
    case 'up-to-date':
      upd = 'update: up to date';
      break;
    case 'available':
      upd = `update: ${u.version ?? 'a new version'} available`;
      break;
    case 'downloading':
      upd = `update: downloading ${Math.round(u.progress)}%`;
      break;
    case 'ready':
      upd = `update: ${u.version ?? 'a new version'} ready, installs on restart`;
      break;
    case 'checking':
      upd = 'update: checking now';
      break;
    case 'unconfigured':
      upd = 'update: not configured in this build';
      break;
    case 'error':
      upd = `update: check failed${u.message ? ` (${rapat(u.message, 60)})` : ''}`;
      break;
    default:
      upd = 'update: not checked yet';
  }
  /* Banner = "versi berubah sejak terakhir dilihat", yaitu app baru saja
     diperbarui. Itu keadaan yang lebih penting daripada status tombol cek. */
  if (st.updateBanner?.version) {
    upd = `update: just updated to ${st.updateBanner.version}, release notes pending`;
  }
  return `- App: Zephyr ${st.appInfo?.version ?? 'unknown'} (${upd})`;
}

/** Folder yang terbuka, tab, dan berkas aktif - jawaban untuk "aku di mana". */
function barisWorkspace(): string {
  const st = useStore.getState();
  const ws = st.workspace;
  if (!ws) {
    return '- Workspace: no folder open (no project root, so path-bound tools have none)';
  }
  const n = st.tabs.length;
  const belum = st.tabs.filter((t) => t.unsaved).length;
  const aktif = st.tabs.find((t) => t.id === st.activeTabId) ?? null;
  const nama = aktif ? rapat(aktif.path || aktif.name, 70) : '';
  return (
    `- Workspace: ${ws} - ${n} tab${n === 1 ? '' : 's'}` +
    (belum ? `, ${belum} unsaved` : '') +
    (nama ? `; active file ${nama}` : '')
  );
}

/** Tata letak yang benar-benar terlihat sekarang, bukan tata letak tersimpan. */
function barisPanel(): string {
  const st = useStore.getState();
  const p = usePanel.getState();
  const ai = st.settings?.general?.aiPanel ?? 'right';
  const kolom = st.aiKolomVisible === false ? 'column hidden' : 'column shown';
  return `- Layout: sidebar=${st.activity} ${st.sidebarVisible ? 'shown' : 'hidden'}; AI panel=${ai} ${kolom}; bottom panel shows ${p.activeTab} of ${daftar(p.visibleTabs, MAKS_TAB_PANEL)}`;
}

/*
 * Ekstensi terpasang + yang GAGAL dimuat beserta alasannya.
 *
 * Ekstensi yang punya `error` TIDAK dihitung "on" meski `enabled` true: yang
 * gagal dimuat tidak sedang jalan, dan menyebutnya di dua tempat sekaligus
 * ("on: X" lalu "X gagal dimuat") membuat model melaporkan ekstensi hidup
 * yang sebenarnya mati - persis tebakan yang modul ini ada untuk menghapus.
 */
function barisEkstensi(): string[] {
  const e = useExtensions.getState();
  const out: string[] = [];
  const bukanBawaan = e.list.filter((x) => !x.builtin);
  const gagal = bukanBawaan.filter((x) => x.error).sort((a, b) => a.id.localeCompare(b.id));
  if (bukanBawaan.length === 0) {
    out.push("- Extensions: none installed beyond Zephyr's built-ins");
  } else {
    const on = bukanBawaan
      .filter((x) => x.enabled && !x.error)
      .map((x) => `${x.name || x.id} ${x.version}`.trim())
      .sort();
    out.push(
      `- Extensions on: ${on.length ? daftar(on, MAKS_NAMA_EKSTENSI) : 'none'}` +
        ` (${bukanBawaan.length} installed` +
        (gagal.length ? `, ${gagal.length} failed` : '') +
        ', built-ins excluded)',
    );
  }
  for (const g of gagal.slice(0, MAKS_EKSTENSI_GAGAL)) {
    out.push(`- Extension FAILED to load: ${g.name || g.id} ${g.version} - ${rapat(g.error, 90)}`);
  }
  if (gagal.length > MAKS_EKSTENSI_GAGAL) {
    out.push(`- ...and ${gagal.length - MAKS_EKSTENSI_GAGAL} more extension(s) failed to load`);
  }
  if (e.extError) out.push(`- Extension system error: ${rapat(e.extError, 90)}`);
  return out;
}

/** LSP: mana yang sedang JALAN, dan mana yang terpasang/gagal (hasil probe). */
function barisLsp(): string {
  const l = useLsp.getState();
  const aktif = Object.values(l.aktif)
    .map((a) => a.id)
    .sort();
  const cfg = useStore.getState().settings?.lsp;
  const jalan = aktif.length ? aktif.join(', ') : 'none';
  if (cfg && cfg.enabled === false) {
    return `- LSP: off in settings${aktif.length ? ` (still running: ${jalan})` : ''}`;
  }
  const probe = Object.entries(l.probe)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, r]) =>
      r.ok ? `${id} installed` : `${id} missing${r.error ? ` (${rapat(r.error, 40)})` : ''}`,
    );
  return `- LSP: running ${jalan}; probe: ${probe.length ? daftar(probe, MAKS_PROBE_LSP) : 'not run yet'}`;
}

/**
 * Server MCP Zephyr: hidup/tidak + port yang benar-benar dipakai, DAN tool luar
 * yang bisa dipanggil.
 *
 * ## Kenapa daftar tool ikut ditulis
 *
 * Baris ini dulu hanya berbunyi "3 external server(s): context7, github,
 * deepwiki" - nama server, tanpa satu pun nama tool. Model membacanya sebagai
 * keterangan keadaan, bukan sebagai izin: ia tahu ada server terpasang, dan
 * tidak tahu bahwa toolnya ADA DI GUDANGNYA.
 *
 * Padahal jalurnya sudah lengkap ujung ke ujung (`mcpStore` -> `mcpTools` ->
 * `agentTools` -> `mcpClientCall` -> `mcp_client.rs`), dan `mcpExternalSpecs()`
 * mengirim tool luar SELALU - bukan lewat `tool_search`. Jadi tool itu benar
 * benar bisa dipanggil; satu-satunya yang tidak tahu adalah modelnya, karena
 * tidak ada satu kalimat pun yang menyebutkannya.
 *
 * Yang ditulis adalah jumlah yang BENAR-BENAR dikirim (`mcpRingkas()` ->
 * `dipakai`, sudah dipotong `BATAS_TOOL_PER_SERVER`), bukan seluruh isi katalog
 * server. Menyebut tool yang tidak ikut dikirim sama salahnya dengan tidak
 * menyebut apa pun: model akan memanggilnya lalu gagal.
 */
function barisMcp(): string {
  const m = useMcp.getState();
  const cfg = useStore.getState().settings?.mcp;
  let hidup: string;
  if (m.status) {
    hidup = m.status.running
      ? `Zephyr's own MCP server is on at 127.0.0.1:${m.status.port}`
      : `off (requested port ${m.status.requestedPort})`;
  } else {
    hidup = `state not read yet; settings say ${cfg?.enabled ? 'on' : 'off'} (port ${cfg?.port ?? 9222})`;
  }
  const srv = m.servers
    .map((s) => s.label || s.id)
    .filter(Boolean)
    .sort();
  const kepala =
    `- MCP: ${hidup}` +
    (srv.length
      ? `; ${srv.length} external server(s): ${daftar(srv, MAKS_SERVER_MCP)}`
      : '; no external MCP servers configured');

  /*
   * Nama tool yang dikirim. `mcpRingkas()` adalah hitungan yang SAMA dengan yang
   * dipakai `mcpExternalSpecs()`, jadi angka "dipakai" di sini identik dengan
   * jumlah skema yang benar-benar sampai ke model - bukan perkiraan.
   *
   * Impor statis, bukan dinamis: `blokKeadaanPrompt()` sinkron dan dipanggil
   * tiap giliran, jadi jalur async di sini hanya akan membuat blok ini kadang
   * kosong pada giliran pertama. `mcpTools` kecil (8 KB, tanpa impor melingkar -
   * `mcpClientCall` di dalamnya dimuat dinamis saat dipakai).
   */
  const denganTool = mcpRingkas().filter((r) => r.dipakai > 0);
  if (denganTool.length === 0) return kepala;
  const rincian = denganTool
    .slice(0, MAKS_SERVER_MCP)
    .map((r) => `${r.serverLabel || r.serverId} ${r.dipakai}/${r.total}`)
    .join(', ');
  return (
    kepala +
    `. Their tools ARE in your tool list as mcp__<server>__<tool> and you may call them directly: ${rincian}` +
    (denganTool.length > MAKS_SERVER_MCP ? ` and ${denganTool.length - MAKS_SERVER_MCP} more` : '') +
    '. Use one when the task matches; never claim a server listed here is unreachable.'
  );
}

/** Nilai setelan yang SEDANG dipakai - yang mengubah cara Zeph menjawab. */
function barisSetelan(maks: number): string {
  const s = useStore.getState().settings;
  if (!s) return '- Settings: not loaded yet';
  const nilai = [
    `uiLang=${s.general?.uiLang ?? 'en'}`,
    `theme=${s.general?.theme ?? 'dark'}`,
    `answerLang=${s.models?.answerLang ?? 'follow'}`,
    `answerStyle=${s.models?.answerStyle ?? 'short'}`,
    `rag=${s.models?.ragEnabled ? 'on' : 'off'}`,
    `lsp=${s.lsp?.enabled === false ? 'off' : 'on'}`,
    `mcp=${s.mcp?.enabled ? `on port ${s.mcp?.port ?? 9222}` : 'off'}`,
    `mcp.maxToolsPerServer=${s.mcp?.maxToolsPerServer ?? 40}`,
    `subagent.maxParallel=${s.subagent?.maxParallel ?? ''}`,
    `subagent.allowWrite=${s.subagent?.allowWrite === true ? 'yes' : 'no'}`,
  ];
  return `- Settings in use: ${nilai.slice(0, maks).join(', ')}`;
}

/**
 * Baris kepala blok keadaan. Dipisah jadi fungsi supaya teksnya punya SATU
 * tempat (dulu ia literal di dalam `blokKeadaan()`), dan supaya nanti bisa
 * diambil dari kamus tanpa menyentuh perakit bloknya.
 *
 * TODO(i18n - PROMPT 7): teks ini masih Inggris dan belum punya kunci kamus -
 * satu dari sebab "Zeph tiba-tiba pakai Inggris". Usulan kunci kamus:
 * `ai.state.liveHead`. Setelah kunci itu ada, fungsi INI yang mengembalikan
 * hasil terjemahannya; kepala blok keadaan di `systemPrompt.ts`
 * (`penandaPotret()`) memakai kunci `ai.state.snapshotHead`.
 */
export function kepalaBlokKeadaan(): string {
  return "# Zephyr's live state - read from this running app for this turn";
}

/**
 * Blok keadaan siap tempel. Panggil tiap giliran: satu panggilan = satu
 * pembacaan store saat itu, jadi blok ini tidak bisa basi atau di-cache.
 *
 * Pemendekan saat lewat batas dilakukan berjenjang, dan urutannya sengaja:
 * nilai setelan yang paling akhir dibuang (nilai ke-5 dan seterusnya hanya
 * relevan untuk pertanyaan tertentu), sedangkan dua baris pembuka - "ini
 * keadaan saat ini" dan "jangan tanya folder mana" - adalah bagian yang
 * mengubah perilaku, jadi baru hilang kalau tidak ada lagi yang bisa dipotong.
 * Yang dipotong terakhir adalah datanya sendiri (potong keras), bukan aturannya.
 */
export function blokKeadaan(): string {
  const kepala = kepalaBlokKeadaan();
  const aturan =
    'This block wins over any stale note about Zephyr above it. Never ask which folder, file or setting is in use: it is here.';
  const inti = [
    barisApp(),
    barisWorkspace(),
    barisPanel(),
    ...barisEkstensi(),
    barisLsp(),
    barisMcp(),
  ];
  /* Berjenjang: 10 nilai setelan -> 6 -> 4 -> 3, baru setelah itu baris aturan
     yang dibuang, dan terakhir potong keras. Deterministik untuk keadaan sama. */
  for (const banyak of [10, 6, 4, 3]) {
    const teks = [kepala, aturan, ...inti, barisSetelan(banyak)].join('\n');
    if (teks.length <= BATAS_KEADAAN) return teks;
  }
  const tanpaAturan = [kepala, ...inti, barisSetelan(3)].join('\n');
  if (tanpaAturan.length <= BATAS_KEADAAN) return tanpaAturan;
  return `${tanpaAturan.slice(0, BATAS_KEADAAN - 1)}\u2026`;
}
