/**
 * Registry Agent Tools Zephyr.
 *
 * ## Arsitektur
 *
 * Registry ini terdiri dari tepat 65 tools:
 *   1. 40 Built-in (diadaptasi ke backend Zephyr di src/lib/zephyrTools/builtins.ts)
 *   2. 14 MCP (diadaptasi ke window/state Zephyr di src/lib/zephyrTools/mcp.ts)
 *   3. 11 Web & Browser Zephyr (dipertahankan di src/lib/zephyrTools/web.ts)
 *
 * Tool Zephyr lama selain web/browser telah dipensiunkan agar tidak ada duplikasi
 * dan LLM memiliki set tool yang ringkas, bersih, dan konsisten.
 */
import type { AgentToolSpec } from './types';
import { TOOL_BAWAAN } from './zephyrTools/builtins';
import { TOOL_ZEPHYR_SELF } from './zephyrTools/zephyrSelf';
import { tunjukTool as TOOL_TUNJUK } from './zephyrTools/tunjuk';
import { TOOL_BROWSER, TOOL_BROWSER_LAMA } from './zephyrTools/browser';
import { TOOL_WEB_SATU, TOOL_WEB_LAMA } from './zephyrTools/webSatu';
import { TOOL_INGAT } from './zephyrTools/zephyrIngat';
import { TOOL_MCP } from './zephyrTools/mcp';
import { TOOL_WEB } from './zephyrTools/web';
import { TOOL_BACA_KODE, pasangJembatanBacaKode, jembatanBacaKode } from './bacaKode';
import { useToolGate, TOOL_TULIS, TOOL_AKTIF_AWAL } from './toolGate';
import { TOOL_DIKIRIM_SELALU } from './zephyrTools/catalog';
import { AWALAN_MCP, POLA_AWALAN_MCP } from './zephyrTools/awalan';
import { mcpExternalSpecs, pecahNamaMcp } from './mcpTools';
import { asZephyrError, fsRead, fsStat, fsRealpath } from './commands';
import { useStore } from './store';

export { TOOL_TULIS };

/*
 * Tabel label + ikon per tool diteruskan dari sini supaya bridge dev bisa
 * membacanya lewat modul yang sama dengan handler-nya. Harness yang mengukur
 * "apakah baris tool menggambar glyph berbeda" butuh tabel yang BENAR-BENAR
 * dipakai komponen, bukan salinan di dalam skrip uji.
 */
export { infoAksi } from './labelAksi';

export interface AgentTool {
  spec: AgentToolSpec;
  run: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * `zephyr_self` datang dari `zephyrTools/zephyrSelf.ts`, BUKAN dari
 * `TOOL_BAWAAN`.
 *
 * Implementasi lama (yang ada di builtins.ts) hanya bisa menjawab dari indeks
 * fakta statis. Implementasi baru membaca sumber aplikasi yang HIDUP - setelan
 * efektif, berkas log, registry ekstensi + hasil loader, dokumen bundel, dan
 * versi/status update - dan itu semua tetap bekerja saat tidak ada folder
 * proyek yang terbuka.
 *
 * Entri lama DIBUANG dari daftar, bukan ditimpa diam-diam: katalog menolak
 * nama duplikat karena dua handler untuk satu nama membuat satu di antaranya
 * mustahil dipanggil. Satu nama, satu handler.
 */
export const AGENT_TOOLS: AgentTool[] = [
  ...TOOL_BAWAAN.filter((t) => t.spec.name !== 'zephyr_self'),
  TOOL_ZEPHYR_SELF,
  /*
   * `ingat` - memori lintas sesi milik Zeph AI sendiri (`ai-ingat-sesi`).
   *
   * Sama alasannya dengan `zephyr_self`: handler-nya TIDAK di `builtins.ts`
   * karena isinya meneruskan ke modul produksi `aiMemori.ts` (logika urai,
   * tulis atomik, pangkas anggaran, penyaring lapis proyek). Satu nama, satu
   * handler - jadi kalau `builtins.ts` kelak menambahkan nama yang sama,
   * `catalog.ts` akan menolak katalognya, bukan diam-diam memilih satu.
   */
  TOOL_INGAT,
  /*
   * `zephyr_kode` - baca potongan sumber ZEPHYR SENDIRI (`src/lib/bacaKode.ts`).
   *
   * Spec-nya sudah ada sejak dulu, tapi HANYA di modul itu: tanpa entri di sini
   * (dan di `catalog.ts`) nama `zephyr_kode` tidak pernah sampai ke model.
   * Spesifikasi yang tak terjangkau sama saja dengan tool yang tidak ada.
   *
   * `run`-nya yang ASLI, bukan salinan: modul itu menahan jembatan berkas yang
   * dipasang aplikasi (`pasangJembatanBacaKode`) dan menjawab jujur
   * "belum tersambung" selama jembatan belum dipasang - bukan membaca berkas
   * dari akar yang ditebak.
   */
  TOOL_BACA_KODE,
  /*
   * `tunjuk` - keluhan pembaca jadi halaman yang TERBUKA.
   *
   * Bukan `peta` dan bukan `run_command`: keduanya sudah ada, dan merangkainya
   * berarti model harus menerjemahkan "AI-nya boros token" jadi nama seksi
   * sendiri - langkah yang justru sering salah. Tool ini menerjemahkan lalu
   * membuka, jadi jawaban yang salah langsung terlihat (halaman keliru terbuka),
   * bukan datang sebagai kalimat yang terdengar yakin.
   */
  TOOL_TUNJUK,
  ...TOOL_MCP,
  /*
   * `browser` replaces the seven `browser_*` entries.
   *
   * The seven are FILTERED OUT of `TOOL_WEB` here rather than deleted from it:
   * their implementations are what `browser` dispatches to, and `TOOL_WEB` is
   * also the module other code imports the implementations from. Removing them
   * from the array would remove the code, not just the name.
   */
  ...TOOL_WEB.filter((t) => !TOOL_BROWSER_LAMA.includes(t.spec.name) && !TOOL_WEB_LAMA.includes(t.spec.name)),
  TOOL_BROWSER,
  TOOL_WEB_SATU,
];

/* ------------------------------------------------------------------ */
/* Jembatan baca-kode: dipasang SEKALI per workspace                   */
/* ------------------------------------------------------------------ */

/*
 * `bacaKode.ts` sengaja TIDAK mencari akar repo sendiri (lihat komentar panjang
 * di modul itu): akar + pembaca berkas disuntikkan pemanggil. Selama jembatan
 * belum dipasang, `zephyr_kode` menjawab jujur "belum tersambung" walau namanya
 * sudah ada di katalog dan di daftar tool - spesifikasi yang tak bisa
 * dieksekusi sama saja dengan tool yang tidak ada.
 *
 * Dipasang LAZY di jalur panggil, bukan lewat listener store: satu tempat
 * pemasangan, tanpa langganan yang bisa terpasang dua kali saat HMR, dan tidak
 * ada pemasangan dengan akar kosong. Idempoten per akar - kalau workspace
 * berganti, jembatannya dipasang ulang untuk akar yang baru.
 *
 * `realpath` memakai perintah Rust `fs_realpath` yang SUNGGUHAN (bukan bentuk
 * identitas). Sebelumnya jembatan ini menyuntikkan `async (p) => p` dengan
 * catatan bahwa `fs_realpath` belum ada - catatan itu sudah tidak benar:
 * `fs_utils::fs_realpath` ada dan terdaftar di `lib.rs`. Bentuk identitas
 * berarti symlink/junction yang menunjuk KELUAR repo tidak pernah ditolak di
 * lapisan ini; pagar leksikal (`..`, jalur absolut, UNC, byte kontrol, berkas
 * rahasia) tetap hidup penuh karena diperiksa MURNI sebelum jembatan disentuh.
 */
let _jembatanKodeAkar: string | null = null;

/** Pasang jembatan baca-kode dari workspace yang SEDANG terbuka.
 *  Balik `true` kalau jembatan (baru) dipasang. */
export function pasangJembatanBacaKodeDariWorkspace(): boolean {
  const akar = useStore.getState().workspace;
  if (!akar) return false;
  if (_jembatanKodeAkar === akar && jembatanBacaKode()) return false;
  pasangJembatanBacaKode({
    akar,
    cmd: {
      fsRead: async (p) => {
        const isi: unknown = await fsRead(p, 'utf8');
        /* Idiom yang sama dengan `agentLsp.ts` / `testsStore.ts`: backend bisa
           mengembalikan string ATAU `ReadResult`. Melakukan `String(objek)`
           akan menghasilkan "[object Object]" - bukan isi berkas. */
        const teks = typeof isi === 'string' ? isi : ((isi as { content?: string })?.content ?? '');
        return { content: teks };
      },
      fsStat: async (p) => {
        const s = await fsStat(p);
        return { size: Number(s?.size ?? 0), isDir: !!s?.isDir };
      },
      /*
       * Realpath SUNGGUHAN, bukan identitas.
       *
       * `fs_realpath` menyelesaikan symlink/junction lalu menolak jalur yang
       * mendarat di luar akar workspace. Tanpa ini, sebuah tautan di dalam repo
       * bisa membuat pembaca kode menembus keluar akar tanpa satu pun penolakan.
       * Kegagalannya dibiarkan naik sebagai error: pemanggil memperlakukannya
       * sebagai "jalur tidak bisa diverifikasi", bukan sebagai jalur yang aman.
       */
      realpath: async (p) => fsRealpath(p),
    },
  });
  _jembatanKodeAkar = akar;
  return true;
}

/** Penampung gambar screenshot/upload yang menunggu dikirimkan ke model. */
let _gambarMenunggu: string[] = [];

export function simpanGambarMenunggu(base64List: string[]): void {
  _gambarMenunggu = [...base64List];
}

export function ambilGambarMenunggu(): string[] {
  return [..._gambarMenunggu];
}

export function clearGambarMenunggu(): void {
  _gambarMenunggu = [];
}

export interface AgentToolSpecsOptions {
  bolehTulis?: boolean;
  kedalaman?: number;
  alat?: string[];
}

/** Ambil seluruh spesifikasi tool untuk dikirim ke provider LLM. */
export function agentToolSpecs(
  optsOrWhitelist?: AgentToolSpecsOptions | string[],
): AgentToolSpec[] {
  let daftar = AGENT_TOOLS;
  if (!optsOrWhitelist) {
    const aktif = useToolGate.getState().aktif;
    daftar = daftar.filter((t) => aktif.has(t.spec.name));
  } else if (Array.isArray(optsOrWhitelist)) {
    daftar = daftar.filter((t) => optsOrWhitelist.includes(t.spec.name));
  } else {
    if (optsOrWhitelist.alat && optsOrWhitelist.alat.length > 0) {
      daftar = daftar.filter((t) => optsOrWhitelist.alat!.includes(t.spec.name));
    } else {
      const aktif = useToolGate.getState().aktif;
      daftar = daftar.filter((t) => aktif.has(t.spec.name));
    }
    if (optsOrWhitelist.bolehTulis === false) {
      daftar = daftar.filter((t) => !TOOL_TULIS.has(t.spec.name));
    }
  }
  /*
   * Progressive disclosure: only the CORE tools are sent every request.
   *
   * Sending the whole table cost ~22 KB per call, more than the conversation
   * itself, which is what made a slow gateway time out. Everything outside the
   * always-sent set is reachable through `tool_search` + `tool_call` instead.
   *
   * A tool the USER turned on beyond the default set is kept directly callable
   * - they asked for it, so it should not be hidden behind a search. The gate
   * records the live set; the defaults record what would be on anyway. Anything
   * active but NOT in the defaults was chosen by the user.
   */
  const aktif = useToolGate.getState().aktif;
  const bawaan = new Set(TOOL_AKTIF_AWAL);
  daftar = daftar.filter(
    (t) => TOOL_DIKIRIM_SELALU.includes(t.spec.name) || (aktif.has(t.spec.name) && !bawaan.has(t.spec.name)),
  );
  /*
   * External MCP tools are ALWAYS sent, not hidden behind `tool_search`.
   *
   * Every other non-core tool is a Zephyr feature the model can discover by
   * name. These are not: the model has no way to guess that a server called
   * "sentry" exposes a tool called "list_issues", so `tool_search` could never
   * find them and the reader's servers would stay invisible.
   *
   * The cost is real — a server with many tools adds spec bytes to every
   * request — but it is bounded by what the READER configured, and a
   * configured server that the model cannot reach is the bug being fixed.
   */
  return [...daftar.map((t) => t.spec), ...mcpExternalSpecs()];
}

/** Jalankan tool berdasarkan nama dan argumen. */
export async function jalankanAgentTool(
  nama: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  /*
   * An external MCP tool is routed BEFORE the local lookup.
   *
   * Its name carries the server id, which the local table has no entry for, so
   * the lookup below would fail with "tool not found". Routing first also means
   * a server tool can never shadow a Zephyr tool: the `pecahNamaMcp` check
   * rejects the `mcp__zephyr__` namespace, so Zephyr's own tools keep their
   * names.
   */
  const luar = pecahNamaMcp(nama);
  if (luar) {
    const { jalankanToolMcp } = await import('./mcpTools');
    return jalankanToolMcp(luar.serverId, luar.tool, args);
  }
  const clean = nama.replace(POLA_AWALAN_MCP, '');
  const tool = AGENT_TOOLS.find(
    (t) =>
      t.spec.name === nama ||
      t.spec.name.replace(POLA_AWALAN_MCP, '') === clean,
  );
  if (!tool) {
    throw new Error(`Tool tidak ditemukan atau tidak didukung: "${nama}"`);
  }
  const aktif = useToolGate.getState().aktif;
  const targetName = tool.spec.name;
  const targetClean = targetName.replace(POLA_AWALAN_MCP, '');
  const diizinkan =
    aktif.has(targetName) ||
    aktif.has(targetClean) ||
    aktif.has(AWALAN_MCP + targetClean);
  if (!diizinkan) {
    throw new Error(`Tool "${nama}" sedang dinonaktifkan di pengaturan tool.`);
  }
  try {
    /* Satu tempat pemasangan jembatan baca-kode, tepat sebelum tool berjalan:
       hanya untuk `zephyr_kode`, dan hanya kalau ada folder terbuka. Kalau
       tidak, tool-nya menjawab "belum tersambung" apa adanya. */
    if (targetName === 'zephyr_kode') pasangJembatanBacaKodeDariWorkspace();
    return await tool.run(args);
  } catch (e) {
    throw galatToolUntukModel(e, targetName);
  }
}

/**
 * Teks hasil tool saat gagal, dengan satu penerjemahan yang penting: penolakan
 * tulis `WorkspaceOutside` dijelaskan APA ADANYA.
 *
 * ## Kenapa ini ada
 *
 * Sisi Rust menolak setiap tulisan di luar folder terbuka, dan pesannya cuma
 * `path outside the workspace: <path>`. Model membacanya, menyimpulkan "mungkin
 * path-nya kurang absolut", lalu mencoba lagi dengan bentuk lain - dan pada run
 * nyata (uji subagent tulis 2026-10-13) AI Zephyr sampai mengoreksi dirinya
 * sendiri di depan user karena aturan prompt saat itu menjanjikan lebih daripada
 * yang diizinkan backend ("path absolut tetap jalan"). Dua-duanya salah di
 * tempat yang berbeda: aturannya sudah dibetulkan di `systemPrompt.ts`, dan di
 * sini penolakannya diberi SEBAB + LANGKAH, plus satu kalimat yang melarang
 * mengulang percobaan dan melarang mengaku sudah menulis.
 *
 * Kode galatnya DIPERTAHANKAN (`WorkspaceOutside`), jadi pemanggil yang membaca
 * `code` tidak kehilangan apa pun; yang bertambah hanya teks yang dibaca model.
 * Pesan asli tetap disertakan di ujung, supaya tidak ada informasi yang hilang.
 */
export function galatToolUntukModel(e: unknown, nama?: string): Error & { code?: string } {
  const err = asZephyrError(e);
  const apa = nama ? `Tool "${nama}"` : 'Tool ini';
  let teks: string;

  if (err.code === 'WorkspaceOutside') {
    const ws = useStore.getState().workspace;
    const sebab = ws
      ? `tulisan hanya boleh di dalam folder yang terbuka (${ws}), dan path absolut tidak bisa keluar dari batas itu`
      : 'tidak ada folder yang terbuka, dan tanpa folder memang tidak ada tempat menulis sama sekali: tool tulis dan perintah shell ditolak dalam keadaan ini, seberapapun absolut path-nya (membaca berkas yang user sebut lewat path absolut tetap jalan)';
    teks =
      `ERROR: tulisan ditolak - ${sebab}. ${apa} tidak menulis apa pun. ` +
      'Sebutkan batas ini ke user apa adanya, dan kalau tugasnya memang perlu menulis, minta dia membuka folder (File > Open Folder) atau memilih folder yang boleh ditulis; ' +
      'jangan mengulang percobaan tulis yang sama dan jangan bilang berkas sudah ditulis. ' +
      `(pesan asli: ${err.message})`;
  } else if (err.code === 'InvalidInput' && /butuh workspace terbuka/i.test(err.message)) {
    teks =
      `ERROR: ${err.message}. ${apa} tidak menjalankan apa pun. ` +
      'Tanpa folder terbuka tidak ada tempat menjalankan perintah; minta user membuka folder (File > Open Folder) kalau memang perlu, dan jangan mencoba memutar aturannya. ' +
      `(pesan asli: ${err.message})`;
  } else {
    teks = `ERROR: ${err.message}`;
  }

  const baru = new Error(teks) as Error & { code?: string };
  baru.code = err.code;
  return baru;
}
