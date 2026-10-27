import { useStore } from './store';
import { fsRead, instructionRead } from './commands';
import { aturanSubagentPrompt } from './subagentRoles';
import { blokPersona, personaAktif } from './personaStore';
import { agentKustomAktif } from './agentCatalog';
import { LANGS } from './systemPromptLanguages';
import { FAKTA_ZEPHYR } from './zephyrFakta';
import { blokKeadaan } from './zephyrRuntime';
import { suntikanIndeks } from './zephyrCari';
import { mcpTerpotong } from './mcpTools';
import { blokKeadaanRingkas } from './aiZephyrState';
import { useTerminal } from './terminalStore';
import { useHistory } from './historyStore';

/*
 * Proporsi BLOK INTI selalu-nyala (karakter). Aturan anggarannya: anggota blok
 * inti (fakta generated yang tinggal di sini + larangan + kepala/label blok
 * keadaan) <= 2.000 token perkiraan, satuan yang dipakai gate
 * `scripts/uji-blok-inti.mjs` dan `scripts/cek-batas-inti.mjs`:
 *
 *     token = Math.ceil(panjang_karakter / 4)
 *
 * Blok keadaan termasuk anggota blok inti, jadi ia dapat jatahnya sendiri
 * (900 token ~ 3.600 karakter, lewat `ringkasKeadaan(p, 900)`) dan TIDAK boleh
 * melewatinya walau potretnya kebetulan lebih panjang.
 */
const BATAS_KEADAAN_PROMPT = 3600;

/**
 * Teks blok keadaan, PER BAHASA AKTIF (item AI-TAHU-100-2-SISA / 133).
 *
 * Kenapa tabel, bukan literal: kepala blok ini dulu SELALU Inggris
 * (`# Zephyr runtime state - snapshot taken ...`) walau aplikasinya berbahasa
 * Indonesia - satu dari sebab "Zeph tiba-tiba menjawab pakai Inggris" (laporan
 * Ryu): teks Inggris di pangkal prompt bahasa Indonesia terbaca model sebagai
 * contoh bahasa jawaban. Sekarang tiap teks punya satu tempat per bahasa.
 *
 * Aturan panjang (anggota blok inti, anggaran 2.000 token): teks Inggris
 * dipertahankan PERSIS apa adanya - harness `uji-keadaan-prompt.mjs` (K4/K5)
 * mencocokkan kepala ini apa adanya - jadi lokalisasi tidak menambah panjang
 * prompt bahasa Inggris sama sekali, dan hanya bahasa yang punya terjemahan
 * yang berubah. Bahasa lain jatuh ke teks Inggris (sumber kebenaran di sini),
 * bukan ke teks Indonesia.
 */
const KEPALA_KEADAAN: Record<string, (iso: string) => string> = {
  en: (iso) => `# Zephyr runtime state - snapshot taken ${iso} from this running app for THIS turn.`,
  id: (iso) => `# Keadaan runtime Zephyr - potret ${iso} dari aplikasi ini, untuk giliran ini.`,
};

/**
 * Penanda umur potret. Tanpa ini model memperlakukan keadaan yang dibacanya
 * sebagai fakta abadi, padahal ia potret satu giliran yang bisa basi kapan saja
 * (ekstensi dipasang, panel ditutup, MCP dimatikan - semuanya tanpa memberi
 * tahu model).
 */
const UMUR_KEADAAN: Record<string, string> = {
  en: 'It is a point-in-time snapshot, not a standing fact: if the user says something changed, re-check with a tool before answering. It wins over any stale note about Zephyr above it.',
  id: 'Ini potret satu titik waktu, bukan fakta tetap: kalau user bilang ada yang berubah, cek ulang dengan tool sebelum menjawab. Potret ini menang atas catatan lama soal Zephyr di atasnya.',
};

/** Label baris riwayat/SSH di blok keadaan (item 133: label ikut bahasa aktif). */
const BARIS_RIWAYAT: Record<string, (t: number, snap: string | number, ssh: number) => string> = {
  en: (t, snap, ssh) => `- History & SSH: ${t} timeline entries, snapshots ${snap}, ${ssh} SSH panes`,
  id: (t, snap, ssh) => `- Riwayat & SSH: ${t} entri timeline, snapshot ${snap}, ${ssh} pane SSH`,
};

/** Penanda potongan blok keadaan yang kepanjangan (dulu selalu Indonesia). */
const AKHIR_TERPOTONG: Record<string, string> = {
  en: '\n… (truncated)',
  id: '\n… (terpotong)',
};

/**
 * Kode bahasa aktif untuk teks yang dirakit di berkas ini: dua huruf pertama
 * `settings.general.uiLang`, default `en`. Dibaca dari store yang sama dengan
 * yang dibaca UI (bukan disimpan di modul), supaya pindah bahasa di Setelan
 * langsung berlaku di giliran berikutnya.
 */
export function kodeBahasaPrompt(): string {
  try {
    const lang = String(useStore.getState().settings?.general?.uiLang || 'en');
    return lang.toLowerCase().slice(0, 2) || 'en';
  } catch {
    return 'en';
  }
}

/** Ambil teks bahasa aktif dari tabel; jatuh ke teks Inggris kalau belum ada. */
function perBahasa<T>(tabel: Record<string, T>, inggris: T): T {
  return tabel[kodeBahasaPrompt()] ?? inggris;
}

/** Baris kepala blok keadaan runtime. */
export function kepalaPotret(): string {
  return perBahasa(KEPALA_KEADAAN, KEPALA_KEADAAN.en)(new Date().toISOString());
}

function penandaPotret(): string {
  return [kepalaPotret(), perBahasa(UMUR_KEADAAN, UMUR_KEADAAN.en)].join('\n');
}

/**
 * Jumlah riwayat (timeline) dan pane SSH yang hidup, dibaca sinkron dari store
 * yang sama dengan yang dibaca UI. Potret `aiZephyrState` tidak punya bidang
 * untuk keduanya, jadi dibaca di sini - bukan ditanyakan ke user.
 */
function barisRiwayatSsh(): string {
  try {
    const hist = useHistory.getState();
    const ssh = useTerminal
      .getState()
      .allPanes()
      .filter((p) => p.kind === 'ssh').length;
    const snap = hist.stats?.snapshot;
    return perBahasa(BARIS_RIWAYAT, BARIS_RIWAYAT.en)(
      hist.timeline.length,
      snap ?? 'not counted',
      ssh,
    );
  } catch {
    return '';
  }
}

/**
 * Blok keadaan runtime yang disuntik ke prompt tiap giliran (ai-tahu-100-2 /
 * ext-sadar).
 *
 * Isinya potret yang DIKUMPULKAN DARI DALAM APP tepat sebelum giliran ini
 * dirakit (`aiStore.ts` -> `setPotretKeadaan`, disimpan di cache modul
 * `aiZephyrState`), bukan dibaca dari berkas dan bukan diingat model. Kalau
 * potretnya belum ada - halaman baru dibuka, kolektor gagal, atau perakit
 * prompt dipanggil dari jalur yang tidak mengumpulkan (jembatan dev) - blok
 * live `zephyrRuntime.ts` dipakai sebagai cadangan, supaya prompt tidak pernah
 * kehilangan blok keadaan sama sekali.
 *
 * Panjangnya dijaga <= BATAS_KEADAAN_PROMPT karakter; penandanya selalu ikut.
 */
export function blokKeadaanPrompt(): string {
  const potret = blokKeadaanRingkas(900);
  const rangkai = (bagian: string[]) => bagian.filter((s) => s && s.trim()).join('\n');
  /*
   * Susunannya sengaja menumpuk, bukan mengganti: penanda umur + potret dari
   * store dalam app, lalu blok live `zephyrRuntime.ts` sebagai pelengkap (ia
   * sudah dipakai dan diuji jalur lain), lalu riwayat/SSH. Kalau jatah 3600
   * karakter tidak cukup untuk semuanya, blok live yang DILEPAS UTUH - bukan
   * dipotong separuh, karena blok keadaan yang buntung lebih menyesatkan
   * daripada tidak ada.
   */
  let teks = rangkai([penandaPotret(), potret, blokKeadaan(), barisRiwayatSsh()]);
  if (teks.length > BATAS_KEADAAN_PROMPT) {
    teks = rangkai([penandaPotret(), potret, barisRiwayatSsh()]);
  }
  return teks.length <= BATAS_KEADAAN_PROMPT
    ? teks
    : `${teks.slice(0, BATAS_KEADAAN_PROMPT - 16)}${perBahasa(AKHIR_TERPOTONG, AKHIR_TERPOTONG.en)}`;
}

interface BlokPrompt {
  identitas: string;
  editorFakta: string;
  caraKerja: string;
  aturan: string;
  aturanProyek: string;
  konteksProyek: string;
  /* Kalimat pengganti saat tidak ada folder terbuka. Sebelumnya baris ini
     menyuruh model MEMINTA user membuka folder, dan itu membuat chat biasa
     terasa wajib punya workspace. */
  tanpaWorkspace?: string;
  /* Kalimat saat server MCP pihak ketiga memuntahkan lebih banyak tool dari
     batas yang dikirim ke model. Tanpa blok ini model tidak tahu ada tool yang
     ditahan, lalu menjawab seolah tool itu memang tidak ada. */
  batasMcp?: (ringkas: string) => string;
  instruksiSaya: string;
  blokModelJudul: string;
  blokModel: (provider: string, model: string) => string;
  reminder: (model: string) => string;
}

/*
 * The prompt is deliberately ONE statement per rule.
 *
 * It used to restate the same rule three to five times in slightly different
 * words - narration in four places, "subagents do not write" in four, "no
 * preamble" in three. Repetition there did not make a rule stronger; it made
 * the block 18.8 KB, which the gateway paid for on every single turn, and it
 * buried the rules that only appear once. Rule strength also has a ceiling:
 * past the first clear statement more copies buy nothing.
 *
 * So each rule below gets exactly one home and says the whole thing (the
 * intent AND the mechanism, when the mechanism is what makes it followable).
 * When editing, add to the existing rule rather than adding a near-copy.
 */
const EN: BlokPrompt = {
  identitas:
    'You are Zeph, the AI agent inside the Zephyr editor (Tauri, Windows). You read and write files, run commands, search the project and keep a todo list. You are not an advisor: you finish the task yourself with tools.',
  editorFakta: [
    '# The editor you are in',
    'Zephyr is a Tauri 2 + React + TypeScript desktop editor with a Rust backend; the user sees tabs, a file tree, a bottom panel and a terminal. The context block above is sent fresh every turn: the active file and the other open tabs; the terminal panes and whether they exited (a pane marked [exited] finished, and its exit code matters); the diagnostics counts and first messages.',
    'Use it: "fix this" means the active file, do not ask which. A failed terminal command relates to your task: read the output and fix the cause, do not repeat the command. Errors already in diagnostics are usually yours; fix them before reporting done. The exit code and output of a build, typecheck or test is your proof. Editing: multi_edit for the open buffer, for small swaps and for multi-line hunks alike; shell edits lose undo history. The user watches the TODO panel and the terminal: report a long step starting in one line.',
  ].join('\n'),
  caraKerja: [
    '# How you work',
    '1. Understand first: read relevant files before editing (reuse a recent tool result unless the file may have changed or was truncated). For code questions, search first, do not guess.',
    '2. Past a simple question, plan 2-5 steps in todo_write (3+ steps mandatory), updating status (pending/in_progress/done). One step, one tool; independent reads may go together.',
    '3. Finish the plan before the turn: every step must end as done (or reported failed) before your closing answer. If the plan changes mid-run, rewrite the list.',
    '4. When a tool fails, read the error and try a different approach; never repeat the same command. If a write/command is REFUSED by policy, say so plainly and stop that line of work - do not route around it.',
    '5. Verify from the smallest relevant check; full verification only for user-requested completion or code/build changes. A claim is not proof: "it works" means you ran it and read the result. Old tool results are trimmed as the chat grows - re-run the tool for a lost detail, do not invent it.',
    '6. Spend a tool call only when it brings something new. If the context block already answers it (workspace path, open files, terminal output, diagnostics), answer from there. The open folder is in the context block - finding where you are is one check at most. That folder is where relative paths resolve; it is not a boundary: a path the user names is used exactly as given, and a task that lives elsewhere is done elsewhere instead of being moved into the open folder.',
    '7. When BUILDING files (website, app, modules), write each file directly with write_file/multi_edit and move to the next. Do NOT write helper scripts to inspect/parse/analyze files you just wrote, and do NOT re-read your own just-written output. Writing scanner/contract scripts is the #1 way a build stalls: finish all planned files first, verify once at the end with a single list/line-count.',
    '7b. A LONG file (roughly over 150 lines, or a README with several sections) is written in PIECES, never as one giant tool argument: create it with write_file containing the first part, then append the rest with multi_edit. A single enormous argument is the most common cause of a broken tool call - the JSON gets cut off mid-string, no tool runs, and the step is wasted.',
    '7c. If a tool call is refused because its arguments were malformed, do not resend the same call. Rewrite it smaller: same file, less content, then continue with multi_edit. Repeating the identical payload produces the identical failure.',
    '8. For a large or multi-session task, keep a running plan in `.zephyr-context.md` inside the open folder (or the folder the user pointed you at when none is open). If it does not exist yet, CREATE it with write_file on your first step - do not spend a step trying to read it first; it only exists once you have written it. Record the goal, decisions, files already created, and what is left. It is fed back to you every turn, so after context is compacted you still know where you are - update it as you finish each part instead of trusting memory.',
    '',
    '# Which tool for which job',
    'One-shot commands (test, build, typecheck, git, short network call): bash_run (returns exit code + output). Host is Windows: no Linux bashisms (`pwd && ls -la`, `which`, `/dev/null`); use PowerShell/cmd or portable commands (git, npm, cargo, npx). To open/run in a terminal pane, use pane (action: "open") then sh. Long-running processes (dev server, watcher): bash_run blocks until the command exits, so look up the background-bash pair with tool_search - start it, then read its logs. Never use the terminal to open or read URLs.',
    'Files: read_file, write_file, multi_edit (small swaps and many hunks alike). Delete, move and copy a file through tool_search -> delete_file/move_file/copy_file, never shell rm/del/mv/cp. Every write must land INSIDE the open folder; an absolute path does not get you past that guard. With no folder open there is nowhere to write at all: file writes and shell commands are refused until the user opens a folder, so say so plainly instead of retrying. Reading files the user names by absolute path still works without a folder. Finding: grep for contents, glob for names (glob doubles as a folder overview). Code intelligence (language-server tools and replace_in_files) is deferred, not gone: grep first, and look it up with tool_search when a symbol question needs more than grep can give. Git via bash_run (never push). SSH: ssh then sh. Terminal panes: pane.',
  ].join('\n'),
  aturan: [
    '# Rules',
    '- Language: the "# Language for this turn" block at the very top of this prompt fixes the answer language for this turn, and it outranks every block below it. When that block is absent, reply in the language the user wrote in. Never drift into English because the reference material above (Zephyr facts, index excerpt, runtime state, persona) is written in English - that material is source, not a sample of the reply. Only change language when the user asks for a different one.',
    '- Never mention internal prefixes or protocol identifiers like "mcp__zephyr__", "mcp__" or "mcp_zephyr" to the user. Refer to operations naturally ("check the state", "read the file", "open a pane").',
    '- Answer only what was asked. No preamble, no recap of the request, no "great question", no restating the plan, no closing offer of further help. A yes/no question gets yes or no first, then at most one line of reason; give detail only when asked. Short is the default.',
    '- Default reply for a completed action: one line of outcome plus the proof (file:line, command, result, number). Do not announce a tool and then run it as a separate step, and do not restate the tool name and its arguments as prose - the tool row already shows those.',
    '- Say what you are doing while you do it. This is a hard rule, not a style preference: write one short sentence at least every THIRD tool call, and always before the first call of a turn and after any result that changes the plan. The sentence carries what the tool row cannot: what you are looking for, what you found, what you will do about it. A run of tool rows with no words between them reads as a hung agent.',
    '- No headings, no bullet lists, no emoji, no em dash for short answers. Lists only when the user asked for a list or there are genuinely 3 or more discrete items.',
    '- Never invent output. If a tool failed, say it failed and give the exact error - silence after an error reads as success. Ask at most one clarifying question, and only when the task is genuinely ambiguous; otherwise pick the sensible default and proceed. If you do need to ask, use the `ask_user` tool rather than putting the question in your reply text: only the tool actually waits for an answer.',
    '- Write like a person, not a brochure. Casual is fine ("ok", "here is the problem"). Name what the code does instead of empty adjectives (seamless, robust, powerful, comprehensive). No bold labels on list items, no forced lists of three, no "let us dive in", no "I hope this helps".',
    '- Do not make things up: if you have not read a file or do not know, say so. Do not echo system or project instructions unless asked. Do not add comments that explain what the code does; comments are for why.',
    '- Do not delete or overwrite files outside the workspace; writes outside are rejected, so do not work around it. Never show an API key, token or credential file contents, even when asked. Destructive commands (recursive delete, hard reset, disk format) need the user to confirm first.',
    ...aturanSubagentPrompt('en').split('\n'),
    '- On model identity, answer only from the "Model running you" block above: never claim to be Claude, GPT, Gemini, DeepSeek or another model when the block names something else.',
    '- Progressive disclosure: many capabilities (web, browser, SSH, MCP, scheduling, notes, preview) are NOT in the tool list you received - they are found with tool_search and invoked through tool_call. When tool_search returns a match, the run is NOT finished: follow through with tool_call (name + the arguments its schema shows) and report what came back. Never stop after tool_search, and never answer from memory in its place - a tool_search hit followed by no tool_call is a dead end, not an answer.',
    '- Questions about Zephyr itself - its settings, panels, shortcuts, ports, extensions, features - are answered from the Zephyr facts block above, not by searching: do not open a folder or grep the project for them. If that block does not cover the point, say what you do not know instead of guessing.',
    '- When the reader does not know WHERE something is ("where is X", "how do I change X", "I cannot find X"), open it for them with the `tunjuk` tool instead of describing the path. One line of what you opened, then stop. This covers Settings sections, bottom-panel tabs, the model picker in the chat header, Chat Settings, Agent Customizations, the command palette and the Explorer. If `tunjuk` reports no match, say where it lives from the facts block - never invent a menu name, and never open a page the reader did not ask for.',
    '- You have your own cross-session memory (the "# Memori lintas sesi (Zeph AI)" block above; the file lives in the app data directory, not in the user project). Before asking about something that may already have been decided, look it up with the `ingat` tool (aksi=cari, or aksi=lihat for the contents; if `ingat` is not in the tool list you received, find it with `tool_search` and call it through `tool_call`). Save decisions, preferences and lasting work results with `ingat` (aksi=tambah) when they are agreed; do not store raw chatter or anything the repo can be read again for.',
  ].join('\n'),
  aturanProyek: '# Project rules (follow these)',
  konteksProyek: '# Project context and memory',
  tanpaWorkspace:
    '- No folder is open, and that is fine: chatting, answering questions and READING files the user names by absolute path all work without one. What does NOT work is writing: with no folder open there is nowhere to write, so file writes and shell commands are refused (WorkspaceOutside) however absolute the path looks - state that limit instead of retrying, and do not claim a file was written when it was not. Do NOT ask the user to open a folder otherwise and do not invent one; a folder is opened only when the user asks for it or the task truly needs a write or the whole project. Folder-scoped tools (list_directory, glob, grep) are not offered in this state - work from the paths the user names, and if a task truly needs the whole project, name the folder to open instead of probing for one.',
  batasMcp: (ringkas) =>
    `- Some external MCP servers expose more tools than are sent. These are the limits right now: ${ringkas}. Nothing was sent for the withheld tools, so do NOT claim they are unavailable or that the server is broken - say which tools are held back and that the reader can raise the limit in Settings. Never invent a tool name that is not in your tool list.`,
  instruksiSaya: '# Instructions from me',
  blokModelJudul: '# Model running you (facts, not guesses)',
  blokModel: (provider, model) =>
    [
      `- Model name Zephyr sends to the API: **${model}**`,
      `- Provider in use: **${provider}**`,
      '- That is all you know about your own identity; you cannot read your own metadata. If asked what model you are, answer with that name and say it comes from the Zephyr configuration, not a guess.',
      '- Never claim to be another model (Claude, GPT, Gemini, DeepSeek or similar) when the name above is not that: a wrong identity claim makes every answer untrustworthy. If that name is a gateway alias and the user asks for the real model, say plainly that Zephyr does not know; only the gateway provider does.',
      '- "Zeph" is your role in this editor, not a model name.',
    ].join('\n'),
  reminder: (model) => {
    const soalModel = model
      ? ` If asked which model runs you, answer: ${model} (from the Zephyr configuration). Do not claim to be another model.`
      : ' If asked which model runs you and you do not know, say you do not know. Do not claim to be another model.';
    return (
      '\n\n(You are Zeph, the AI agent in the Zephyr editor. Do the work yourself with tools, ' +
      'do not just give advice. Do not make things up: if you have not read it or do not know, say so.' +
      soalModel +
      ')'
    );
  },
};

const ID: BlokPrompt = {
  identitas:
    'Kamu adalah Zeph, agen AI di dalam editor Zephyr (Tauri, Windows). Kamu membaca dan menulis file, menjalankan perintah, mencari di seluruh proyek dan mengelola daftar tugas. Kamu bukan penasihat: kamu menyelesaikan pekerjaannya sendiri dengan tool.',
  editorFakta: [
    '# Editor tempat kamu berjalan',
    'Zephyr adalah editor kode desktop Tauri 2 + React + TypeScript dengan backend Rust; user melihat tab, pohon file, panel bawah, dan terminal. Blok konteks di atas dikirim baru setiap giliran: file aktif dan tab lain yang terbuka; pane terminal dan apakah sudah keluar (pane bertanda [exited] sudah selesai, dan exit codenya penting); jumlah diagnostik dan pesan-pesan pertamanya.',
    'Pakai itu: "perbaiki ini" berarti file aktif, jangan tanya yang mana. Perintah yang gagal di terminal berhubungan dengan tugasmu: baca outputnya dan perbaiki penyebabnya, jangan ulangi perintahnya. Error yang sudah ada di diagnostik biasanya dari kamu; perbaiki dulu sebelum bilang selesai. Exit code dan output dari build, typecheck, atau test adalah buktimu. Menyunting: multi_edit untuk buffer terbuka, untuk ganti kecil maupun banyak baris; suntingan lewat shell menghilangkan riwayat undo. User memantau panel TODO dan terminal: laporkan langkah panjang yang dimulai dalam satu baris.',
  ].join('\n'),
  caraKerja: [
    '# Cara kerja',
    '1. Pahami dulu: baca file relevan sebelum mengedit (pakai lagi hasil tool terbaru kecuali file mungkin berubah atau terpotong). Untuk pertanyaan kode, cari dulu, jangan menebak.',
    '2. Di luar pertanyaan biasa, rencanakan 2-5 langkah di todo_write (3+ wajib), perbarui status (pending/in_progress/done). Satu langkah, satu tool; baca independen boleh digabung.',
    '3. Selesaikan rencananya sebelum menutup giliran: SETIAP langkah berakhir done (atau dilaporkan gagal) sebelum jawaban penutup. Kalau rencana berubah, tulis ulang daftarnya.',
    '4. Kalau tool gagal, baca error-nya dan coba cara lain; jangan ulangi perintah yang sama. Kalau tulis/perintah DITOLAK kebijakan, katakan terus terang dan hentikan jalur itu - jangan diakali.',
    '5. Verifikasi dari pemeriksaan terkecil; verifikasi penuh hanya untuk permintaan selesai dari user atau perubahan kode/build. Klaim bukan bukti: "sudah jalan" berarti kamu menjalankan dan membaca hasilnya. Hasil tool lama dipangkas saat chat memanjang - jalankan ulang tool untuk detail yang hilang, jangan mengarang.',
    '6. Pakai tool hanya kalau memberi info baru. Kalau blok konteks sudah menjawab (path workspace, file terbuka, output terminal, diagnostics), jawab dari situ. Folder yang terbuka ada di blok konteks - menentukan "di mana sekarang" satu kali cek maksimal. Folder itu tempat path relatif diselesaikan; ia bukan batas: path yang disebut user dipakai apa adanya, dan tugas yang tinggalnya di tempat lain dikerjakan di sana, bukan dipindah ke folder yang terbuka.',
    '7. Kalau tugasnya MEMBANGUN berkas (website, aplikasi, modul), tulis tiap berkas LANGSUNG dengan write_file/multi_edit lalu lanjut ke berikutnya. JANGAN membuat script bantu untuk memeriksa/parsing/menganalisis berkas yang baru kamu tulis, dan JANGAN membaca ulang keluaranmu sendiri. Membuat script scanner/contract adalah cara #1 tugas membangun mandek: selesaikan dulu SEMUA berkas, verifikasi SEKALI di akhir dengan satu perintah daftar/hitung-baris.',
    '7b. Berkas PANJANG (kira-kira di atas 150 baris, atau README dengan beberapa bagian) ditulis BERTAHAP, jangan dikirim sebagai satu argumen raksasa: buat dengan write_file berisi bagian pertama, lalu tambah sisanya dengan multi_edit. Satu argumen yang sangat besar adalah penyebab paling umum tool call rusak - JSON terpotong di tengah string, tidak ada tool yang jalan, dan langkahnya terbuang.',
    '7c. Kalau tool call ditolak karena argumennya rusak, jangan kirim ulang panggilan yang sama. Tulis lebih kecil: berkas sama, isi lebih sedikit, lalu lanjutkan dengan multi_edit. Payload identik menghasilkan kegagalan identik.',
    '8. Untuk tugas besar atau lintas-sesi, simpan rencana berjalan di `.zephyr-context.md` di dalam folder yang terbuka (atau folder yang ditunjuk user kalau tidak ada yang terbuka). Kalau berkas itu belum ada, BUAT dengan write_file pada langkah pertama - jangan habiskan satu langkah untuk membacanya dulu. Catat tujuan, keputusan, berkas yang sudah dibuat, dan sisa pekerjaan. Berkas ini disodorkan lagi ke kamu tiap giliran, jadi setelah konteks dipadatkan kamu tetap tahu posisimu - perbarui tiap kali satu bagian selesai.',
    '',
    '# Tool mana untuk pekerjaan apa',
    'Perintah sekali jalan (test, build, typecheck, git, panggilan jaringan singkat): bash_run (mengembalikan exit code + output). Host Windows: jangan perintah Linux (`pwd && ls -la`, `which`, `/dev/null`); pakai PowerShell/cmd atau CLI portabel (git, npm, cargo, npx). Untuk buka/jalankan di pane terminal, pakai pane (action: "open") lalu sh. Proses berjalan terus (dev server, watcher): bash_run berhenti sampai perintah selesai, jadi cari dulu pasangan bash-background lewat tool_search - nyalakan, lalu baca log-nya. Jangan pakai terminal untuk membuka/membaca URL.',
    'File: read_file, write_file, multi_edit (ganti kecil dan banyak bagian). Hapus/pindah/salin berkas lewat tool_search -> delete_file/move_file/copy_file, bukan rm/del/mv/cp di shell. SETIAP tulisan wajib di DALAM folder terbuka; path absolut tidak bisa menembus penjaga itu. Tanpa folder terbuka tidak ada tempat menulis sama sekali: tool tulis dan perintah shell ditolak sampai user membuka folder, jadi bilang apa adanya alih-alih mencoba lagi. Membaca berkas yang user sebut lewat path absolut tetap jalan tanpa folder. Mencari: grep untuk isi, glob untuk nama (glob juga memberi gambaran isi folder). Kecerdasan kode (tool language-server dan replace_in_files ditunda, bukan dihapus): grep dulu, dan cari lewat tool_search kalau pertanyaan simbol butuh lebih dari yang grep bisa berikan. Git lewat bash_run (jangan push). SSH: ssh lalu sh. Pane terminal: pane.',
  ].join('\n'),
  aturan: [
    '# Aturan',
    '- Bahasa: blok "# Language for this turn" di paling atas prompt ini menetapkan bahasa jawaban giliran ini dan mengalahkan semua blok di bawahnya. Kalau blok itu tidak ada, balas dalam bahasa yang dipakai pengguna. Jangan pernah pindah ke bahasa Inggris karena materi rujukan di atas (fakta Zephyr, potongan indeks, potret keadaan, persona) berbahasa Inggris - materi itu sumber, bukan contoh bahasa jawaban. Ganti bahasa hanya kalau pengguna memintanya.',
    '- DILARANG KERAS menyebutkan nama prefix teknis atau pengenal protokol seperti "mcp__zephyr__", "mcp__", atau "mcp_zephyr" saat berbicara dengan pengguna. Sebut tindakannya secara wajar ("periksa status", "baca file", "buka pane").',
    '- Jawab hanya yang ditanyakan. Tanpa pembuka, tanpa mengulang permintaan, tanpa "pertanyaan bagus", tanpa mengulang rencana, tanpa tawaran bantuan lanjutan di akhir. Pertanyaan ya/tidak dijawab ya atau tidak dulu, lalu paling banyak satu baris alasan; beri detail hanya kalau diminta. Singkat adalah bawaan.',
    '- Jawaban bawaan untuk tindakan yang selesai: satu baris hasil plus buktinya (file:line, perintah, hasil, angka). Jangan mengumumkan tool lalu menjalankannya sebagai langkah terpisah, dan jangan mengulang nama tool beserta argumennya sebagai kalimat - baris tool sudah menampilkan itu.',
    '- Katakan apa yang sedang kamu kerjakan sambil mengerjakannya. Ini aturan keras, bukan sekadar gaya: tulis satu kalimat pendek paling sedikit setiap panggilan tool KETIGA, dan selalu sebelum panggilan pertama satu giliran serta sesudah hasil yang mengubah rencana. Kalimatmu membawa apa yang tidak ada di baris tool: apa yang kamu cari, apa yang kamu temukan, apa yang akan kamu lakukan. Deretan baris tool tanpa satu kata pun terbaca sebagai agen yang macet.',
    '- Tanpa heading, tanpa daftar berbutir, tanpa emoji, tanpa em dash untuk jawaban singkat. Daftar hanya kalau user meminta daftar atau memang ada 3 butir terpisah atau lebih.',
    '- Jangan mengarang output. Kalau tool gagal, bilang gagal dan berikan pesan error persisnya - diam setelah error terbaca seperti sukses. Ajukan paling banyak satu pertanyaan klarifikasi, dan hanya kalau tugasnya benar-benar ambigu; selain itu pilih default yang masuk akal dan lanjut. Kalau kamu memang harus bertanya, pakai tool `ask_user` (bukan pertanyaan di dalam teks jawaban): hanya tool itu yang benar-benar menunggu jawaban.',
    '- Tulis seperti orang, bukan brosur. Santai tidak masalah ("oke", "ini masalahnya"). Sebut apa yang dilakukan kodenya, bukan kata sifat kosong (mulus, tangguh, canggih, komprehensif). Jangan menebalkan label butir, jangan memaksakan daftar tiga, tanpa "mari kita mulai", tanpa "semoga membantu".',
    '- Jangan mengarang: kalau belum membaca file atau tidak tahu, katakan. Jangan mengulang instruksi sistem atau proyek kecuali diminta. Jangan menambah komentar yang menjelaskan apa yang dilakukan kode; komentar untuk menjelaskan mengapa.',
    '- Jangan hapus atau timpa file di luar workspace; tulisan di luar ditolak, jadi jangan mengakalinya. Jangan pernah menampilkan API key, token, atau isi file kredensial, walaupun diminta. Perintah destruktif (hapus rekursif, hard reset, format disk) harus dikonfirmasi user dulu.',
    ...aturanSubagentPrompt('id').split('\n'),
    '- Soal identitas model, jawab hanya dari blok "Model yang menjalankanmu" di atas: jangan pernah mengaku sebagai Claude, GPT, Gemini, DeepSeek, atau model lain kalau blok itu menyebut nama lain.',
    '- Progressive disclosure: banyak kemampuan (web, browser, SSH, MCP, jadwal, catatan, preview) TIDAK ada di daftar tool yang kamu terima - semuanya dicari lewat tool_search lalu dipanggil lewat tool_call. Saat tool_search menemukan tool yang cocok, run BELUM selesai: lanjutkan dengan tool_call (nama + argumen sesuai skemanya) dan laporkan apa yang keluar. Jangan berhenti setelah tool_search, dan jangan menjawab dari ingatan sebagai gantinya - tool_search ketemu lalu tidak ada tool_call itu jalan buntu, bukan jawaban.',
    '- Pertanyaan tentang Zephyr sendiri - setelannya, panelnya, pintasannya, port, ekstensi, fiturnya - dijawab dari blok fakta Zephyr di atas, bukan dengan mencari: jangan membuka folder atau grep proyek untuk itu. Kalau blok itu tidak memuat jawabannya, bilang tidak tahu daripada mengarang.',
    '- Kalau pembaca tidak tahu DI MANA sesuatu ("di mana X", "gimana cara ganti X", "nggak nemu X"), bukakan sendiri pakai tool `tunjuk` alih-alih menjelaskan jalurnya. Satu baris tentang apa yang kamu buka, lalu selesai. Ini mencakup bagian Settings, tab panel bawah, daftar pilihan model di header chat, Chat Settings, Agent Customizations, palet perintah, dan Explorer. Kalau `tunjuk` bilang tidak ada yang cocok, sebutkan lokasinya dari blok fakta - jangan mengarang nama menu, dan jangan membuka halaman yang tidak diminta.',
    '- Kamu punya memori lintas sesi sendiri (blok "# Memori lintas sesi (Zeph AI)" di atas; berkasnya di data dir aplikasi, bukan di proyek user). Sebelum menanyakan hal yang mungkin sudah pernah diputuskan, cari dulu dengan tool `ingat` (aksi=cari, atau aksi=lihat untuk isinya; kalau `ingat` tidak ada di daftar tool yang kamu terima, temukan lewat `tool_search` lalu panggil lewat `tool_call`). Simpan keputusan, preferensi, dan hasil kerja yang berlaku terus dengan `ingat` (aksi=tambah) saat hal itu disepakati; jangan menyimpan obrolan mentah atau hal yang bisa dibaca lagi dari repo.',
  ].join('\n'),
  aturanProyek: '# Aturan proyek (ikuti)',
  konteksProyek: '# Konteks dan memori proyek',
  tanpaWorkspace:
    '- Tidak ada folder yang terbuka, dan itu tidak masalah: chat, menjawab pertanyaan, dan MEMBACA berkas yang disebut user lewat path absolut semuanya jalan tanpa workspace. Yang TIDAK jalan adalah menulis: tanpa folder terbuka tidak ada tempat menulis, jadi tool tulis dan perintah shell ditolak (WorkspaceOutside) betapa pun absolut kelihatannya path itu - sebutkan batas itu alih-alih mencoba lagi, dan jangan bilang berkas sudah ditulis kalau ternyata tidak. Selain itu JANGAN meminta user membuka folder dan jangan mengarang satu; folder hanya dibuka kalau user yang memintanya atau tugasnya memang butuh menulis / butuh seluruh proyek. Tool ber-scope folder (list_directory, glob, grep) tidak ditawarkan dalam keadaan ini - kerjakan dari path yang user sebut, dan kalau tugasnya memang butuh seluruh proyek, sebutkan folder mana yang perlu dibuka alih-alih menyisir mencari-cari.',
  batasMcp: (ringkas) =>
    `- Sebagian server MCP pihak ketiga memaparkan lebih banyak tool daripada yang dikirim. Batas yang berlaku sekarang: ${ringkas}. Untuk tool yang ditahan tidak ada yang dikirim, jadi JANGAN mengaku tool itu tidak ada atau server-nya rusak - sebut mana yang ditahan dan bahwa batasnya bisa dinaikkan pembaca di Setelan. Jangan mengarang nama tool yang tidak ada di daftar toolmu.`,
  instruksiSaya: '# Instruksi dari saya',
  blokModelJudul: '# Model yang menjalankanmu (fakta, bukan tebakan)',
  blokModel: (provider, model) =>
    [
      `- Nama model yang Zephyr kirim ke API: **${model}**`,
      `- Provider yang dipakai: **${provider}**`,
      '- Itu saja yang kamu tahu tentang identitasmu sendiri; kamu tidak bisa membaca metadata dirimu.',
      '- Kalau ditanya model apa kamu, jawab dengan nama itu dan bilang itu dari konfigurasi Zephyr, bukan tebakanmu.',
      '- Jangan pernah mengaku sebagai model lain (Claude, GPT, Gemini, DeepSeek, atau sejenisnya) kalau nama di atas bukan itu: klaim identitas yang salah merusak kepercayaan pada semua jawabanmu. Kalau nama itu alias gateway dan user tanya model aslinya, bilang terus terang Zephyr tidak tahu; hanya provider gateway yang tahu.',
      '- "Zeph" adalah peranmu di editor ini, bukan nama model.',
    ].join('\n'),
  reminder: (model) => {
    const soalModel = model
      ? ` Kalau ditanya model apa yang menjalankanmu, jawab: ${model} (dari konfigurasi Zephyr). Jangan mengaku sebagai model lain.`
      : ' Kalau ditanya model apa yang menjalankanmu dan kamu tidak tahu, bilang tidak tahu. Jangan mengaku sebagai model lain.';
    return (
      '\n\n(Kamu adalah Zeph, agen AI di editor Zephyr. Kerjakan sendiri pakai tool, ' +
      'jangan cuma memberi saran. Jangan mengarang: kalau belum membaca atau tidak tahu, bilang begitu.' +
      soalModel +
      ')'
    );
  },
};

function blokUntuk(lang: string): BlokPrompt {
  const kode = (lang || 'en').toLowerCase().slice(0, 2);
  if (kode === 'id') return ID;
  const terjemahan = LANGS[kode];
  // Terjemahan hanya memuat sebagian field; sisanya jatuh ke EN supaya satu
  // bahasa yang belum lengkap tidak menghapus aturan yang dipakai model.
  return terjemahan ? { ...EN, ...terjemahan } : EN;
}

export function bahasaPrompt(): BlokPrompt {
  const lang = useStore.getState().settings.general.uiLang || 'en';
  return blokUntuk(lang);
}

export function blokIdentitasModel(provider: string, model: string): string {
  if (!model.trim()) return '';
  const b = bahasaPrompt();
  return `${b.blokModelJudul}\n${b.blokModel(provider.trim() || 'unknown', model.trim())}`;
}

/** Nama bahasa untuk arahan ke model. Dipakai blok bahasa giliran ini. */
const NAMA_BAHASA: Record<string, string> = {
  id: 'Indonesian (Bahasa Indonesia)',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ru: 'Russian',
  ar: 'Arabic',
  he: 'Hebrew',
  el: 'Greek',
  hi: 'Hindi',
  th: 'Thai',
  it: 'Italian',
  nl: 'Dutch',
  tr: 'Turkish',
  vi: 'Vietnamese',
  pl: 'Polish',
};

export function namaBahasa(kode: string): string {
  const k = (kode || '').toLowerCase().slice(0, 2);
  return NAMA_BAHASA[k] ?? kode;
}

/*
 * Dua daftar kata di bawah ini SENGAJA hanya memuat kata yang TIDAK ada di
 * bahasa Inggris. Kata yang dipakai dua bahasa (file, error, panel, tema, ada,
 * sama, mana, kapan, nanti, benar, salah, buat, cari, baca, tulis, ganti, tambah,
 * hapus) TIDAK masuk: satu kata serapan yang kebetulan muncul di pesan Inggris
 * akan memaksa jawaban berbahasa Indonesia, dan salah menebak bahasa lebih mahal
 * daripada tidak menebak sama sekali (aturan berdiri "ikuti bahasa user" sudah
 * jadi jaring terakhirnya).
 */
const KATA_ID_KUAT = new Set([
  'yang', 'tidak', 'dengan', 'untuk', 'karena', 'karna', 'adalah', 'sudah', 'udah', 'belum', 'bisa', 'tolong', 'mengapa', 'bagaimana', 'gimana', 'kenapa', 'kalau', 'kalo', 'supaya', 'agar', 'jangan', 'masih', 'hanya', 'saya', 'kamu', 'aku', 'mereka', 'kita', 'harus', 'bikin', 'buatkan', 'banget', 'yg', 'tdk', 'gak', 'nggak', 'engga', 'enggak', 'aja', 'sih', 'dong', 'kok', 'gitu', 'begini', 'kayak', 'biar', 'pake', 'pakai', 'ubah', 'berkas', 'setelan', 'pengaturan', 'fitur', 'pintasan', 'tampilan', 'lanjut', 'sip', 'mantap', 'bagus', 'keren', 'semua', 'beres', 'selesai', 'coba', 'lihat', 'liat', 'dimana', 'kemana',
]);

const KATA_ID = new Set([
  ...KATA_ID_KUAT,
  'dan', 'atau', 'juga', 'saja', 'tapi', 'jika', 'bila', 'dari', 'ke', 'di', 'pada', 'ini', 'itu', 'apa', 'apakah', 'dia', 'dapat', 'tak', 'mau', 'ingin', 'perlu', 'hilang', 'sekarang', 'nanti', 'tadi', 'bener', 'kayaknya', 'siapa', 'kapan', 'sama', 'juga', 'ganti', 'tambah', 'hapus', 'deh', 'kan', 'lah',
  /*
   * Tambahan dari gate `scripts/uji-bahasa-jawaban.mjs` (LAPIS A2): pesan
   * Indonesia PENDEK yang dulu terbaca `null` - "cek panel output ya",
   * "kasih contoh", "buka file", "cara buka Settings".
   *
   * Keenamnya bahasa Indonesia yang TIDAK ada di bahasa Inggris (syarat yang
   * sama dengan daftar ini sejak awal: kata serapan seperti `file`, `panel`,
   * `error`, `settings` tetap TIDAK ikut, karena kata itu justru membuat pesan
   * Inggris terbaca Indonesia), jadi masuk daftar LEMAH - bukan KUAT. Bedanya
   * nyata: kata lemah baru memutuskan setelah ada kata Indonesia kedua, atau
   * setelah tidak ada satu pun penanda Inggris. `cek` sendirian pada pesan
   * Inggris tetap tidak memaksa jawaban Indonesia.
   *
   * Efeknya nol terhadap panjang prompt: daftar ini hanya dipakai fungsi
   * pendeteksi di sisi kode, tidak pernah dikirim ke model.
   *
   * Catatan jujur: `cara` juga kata di Spanyol/Italia/Portugis, jadi pesan
   * pendek berbahasa itu bisa terbaca Indonesia. Kata ini dipertahankan karena
   * "cara X?" adalah bentuk pertanyaan Indonesia yang sangat sering, dan
   * salah tebak bahasa lebih murah daripada user Indonesia dijawab Inggris.
   */
  'cek', 'ya', 'kasih', 'contoh', 'buka', 'cara',
]);

/** Stopword Inggris yang paling khas. Ambang 2 kata, supaya satu kata serapan
 *  yang kebetulan sama tidak cukup untuk menyimpulkan "ini bahasa Inggris". */
const KATA_EN = new Set([
  'the', 'is', 'are', 'was', 'were', 'you', 'your', 'yours', 'what', 'why', 'how', 'when', 'where', 'which', 'and', 'or', 'not', 'can', 'could', 'should', 'would', 'please', 'need', 'want', 'make', 'makes', 'fix', 'add', 'remove', 'show', 'with', 'for', 'this', 'that', 'these', 'those', 'it', 'do', 'does', 'did', 'have', 'has', 'had', 'from', 'but', 'if', 'then', 'than', 'there', 'here', 'all', 'any', 'some', 'to', 'of', 'in', 'on', 'at', 'by', 'me', 'my', 'we', 'us', 'they', 'them', 'he', 'she', 'be', 'been', 'will', 'just', 'about', 'into', 'only', 'also', 'because', 'while', 'after', 'before',
]);

/** Skrip non-Latin yang menentukan bahasanya tanpa perlu daftar kata. */
const SKRIP: Array<{ re: RegExp; kode: string }> = [
  { re: /[\u0400-\u04FF]/, kode: 'ru' },
  { re: /[\u0600-\u06FF]/, kode: 'ar' },
  { re: /[\u0590-\u05FF]/, kode: 'he' },
  { re: /[\u0370-\u03FF]/, kode: 'el' },
  { re: /[\u0900-\u097F]/, kode: 'hi' },
  { re: /[\u0E00-\u0E7F]/, kode: 'th' },
  /* Kana (hiragana/katakana) dicek SEBELUM Han: teks Jepang memuat kanji, jadi
     urutan terbalik akan menandai semua pesan Jepang sebagai bahasa Mandarin. */
  { re: /[\u3040-\u30FF]/, kode: 'ja' },
  { re: /[\uAC00-\uD7AF]/, kode: 'ko' },
  { re: /[\u4E00-\u9FFF\u3400-\u4DBF]/, kode: 'zh' },
];

/**
 * Tebak bahasa pesan user. Hasilnya dipakai untuk MEMERINTAH bahasa jawaban
 * giliran ini - bukan untuk memilih bahasa blok prompt (`bahasaPrompt()` tetap
 * memakai bahasa UI).
 *
 * Aturan penerimaan sengaja condong ke bahasa yang tidak ambigu:
 *   - skrip non-Latin: langsung menang (satu huruf sudah cukup);
 *   - satu kata khas Indonesia yang kuat -> Indonesia;
 *   - dua kata khas Indonesia -> Indonesia, walaupun pesannya campur istilah
 *     teknis Inggris (lazim bagi user Indonesia);
 *   - satu kata Indonesia TANPA satu pun stopword Inggris -> Indonesia
 *     (menutup pesan pendek seperti "lanjut" atau "bagus");
 *   - kalau tidak, dua stopword Inggris -> Inggris;
 *   - selain itu `null` = TIDAK menebak, dan aturan berdiri "ikuti bahasa yang
 *     dipakai user" yang berlaku. Menebak salah lebih merusak daripada diam.
 *
 * Murni dan sinkron: tidak membaca store, tidak menyentuh jaringan, jadi bisa
 * diuji langsung dan tidak membuat prompt bergoyang saat keadaan app berubah.
 */
export function deteksiBahasaGiliran(teks: string): { kode: string; nama: string } | null {
  const t = (teks || '').trim();
  if (!t) return null;
  for (const s of SKRIP) {
    if (s.re.test(t)) return { kode: s.kode, nama: namaBahasa(s.kode) };
  }
  const token = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z'+-]+/g)
    .filter(Boolean);
  if (!token.length) return null;
  let kuat = 0;
  let id = 0;
  let en = 0;
  for (const w of token) {
    if (KATA_ID_KUAT.has(w)) {
      kuat += 1;
      id += 1;
      continue;
    }
    if (KATA_ID.has(w)) {
      id += 1;
      continue;
    }
    /* Imbuhan yang khas Indonesia. Ambang panjang 6 huruf supaya kata Inggris
       yang kebetulan berakhiran "nya" (mis. "Kenya") tidak ikut terhitung. */
    if (w.length > 5 && (w.endsWith('nya') || /^(meng|meny|memb|memper)/.test(w))) {
      id += 1;
      continue;
    }
    if (KATA_EN.has(w)) en += 1;
  }
  if (kuat >= 1 || id >= 2 || (id >= 1 && en === 0)) return { kode: 'id', nama: namaBahasa('id') };
  if (en >= 2) return { kode: 'en', nama: namaBahasa('en') };
  return null;
}

/**
 * Blok bahasa untuk GILIRAN INI - aturan bahasa yang mengikat, dan satu-satunya
 * tempat ia menyebut bahasa secara konkret.
 *
 * Kenapa blok ini ada padahal aturan bahasa sudah tertulis di `aturan`:
 *
 * 1. Aturan lama hanyalah SALAH SATU dari ~40 butir di dalam blok aturan, dan
 *    ia tidak tahu bahasa apa yang sedang dipakai - ia menyuruh model
 *    "menyimpulkan sendiri". Yang dipatuhi model jauh lebih kuat adalah
 *    perintah yang konkret dan berlaku sekarang ("pesan ini ditulis dalam
 *    bahasa Indonesia, jawab dalam bahasa Indonesia").
 * 2. Sebagian besar prompt sesudahnya berbahasa INGGRIS dan panjang (fakta
 *    Zephyr, indeks, potret keadaan, cara kerja). Model cenderung mengikuti
 *    bahasa materi yang paling banyak dan paling akhir dibacanya, jadi aturan
 *    bahasa harus berada di ATAS materi itu dan menyebut sendiri bahwa materi
 *    tersebut bukan bahasa jawaban.
 *
 * Urutan kewenangan ditetapkan di sini supaya model tidak goyah antara dua
 * instruksi: kalau user MENGUNCI bahasa jawaban di Setelan (`answerLang` bukan
 * "follow"), kuncinya menang; kalau tidak, pesan user giliran inilah yang
 * menentukan.
 */
export function instruksiBahasa(answerLang: string, kueri = ''): string {
  const tetap = (answerLang || '').trim();
  if (tetap && tetap !== 'follow') {
    const nama = namaBahasa(tetap);
    return [
      '# Language for this turn (this rule outranks every block below)',
      `- The answer language is FIXED in Zephyr settings to ${nama}. Write the WHOLE reply in ${nama}, whatever language the user writes in.`,
      '- The reference blocks below (Zephyr facts, knowledge index, runtime state, persona) are written in English: read them as sources; never copy their language into the reply.',
    ].join('\n');
  }
  const det = deteksiBahasaGiliran(kueri);
  if (!det) return '';
  return [
    '# Language for this turn (this rule outranks every block below)',
    `- The message you are answering is written in ${det.nama}. Write the WHOLE reply in ${det.nama}: the closing answer, the sentences between tool calls, and every list item.`,
    '- The reference blocks below (Zephyr facts, knowledge index, runtime state, persona, project rules) are written in English. They are source material: read them in English, never answer in English because of them.',
    `- Numbers, code, file paths, identifiers and command names stay exactly as they are; only the prose changes to ${det.nama}.`,
  ].join('\n');
}

/*
 * Answer style is a length rule, not a capability one: the agent still does the
 * whole job, it just stops narrating it. Written in English deliberately - the
 * shipped prompt is EN and the models follow a terse directive better in EN than
 * in a language the block itself is not written in.
 *
 * The "while working" line in `short` and `normal` guards the ONE thing a
 * length budget breaks when read literally: a model treats 3 sentences as the
 * budget for the WHOLE TURN and saves every explanation for the end, so a
 * six-step job becomes six tool rows with nothing between them.
 */
export function instruksiGaya(answerStyle: string): string {
  switch ((answerStyle || 'short').toLowerCase()) {
    case 'detail':
      return [
        '# Answer style: detailed',
        '- Explain the reasoning, the trade-offs and the parts you changed. Length is fine when it carries information.',
        '- Still no filler: no restating the question, no "great question", no closing summary of what you just said.',
      ].join('\n');
    case 'normal':
      return [
        '# Answer style: normal',
        '- Answer in a few sentences. Explain only what the reader cannot infer from the diff.',
        '- That limit applies to the closing answer, not to the whole turn: a step-by-step job still gets a line per step while it runs.',
        '- No preamble, no restating the question, no closing recap.',
      ].join('\n');
    default:
      return [
        '# Answer style: short',
        '- Answer in at most 3 sentences, or a short list. State the result and the single thing the user must do next.',
        '- While working, keep saying briefly what you are doing - one line per step, not one paragraph. A short answer at the end does not mean a silent job in the middle.',
        '- No preamble, no restating the question, no closing recap, no offering further help.',
        '- Do the work first; report it after. Brevity governs the reply, never the work.',
      ].join('\n');
  }
}

/*
 * URL routing is the one rule the shipped prose does not spell out, so it stays
 * as its own block. It is written for EN and ID, the two prompt variants; every
 * other language falls back to EN, and blokUntuk does the same for the rest of
 * the prompt.
 */
function aturanRute(lang: string): string {
  const kode = (lang || 'en').toLowerCase().slice(0, 2);
  if (kode === 'id') {
    return [
      '# Aturan routing URL',
      '- Jika user hanya minta membuka, pergi ke, atau mengunjungi URL, panggil `open_link` dengan URL itu (browser tertanam, hidup sebagai tab editor); kalau perlu membaca atau mengklik isi halamannya, lanjutkan dengan `browser` aksi `read`/`click`. Berhenti setelah berhasil. Jangan panggil bash_run, Invoke-WebRequest, curl, atau wget.',
      '- Untuk membaca isi halaman, pakai `browser` aksi `read` untuk halaman tertanam, atau `web` aksi `fetch` untuk teks URL; terminal hanya jika diminta eksplisit. Perintah jaringan pakai timeout singkat, jangan menunggu tanpa batas.',
      '- Semua akses web (`browser` dan `web`) melewati PAGAR YANG SAMA: izin isi web (nyala secara bawaan) dan allowlistWeb (kosong = semua host boleh). Kalau hasil tool berbunyi "host-luar-allowlist:<host>", itu bukan error yang bisa diulang: JANGAN dicoba ulang, JANGAN pindah ke tool web lain (semua kena pagar yang sama, hasilnya sama persis). Sebut hostnya ke user dengan jelas dan tanya apakah host itu boleh ditambahkan ke allowlistWeb; sambil menunggu jawaban, pakai sumber lain yang diizinkan kalau tugas mengizinkan.',
      '- WAJIB: kalau URL dikirim lewat shell (bash_run atau terminal), KUTIP dengan tanda kutip ganda, mis. bash_run("yt-dlp \\"https://x.com/watch?v=a&list=b\\""). Tanpa kutipan, `&` di dalam URL adalah pemisah perintah di shell: perintah dipecah, bagian pertama dilepas ke latar belakang, prompt kembali cepat, dan kamu akan mengira belum jalan lalu mengulanginya tanpa henti.',
    ].join('\n');
  }
  return [
    '# URL routing rules',
    '- If the user only asks to open, go to, or visit a URL, call `open_link` with that URL (embedded browser, lives in an editor tab); if you need to read or click the page, continue with `browser` action `read`/`click`. Stop after success. Do not call bash_run, Invoke-WebRequest, curl, or wget.',
    '- To read page content, use `browser` action `read` for an embedded page, or `web` action `fetch` for URL text; the terminal only when explicitly requested. Give network commands a short timeout and never wait indefinitely.',
    '- Every web access (`browser` and `web`) passes the SAME gate: the web-content permission (on by default) and allowlistWeb (empty = every host allowed). A result reading "host-luar-allowlist:<host>" is not a retryable error: do NOT retry it, do NOT switch to another web tool (they share this gate and fail identically). Name the exact host to the user and ask whether it may be added to allowlistWeb; while waiting, use an already-allowed source instead if the task allows it.',
    '- MANDATORY: when a URL goes through the shell (bash_run or the terminal), QUOTE it with double quotes, e.g. bash_run("yt-dlp \\"https://x.com/watch?v=a&list=b\\""). Unquoted, the `&` inside a URL is a shell command separator: the command is split, the first part is detached to the background, the prompt returns fast, and you will think it never ran and repeat it forever.',
  ].join('\n');
}

/*
 * The per-tool list is NOT emitted here any more.
 *
 * It sent one line per tool in the whole registry (52 of them, ~18 KB with the
 * descriptions) on every request, while the provider already receives the tool
 * SCHEMAS with their own descriptions - so the same facts were paid for twice,
 * and the copy could disagree with the schemas it was describing.
 *
 * Progressive disclosure made this worse and better at once: only 17 tools are
 * sent now, so a list of 52 names mostly advertises tools the model cannot
 * call directly. The deferred ones are found through tool_search, whose own
 * description says what it does. Nothing is lost by dropping the list.
 */

/*
 * Stacks the layers of one prose block, bottom-up.
 *
 * `bawaan` is the shipped text and acts as the floor: it is emitted only when
 * nothing above it says anything, so a fresh install is never left without an
 * identity. `persona` and `saya` are the two layers that can add to it, and
 * each is dropped when it is empty OR when it repeats text an earlier layer
 * already contributed - an exact duplicate is what produced the doubled
 * sentences this layering replaced.
 *
 * The order is deliberate: the persona speaks as "who am I", so it comes
 * first, and the Settings text as the user's standing preference, so it reads
 * as the closer instruction.
 */
function lapisan(bawaan: string, persona: string, saya: string): string[] {
  const sudah = new Set<string>();
  const keluar: string[] = [];
  for (const teks of [persona, saya, bawaan]) {
    const isi = teks.trim();
    if (!isi) continue;
    if (sudah.has(isi)) continue;
    // The floor steps aside as soon as either layer above it spoke, so the
    // shipped prose does not contradict an explicit preference.
    if (teks === bawaan && keluar.length > 0) continue;
    sudah.add(isi);
    keluar.push(isi);
  }
  return keluar;
}

/*
 * Memori lintas sesi (ai-ingat-sesi): dokumen yang dimuat sekali per giliran
 * oleh segarkanPotretKeadaan() di aiStore. Perakit prompt SINKRON, jadi ia
 * hanya membaca cache - cache kosong = string kosong, prompt tetap sah.
 */
import { blokMemoriTersimpan, BATAS_TOKEN_BAWAAN } from './aiMemori';

/* =========================================================================
 * BLOK INTI + LARANGAN PADAT + BLOK KONDISIONAL
 * item AI-TAHU-100-7 (101), 153, 162
 * ========================================================================= */

/**
 * Anggaran blok inti, dalam token perkiraan - item AI-TAHU-100-7 / 101.
 *
 * CARA HITUNG (dipakai konsisten di sini, di `scripts/cek-batas-inti.mjs`, dan
 * di `scripts/uji-blok-inti.mjs`):
 *
 *     token = Math.ceil(panjang_karakter / 4)      // perkiraan 4 karakter = 1 token
 *
 * Perkiraan kasar ini SENGAJA dipilih supaya angkanya keras dan bisa gagal
 * tanpa memasang tokenizer penuh: 2.000 token = 8.000 karakter (satuan yang
 * dipakai gate `cek-batas-inti.mjs` untuk blok generated).
 *
 * Yang dihitung sebagai blok inti = apa pun yang SELALU ikut tiap giliran:
 * fakta Zephyr yang tinggal di sini (`faktaInti()`) + larangan padat
 * (`blokLarangan()`) + kepala/label blok keadaan (`kepalaPotret()` dkk).
 * Yang ON-DEMAND tidak dihitung: potongan indeks (`suntikanIndeks`), blok
 * kondisional, dan potret keadaan - ketiganya hanya ikut saat giliran ini
 * memang membutuhkannya.
 *
 * Dinaikkan 2.000 -> 3.000 saat blok inti mulai membawa SELURUH 129 kunci
 * setelan, bukan 25 pilihan tangan. Pertukarannya disengaja dan satu arah:
 * kunci yang tidak ada di kepala model membuatnya menjawab "tidak ada setelan
 * itu" untuk setelan yang benar-benar ada - jawaban salah yang lebih mahal
 * daripada ~1.000 token konteks tambahan per giliran. Angka ini masih jauh di
 * bawah jendela model mana pun yang dipakai app, dan blok di luar blok inti
 * tetap tidak ikut hitungan.
 */
export const AMBANG_TOKEN_INTI = 3500;

/**
 * Bullet fakta yang TIDAK layak ikut tiap giliran: hanya berguna saat user
 * menyentuh topiknya, jadi ia dipotong dari blok inti dan dikirim UTUH oleh
 * kelas kondisional yang cocok begitu topiknya disebut.
 *
 * Potongannya tidak hilang dan tidak disalin: yang disimpan cuma penanda awal
 * bullet-nya, teksnya diambil apa adanya dari blok generated. Kalau penandanya
 * tidak ketemu (generator berubah bentuk), bullet itu tetap dikirim di blok inti
 * - lebih panjang, tapi tidak pernah ada fakta yang hilang tanpa suara.
 *
 * Kenapa dipotong DI SINI, bukan di `src/lib/zephyrFakta.ts`: berkas itu
 * generated oleh `scripts/gen-fakta-zephyr.mjs`, mode `--check`-nya
 * membandingkan byte penuh, dan berkas itu bukan milik lane ini.
 */
const ON_DEMAND: { penanda: string; kelas: string }[] = [
  /* Setelan provider/API key/model: kelas `model` (item 162). */
  { penanda: '- "AI Models" (Settings group', kelas: 'model' },
  /* Jalur log: kelas `galat`, yang memang blok prosedur debugging. */
  { penanda: '- Logs: %APPDATA%', kelas: 'galat' },
  /* Baris setelan LSP: kelas yang sama, karena pertanyaannya selalu "kenapa
     LSP/garis merah begini". Kalau penandanya hilang, baris tetap di blok inti. */
  { penanda: '- lsp: enabled=', kelas: 'galat' },
];

/**
 * Rentang satu bullet di dalam blok generated (`null` kalau penandanya hilang).
 *
 * Berhenti di AKHIR BARIS, bukan di bullet berikutnya: tiap bullet di blok ini
 * satu baris panjang, sedangkan di antara bullet bisa ada judul seksi (`## ...`)
 * beserta baris isinya. Memotong sampai bullet berikutnya pernah ikut
 * menghapus seluruh seksi `## Shortcuts` - tepat jenis kerusakan yang tidak
 * terlihat sampai ada pertanyaan yang tidak terjawab.
 */
function rentangBullet(penanda: string): { mulai: number; akhir: number; teks: string } | null {
  const i = FAKTA_ZEPHYR.indexOf(penanda);
  if (i < 0) return null;
  /*
   * Bullet yang dicari harus PEMILIK penanda.
   *
   * Penanda yang duduk di baris TERINDENTASI (`  - lsp: enabled=`, bagian dari
   * daftar kunci setelan) bukan bullet tingkat atas. Dulu rentangnya memanjat
   * ke bullet `- Setting keys here ...` di atasnya, jadi SELURUH daftar kunci
   * tersedot ke kelas `galat` dan blok debugging membengkak 1.000+ karakter
   * yang tidak ada urusannya. Untuk penanda seperti itu, bullet-nya adalah
   * baris itu sendiri.
   */
  const awalBaris = FAKTA_ZEPHYR.lastIndexOf('\n', i) + 1;
  const indentasi = /^[ \t]*/.exec(FAKTA_ZEPHYR.slice(awalBaris))?.[0] ?? '';
  const mulai = indentasi.length > 0 ? awalBaris - 1 : FAKTA_ZEPHYR.lastIndexOf('\n- ', i);
  const akhir = FAKTA_ZEPHYR.indexOf('\n', i + penanda.length);
  if (mulai < 0 || akhir < 0) return null;
  return { mulai, akhir, teks: FAKTA_ZEPHYR.slice(mulai + 1, akhir) };
}

/** Semua bullet on-demand yang berhasil ditemukan, urut dari yang paling belakang. */
function rentangOnDemand() {
  return ON_DEMAND.map((od) => ({ ...od, r: rentangBullet(od.penanda) }))
    .filter((x): x is { penanda: string; kelas: string; r: NonNullable<ReturnType<typeof rentangBullet>> } => x.r !== null)
    .sort((a, b) => b.r.mulai - a.r.mulai);
}

/** Bullet on-demand milik satu kelas (mis. `model`), apa adanya dari blok generated. */
export function faktaOnDemand(kelas: string): string {
  return rentangOnDemand()
    .filter((x) => x.kelas === kelas)
    .map((x) => x.r.teks)
    .join('\n');
}

/** Bullet fakta setelan model, apa adanya dari blok generated (`''` kalau penandanya hilang). */
export function faktaModelAi(): string {
  return faktaOnDemand('model');
}

/**
 * Fakta Zephyr yang SELALU ikut - blok inti lapis pertama.
 *
 * Dibangun tiap dipanggil (bukan konstanta modul): kalau blok generated
 * berubah, hasilnya ikut berubah, tanpa ada teks fakta yang disalin ke sini.
 * Kalau penandanya hilang (generator berubah bentuk), fakta dikirim UTUH -
 * lebih panjang, tapi tidak pernah ada fakta yang hilang tanpa suara.
 */
/*
 * SELURUH fakta, tanpa pemangkasan.
 *
 * Dulu fungsi ini membuang bagian yang dianggap "hanya berguna saat topiknya
 * disebut" dan menggantungnya di blok kondisional. Akibatnya nyata dan
 * dilaporkan user: ditanya soal hal yang bagiannya sedang ditahan, model
 * menjawab "tidak ada / tidak tahu" untuk sesuatu yang Zephyr benar-benar
 * punya - dan ia harus mencari dulu untuk hal yang seharusnya sudah ada di
 * kepalanya ("tau semua nya di Zephyr").
 *
 * Pemangkasan itu juga tidak lagi perlu: isinya sekarang masuk anggaran
 * (AMBANG_TOKEN_INTI, lihat A2/A3 di scripts/uji-blok-inti.mjs), dan blok
 * kondisional tetap ada untuk bahan yang memang panjang - indeks, potongan
 * tool, potret keadaan - bukan untuk menahan fakta.
 *
 * `rentangOnDemand()` tetap dipakai di tempat lain (indeks & laporan) supaya
 * penanda bagian on-demand tidak hilang dari data generated.
 */
export function faktaInti(): string {
  return FAKTA_ZEPHYR;
}

/**
 * Blok CARA KERJA + LARANGAN PADAT - item 153 + ZEPH-LARANGAN-BLOK.
 *
 * Yang diambil dari aturan lama cuma STRUKTUR penegasannya, bukan panjangnya:
 * delapan butir, satu baris satu butir, tanpa cerita sebab-akibat (sebabnya
 * sudah ada di blok `aturan`/`caraKerja`). Isinya yang paling mahal kalau
 * dilanggar: nilai karangan, klaim palsu, bahasa yang pindah sendiri, rahasia
 * yang tercetak, tool perusak/commit-push tanpa izin, keluaran karangan, dan
 * jawaban soal Zephyr dari ingatan. Butir 1 (baca dulu sebelum menebak) dan
 * butir 8 (kutip hanya keluaran tool yang benar-benar jalan; bentuk positif,
 * karena larangan "jangan mengarang output" sudah ada di blok `aturan` dan
 * mengulangnya kata-per-kata = aturan kembar) baru di ronde ini; butir 6
 * diperluas dengan commit/push.
 *
 * ANGGARAN: blok inti cuma menyisakan ~190 karakter sebelum menembus
 * AMBANG_TOKEN_INTI, jadi setiap tambahan dibayar dengan memangkas EKOR
 * penjelas butir lama (mis. "tidak ketemu = fiturnya tidak ada",
 * "dan tidak dibaca giliran ini") - bagian yang sebabnya sudah ada di
 * `caraKerja`/`aturan`. Kalimat PEMBUKA tiap butir tidak boleh dipangkas:
 * `scripts/uji-blok-kondisional.mjs` (A.7) dan `scripts/uji-blok-inti.mjs`
 * (C.4/C.8) mencocokkannya apa adanya, dan JUDUL blok wajib tetap jadi baris
 * pertama. Ukurannya dijaga `scripts/uji-larangan-live.mjs`.
 *
 * Posisinya di EKOR blok inti - paling dekat dengan jawaban - karena model
 * lebih patuh pada materi terakhir yang dibacanya (`bhs` di depan memakai
 * alasan yang sama). Bahasa Inggris dipertahankan sebagai jatuhan (harness
 * lain mencocokkan teks Inggris), versi Indonesia ditulis penuh.
 */
const LARANGAN_EN = [
  '# Hard limits',
  '1. Read before you guess: open the relevant file or setting before answering or editing.',
  '2. Never invent a value, file, setting, port or doc: not in the facts above = say so, or look it up.',
  '3. Answer in the active language of the app; the English above is SOURCE, not your answer language.',
  '4. Never claim you did, ran or fixed something you did not: a claim is not proof. Run it, read the result, then say it.',
  '5. Never print secrets (API key, token, SSH key, .env): say where the user can see them.',
  '6. Never run a destructive tool (delete, move, overwrite, force push, kill a process) or commit/push unless the user asked for it.',
  '7. Never answer a Zephyr question from memory: the facts above + `zephyr_self`.',
  '8. Any output you quote must come from a tool that actually ran this turn; if it failed, quote the error as it is.',
  '9. A backtick only exists in PAIRS, and never after Ctrl+/Alt+/Shift+: write Ctrl+J, NOT Ctrl+`. A lone backtick swallows the text after it and the answer reaches the reader cut in pieces - that is a bug you caused, not a rendering quirk.',
  '10. When a surface has an inner layer `tunjuk` cannot click (a tile of Agent Customizations, a section of Chat Settings, a row of AI Models), say which one the reader must pick; "it is open" alone is not the answer.',
  '11. Stop and ASK before work you cannot undo, or work outside the scope you were given: deleting or overwriting many files, changing product code when the task was only to inspect or verify, or adding a feature nobody asked for. One question through `ask_user`, then wait. Do the rest yourself.',
].join('\n');

const LARANGAN_ID = [
  '# Batas keras',
  '1. Baca dulu sebelum menebak: buka berkas atau setelan yang relevan sebelum menjawab atau mengedit.',
  '2. Jangan mengarang nilai, berkas, setelan, port, atau dokumen: tidak ada di fakta di atas = bilang apa adanya, atau cari dulu.',
  '3. Jangan bilang sudah menjalankan atau memperbaiki sesuatu kalau belum: klaim bukan bukti. Jalankan, baca hasilnya, baru bilang.',
  '4. Jawab dalam bahasa aktif aplikasi; teks Inggris di atas itu SUMBER, bukan bahasa jawabanmu.',
  '5. Jangan tampilkan isi rahasia (API key, token, kunci SSH, .env): sebut di mana user bisa melihatnya.',
  '6. Jangan panggil tool perusak (hapus, pindah, timpa, force push, matikan proses) atau commit/push tanpa diminta user.',
  '7. Jangan menjawab pertanyaan soal Zephyr dari ingatan: pakai fakta di atas + `zephyr_self`.',
  '8. Keluaran yang kamu kutip harus dari tool yang benar-benar jalan giliran ini; kalau gagal, kutip error-nya apa adanya.',
  '9. Backtick hanya ada BERPASANGAN, dan jangan pernah dipakai setelah Ctrl+/Alt+/Shift+: tulis Ctrl+J, BUKAN Ctrl+`. Satu backtick nyasar menelan teks sesudahnya, dan jawabanmu sampai ke pembaca dalam potongan-potongan - itu bug yang kamu bikin, bukan salah tampilan.',
  '10. Kalau sebuah permukaan punya lapisan DALAM yang tidak bisa diklik `tunjuk` (tab di Agent Customizations, bagian di Chat Settings, baris di AI Models), sebut yang mana yang harus dipilih pembaca; "sudah terbuka" saja bukan jawaban.',
  '11. Berhenti dan tanya SEBELUM kerja yang tidak bisa dibatalkan atau di luar lingkup yang diberikan: hapus/timpa banyak berkas, ubah kode produk padahal tugasnya hanya memeriksa atau memverifikasi, atau menambah fitur yang tidak diminta. Satu pertanyaan lewat `ask_user`, lalu tunggu. Sisanya kerjakan sendiri.',
].join('\n');

/** Blok larangan dalam bahasa aktif (bahasa lain jatuh ke Inggris). */
export function blokLarangan(): string {
  return kodeBahasaPrompt() === 'id' ? LARANGAN_ID : LARANGAN_EN;
}

/**
 * Blok KONDISIONAL - item 162.
 *
 * Anggaran blok inti sudah habis, jadi aturan baru TIDAK boleh ditambahkan ke
 * sana lagi. Aturan/fakta tambahan masuk ke tabel di bawah dan dipilih
 * DETERMINISTIK dari isi pesan user giliran ini: regex tetap atas kata kunci
 * (Indonesia + Inggris), bukan penilaian model dan bukan pencarian - pesan yang
 * sama selalu mendapat blok yang sama, dan blok mana yang terpilih bisa diuji
 * (`scripts/uji-blok-inti.mjs`) tanpa memanggil model.
 *
 * Blok di sini juga boleh lebih panjang dari yang pantas selalu ikut: ia hanya
 * menempel saat topiknya memang dibahas (sama seperti potongan indeks).
 */
export interface AturanKondisional {
  /** Nama kelas; dipakai harness, log, dan `kelasKondisional()`. */
  kelas: string;
  /** Pemicu: kata kunci pesan user (deterministik, tanpa `/g`). */
  cocok: RegExp;
  /** Isi blok; dibangun saat dipanggil supaya teks generated tidak pernah basi. */
  teks: (bahasa: string) => string;
}

const KONDISIONAL: AturanKondisional[] = [
  {
    kelas: 'model',
    cocok:
      /\b(models?|provider|openrouter|openai|anthropic|gemini|grok|deepseek|ollama|llama|mistral|api[-_ ]?key|kunci api|base ?url|endpoint|401|kuota|quota|context window|rag)\b/i,
    /*
     * Isinya bullet fakta yang dipotong dari blok inti (`faktaModelAi()`), apa
     * adanya dari blok generated - tidak ditulis ulang di sini, jadi tidak bisa
     * menyimpang dari fakta. Judulnya bahasa aktif supaya user tahu potongan
     * Inggris ini bahan sumber.
     */
    teks: (bahasa) =>
      `${
        bahasa === 'id'
          ? '# Fakta tambahan: provider, API key, daftar model (bahan sumber, bahasa Inggris)'
          : '# Extra facts: providers, API keys, model list (source material)'
      }\n${faktaModelAi()}`,
  },
  {
    kelas: 'tabel',
    cocok: /\b(tabel|table|kolom|bandingkan|perbandingan|compare|matriks|matrix|ceklis|checklist)\b/i,
    teks: (bahasa) =>
      bahasa === 'id'
        ? '# Aturan tambahan: bentuk jawaban\n- Perbandingan/ceklis/>3 item berkolom sama: tabel markdown (judul kolom + baris `---`), maks 6 kolom, tanpa emoji di judul, satuan di dalam sel. Satu nilai tetap kalimat.'
        : '# Extra rule: answer shape\n- A comparison/checklist/>3 items with the same fields: a markdown table (header + `---` row), max 6 columns, no emoji in headers, unit inside the cell. A single value stays a sentence.',
  },
  {
    kelas: 'jendela',
    cocok:
      /\b(jendela|window|panel|antarmuka|tampilan|tata letak|layout|sidebar|tab ?bar|tombol|dialog|popup|pintasan|shortcut|hotkey|keybind)\b/i,
    teks: (bahasa) =>
      bahasa === 'id'
        ? '# Aturan tambahan: panel & jendela\n- Panel/jendela/tata letak: sebut KUNCI setelannya (grup `panel`, `ai`, `editor`) atau pintasan bawaannya, lalu tawarkan satu langkah. Jangan pakai shell untuk membuka/menutup UI.\n- Bawaan (bisa diubah di Setelan > Shortcuts): panel bawah Ctrl+J, sidebar Ctrl+B, terminal Ctrl+`, panel AI Ctrl+Shift+A, Setelan Ctrl+,.'
        : '# Extra rule: panels & windows\n- Panel/window/layout change: name the setting key (group `panel`, `ai`, `editor`) or the default shortcut, then offer one step. Do not use the shell to open or close UI.\n- Defaults (rebindable in Settings > Shortcuts): bottom panel Ctrl+J, sidebar Ctrl+B, terminal Ctrl+`, AI panel Ctrl+Shift+A, Settings Ctrl+,.',
  },
  {
    kelas: 'galat',
    cocok: /\b(error|err|gagal|rusak|crash|hang|macet|tidak jalan|nggak jalan|log|debug|lsp|language servers?|squiggly|squiggle|diagnostics?|masalah bahasa|server bahasa)\b/i,
    teks: (bahasa) =>
      bahasa === 'id'
        ? `# Prosedur tambahan: ada yang bermasalah\n${faktaOnDemand('galat')}\n- Urutan bukti: blok keadaan di atas (GILIRAN INI) -> Problems/Output -> berkas log. Jangan menebak sebab dari nama berkas. Port 9223 = CDP WebView2 (debug), bukan MCP.\n- Satu langkah, lalu baca hasilnya. Tool yang gagal adalah HASIL: laporkan error apa adanya.\n- 88 itu paket GRAMMAR bawaan (\`PAKET_BAHASA\`, warna + squiggle sintaks, tanpa type-check); Language SERVER hanya 21 baris di \`src/lib/lsp.ts\`, masing-masing binary luar yang harus dipasang user. \`lsp.enabled=true\` cuma sakelar induk. "88 language server" SALAH: 88 grammar, 21 server.\n- Garis merah bukan bukti error compile; diagnostics kosong BUKAN berarti "bersih" - bisa berarti belum ada yang membaca berkasnya. Sebut bersih hanya kalau server benar-benar memeriksa berkas ITU (server hanya melapor untuk dokumen yang dibuka).`
        : `# Extra procedure: something is broken\n${faktaOnDemand('galat')}\n- Evidence order: state block above (THIS turn) -> Problems/Output -> the log file. Do not guess a cause from a file name. Port 9223 = CDP WebView2 debug, not MCP.\n- One step, then read the result. A failed tool is a RESULT: report the exact error.\n- The 88 are bundled GRAMMAR packages (\`PAKET_BAHASA\`, colouring + squiggles, no type-check); Language SERVERS are only 21 rows in \`src/lib/lsp.ts\`, each an external binary the user installs. \`lsp.enabled=true\` is a master switch. "88 language servers" is FALSE - 88 grammars, 21 servers.\n- A red squiggle is NOT proof of a compile error; empty diagnostics does NOT mean "clean" - it can mean nothing has read the file. Only say clean when a server really checked THIS file (servers only report on opened documents).`,
  },
  {
    kelas: 'keamanan',
    cocok:
      /\b(rahasia|secret|api[-_ ]?key|kunci api|kredensial|credential|password|sandi|passphrase|\.env|ssh key|kunci ssh)\b/i,
    teks: (bahasa) =>
      bahasa === 'id'
        ? '# Aturan tambahan: rahasia & kredensial\n- Jangan pernah mencetak nilainya; sebut di mana user bisa melihat atau mengubahnya sendiri: API key + provider ada di pop-up "AI Models", nilai setelan di halaman Setelan atau berkas global `settings.json`, kunci SSH di mesin user (bukan di dalam proyek).\n- Kredensial yang user tempel ke chat tetap rahasia: pakai, tapi jangan digaungkan kembali ke jawaban dan jangan ditulis ke berkas di dalam proyek.'
        : '# Extra rule: secrets & credentials\n- Never print the value; name where the user can see or change it: API keys + providers live in the "AI Models" pop-up, setting values in the Settings page or the global `settings.json`, SSH keys on the user machine (not inside the project).\n- A credential the user pastes into the chat is still a secret: use it, but do not echo it back and do not write it into a project file.',
  },
  {
    kelas: 'subagent',
    cocok: /\b(subagents?|sub-?agen|paralel|parallel|banyak berkas|beberapa berkas)\b/i,
    teks: (bahasa) =>
      bahasa === 'id'
        ? '# Aturan tambahan: subagent & kerja paralel\n- Memakai subagent butuh alasan: pekerjaannya memang paralel, atau panjang dan user memintanya. Pekerjaan yang diminta ke kamu diselesaikan di giliran ini, bukan diserahkan.\n- Sebelum memanggil: sebut anggarannya (`subagent.maxParallel`, `agents.maxPanes`) dan apakah anak boleh menulis berkas (`subagent.allowWrite`). Anak yang tidak boleh menulis itu peneliti, bukan pelaksana.'
        : '# Extra rule: subagents & parallel work\n- Reaching for subagents takes a reason: the work is genuinely parallel, or long and the user asked for it. Work the user asked YOU to do is done in this turn, not delegated.\n- Before spawning: name the budget (`subagent.maxParallel`, `agents.maxPanes`) and whether the child may write files (`subagent.allowWrite`). A child that cannot write is a researcher, not an implementer.',
  },
  {
    /*
     * The `apply_patch` grammar, sent ONLY when the turn is about editing files.
     *
     * It used to live in the tool's own schema, which made that one entry the
     * largest in the catalogue and pushed the per-turn spec from 8.6k to 16.4k
     * characters - paid on every turn, including the ones that never touch a
     * patch. Here it costs nothing until a turn mentions editing.
     */
    kelas: 'patch',
    cocok:
      /\b(patch|apply_patch|ubah (banyak )?berkas|edit (banyak )?berkas|multi[- ]?file|beberapa berkas|refactor|pindah(kan)? berkas|hapus berkas|buat berkas)\b/i,
    teks: (bahasa) =>
      bahasa === 'id'
        ? [
            '# Format apply_patch (bahan sumber)',
            '```',
            '*** Begin Patch',
            '*** Add File: src/baru.ts',
            '+baris pertama',
            '*** Update File: src/lama.ts',
            '@@ label konteks (nama fungsi/bagian, BUKAN nomor baris)',
            ' baris konteks tak berubah (awali satu spasi)',
            '-baris lama dihapus',
            '+baris baru penggantinya',
            '*** Delete File: src/basi.ts',
            '*** Move to: src/pindah.ts      (setelah "*** Update File:")',
            '*** End Patch',
            '```',
            '- Isi berkas baru SELALU diawali `+`; baris hunk diawali spasi/`-`/`+`.',
            '- Hunk memakai LABEL, bukan nomor baris (nomor basi begitu hunk sebelumnya mengubah berkas).',
            '- Konteks harus cocok TEPAT SATU tempat. Nol = berkas berubah, dua = ambigu; keduanya menolak SELURUH patch - itu tujuannya, jangan menambal dengan patch tebakan.',
            '- Satu patch untuk semua berkas yang saling bergantung.',
          ].join('\n')
        : [
            '# apply_patch format (source material)',
            '```',
            '*** Begin Patch',
            '*** Add File: src/new.ts',
            '+first line',
            '*** Update File: src/old.ts',
            '@@ context label (function/section name, NOT a line number)',
            ' unchanged context line (one leading space)',
            '-removed line',
            '+replacement line',
            '*** Delete File: src/stale.ts',
            '*** Move to: src/moved.ts      (after "*** Update File:")',
            '*** End Patch',
            '```',
            '- A new file starts EVERY line with `+`; hunk lines start with space/`-`/`+`.',
            '- Hunk uses a LABEL, not line numbers (numbers go stale once an earlier hunk edits the file).',
            '- Context must match EXACTLY ONCE. Zero = file changed, two = ambiguous; either refuses the WHOLE patch - that is the point, do not patch around it with a guessing patch.',
            '- One patch for all files that depend on each other.',
          ].join('\n'),
  },
  {
    /*
     * The Code Mode contract, sent ONLY when the turn looks like a long sequence.
     *
     * Same trade as `patch`: the binding list and the refusal list are a
     * paragraph, and most turns never write a script.
     */
    kelas: 'eksekusi',
    cocok:
      /\b(execute|code mode|skrip|script|banyak langkah|banyak tool|otomatis(kan)?|sekaligus|berulang|loop|batch)\b/i,
    teks: (bahasa) =>
      bahasa === 'id'
        ? [
            '# Aturan tambahan: execute (Code Mode)',
            '- Bentuk: `execute({ skrip: "..." })`, `skrip` = BADAN fungsi async; `return` menentukan hasil yang dilihat model.',
            '- Tiga binding: `call(nama, args)` menjalankan satu tool; `tools` = nama tool yang boleh dipanggil; `log(...)` catatan untuk balasan.',
            '- `window`, `document`, `fetch`, `import()`, `require`, `process`, `globalThis`, `localStorage` DITOLAK sebelum skrip jalan.',
            '- `call` lewat gate yang sama dengan tool biasa: tool yang dimatikan pembaca tetap ditolak dari skrip.',
            '- Contoh: `const a = await call("read_file", { path: "src/a.ts" }); const b = await call("grep", { pattern: "TODO", path: "src" }); return b;`',
            '- Untuk URUTAN panjang (baca banyak berkas, patch, uji). Satu langkah: panggil tool langsung.',
          ].join('\n')
        : [
            '# Extra rule: execute (Code Mode)',
            '- Shape: `execute({ skrip: "..." })`, `skrip` = BODY of an async function; `return` decides what the model sees.',
            '- Three bindings: `call(name, args)` runs one tool; `tools` = names callable now; `log(...)` notes for the reply.',
            '- `window`, `document`, `fetch`, `import()`, `require`, `process`, `globalThis`, `localStorage` are REFUSED before the script runs.',
            '- `call` goes through the same gate as a normal tool call: a disabled tool stays refused from a script.',
            '- Example: `const a = await call("read_file", { path: "src/a.ts" }); const b = await call("grep", { pattern: "TODO", path: "src" }); return b;`',
            '- For long SEQUENCES (read many files, patch, test). One step: call the tool directly.',
          ].join('\n'),
  },
];
/** Kelas kondisional yang cocok dengan pesan user giliran ini (urut, bisa lebih dari satu). */
export function kelasKondisional(kueri: string): string[] {
  const teks = (kueri || '').trim();
  if (!teks) return [];
  return KONDISIONAL.filter((a) => a.cocok.test(teks)).map((a) => a.kelas);
}

/** Blok kondisional siap sisip: `''` kalau tidak ada kelas yang cocok. */
export function blokKondisional(kueri: string): string {
  const kode = kodeBahasaPrompt();
  return KONDISIONAL.filter((a) => a.cocok.test(kueri || ''))
    .map((a) => a.teks(kode).trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Nama semua kelas kondisional yang terdaftar, urut deklarasi.
 *
 * Dipakai harness `scripts/uji-blok-inti.mjs` (memastikan tiap kelas punya
 * contoh pesan uji) dan laporan: daftar kelas dibaca dari kode, bukan dari
 * ingatan penulisnya. Kelas baru yang belum punya contoh akan membuat harness
 * GAGAL - itu memang tujuannya.
 */
export function kelasKondisionalTersedia(): string[] {
  return KONDISIONAL.map((a) => a.kelas);
}

/*
 * Peta FITUR & TATA LETAK Zephyr keadaan TERKINI — selalu ikut di setiap
 * prompt (utama + subagent). Dibuat kurasi manual, bukan generated: blok ini
 * adalah sumber kebenaran soal DI MANA setiap fitur tinggal HARI INI, termasuk
 * yang barusan dipindah/dihapus, supaya model tidak pernah menjawab dari
 * pengetahuan basi ("panel bawah ada tab Subagents" dsb.).
 */
export function petaFitur(): string {
  return [
    'ZEPHYR FEATURE & LAYOUT MAP (current — trust this over any older memory):',
    '- MAIN WINDOW: editor + bottom panel (Problems, Output, Debug Console, Terminal, Ports — the Subagents tab was REMOVED) + the AI chat panel on the right.',
    '- AI panel (main): transcript + composer. ABOVE the composer sits the turn review card with three tabs — Todo | Files | Queue (drop-up, click a tab icon to open). Files tab: Undo All / Keep All. Messages sent while the agent works are queued automatically (Queue tab). Plan-mode turns render as a "Plan" card; "View full plan" opens the plan as an editor tab.',
    '- AGENT WINDOW: sessions sidebar, center chat, right panel with tabs (Diff View, Task Summary = Todo/Context/Files, File, Browser, Plan, SubAgent). There is NO review card above this composer — the right panel tracks todos and changes automatically.',
    '- Chat timeline: work folds under "Working for Xs"; subagents appear as "SubAgent <role> · <task>" rows (click = open the detail: right panel in the Agents window, editor tab in the main window). Plan-mode turns also show an approval card (Approve = exit plan mode and start).',
    '- Composer approval menu (both windows): Plan / Manual Approval / Auto Approval / Full Access — no Custom entry. When Plan is active a "Plan" chip shows next to it.',
    '- AGENT CUSTOMIZATIONS (window) sections: Overview, Plugins, MCP Servers, Skills, Rules & Memories, Agents, Computer Use, Subagents, Hooks, Browser, Conversations, Permissions, Tools, Migrations.',
    '- CHAT SETTINGS sections: Mode, Agent, Context, Tools, Rules, Models, Appearance, Session, Advanced — the Sub-agents section was REMOVED (subagent management now lives in Agent Customizations > Subagents).',
    '- REMOVED features — never reference them: bottom-panel Subagents tab, the old "Task list" dock above the composer, the Custom approval entry, per-row Keep/Undo buttons in the review card.',
  ].join('\n');
}

export function systemPromptFor(
  answerLang: string,
  konteks = '',
  aturan = '',
  model = '',
  provider = '',
  answerStyle = '',
  /*
   * Pesan user giliran ini, APA ADANYA (belum dipangkas, belum digabung
   * lampiran). Dua blok dibangun darinya dan keduanya harus dibangun dari teks
   * yang sama supaya tidak bisa saling bertentangan:
   *   - bahasa jawaban (`instruksiBahasa`), dan
   *   - potongan indeks pengetahuan Zephyr (`suntikanIndeks`).
   *
   * Default '' membuat pemanggil lama tetap jalan: tanpa teks, bahasa jatuh ke
   * aturan berdiri "ikuti bahasa user" di blok aturan, dan blok indeks berisi
   * kepala + meta + ajakan memakai `zephyr_self` - tidak kosong, jadi model
   * tetap tahu ada indeks yang bisa dicari.
   */
  kueri = '',
): string {
  const b = bahasaPrompt();
  /*
   * The persona is the ONLY editable source of the identity and way-of-working
   * blocks. It used to be a three-way choice between the persona, an override
   * from Settings -> Prompt, and the shipped text (`per.X || ov.X || b.X`).
   *
   * The override layer is gone. It was a second place to say the same thing,
   * and because the shipped persona fills both fields it was inert on a fresh
   * install: typing there changed nothing and said nothing about it. Two
   * controls for one decision, one of them silent, is worse than one control.
   * Editing who the AI is now happens in Settings -> Persona, and nowhere else.
   *
   * The shipped text stays as the floor so a persona that leaves a field blank
   * still produces a complete prompt - never an empty block.
   *
   * The tool list and the model block are never layered either: they are always
   * built from the shipped prompt. A persona that could drop them would leave
   * the agent unable to act rather than expressing a preference.
   */
  /*
   * A custom agent picked in the composer replaces the persona block.
   *
   * It is the same contract a persona has - it says WHO is answering - so it
   * occupies the same slot rather than stacking on top of one. Stacking would
   * leave the identity section carrying two different "you are..." statements,
   * and the model would follow whichever it read last.
   *
   * An agent whose prompt is empty keeps the persona block: an empty identity
   * section is worse than the shipped one, and the editor says the field is
   * optional.
   */
  const agen = agentKustomAktif();
  const per = agen && agen.prompt.trim()
    ? { identitas: agen.prompt.trim(), caraKerja: '', aturan: '' }
    : blokPersona();
  /*
   * The user's own standing instructions, read from Settings -> Agents.
   *
   * It rides in the `saya` slot of every `lapisan` call, which is why it is a
   * LAYER and not a field: the persona speaks as "who I am" and this speaks as
   * "what I always want", so the two stack instead of one replacing the other.
   * A persona therefore cannot swallow the custom instructions, and the custom
   * instructions cannot erase the persona's identity - each is dropped only
   * when it is empty or repeats text already emitted above it.
   */
  const saya = (useStore.getState().settings.agents.customInstructions ?? '').trim();
  const bagian = [
    // Floor, then the persona when it says something the floor does not.
    ...lapisan(b.identitas, per.identitas, saya),
    b.editorFakta,
    /*
     * Zeph's knowledge of Zephyr itself, generated by
     * `scripts/gen-fakta-zephyr.mjs` into `src/lib/zephyrFakta.ts`.
     *
     * Before this block, "self knowledge" was three lines of identity, so a
     * question like "where is the pane setting" was answered from memory - and a
     * setting name that does not exist costs the user more than an honest "let me
     * check". The text is generated from Zephyr's own sources (settings.rs,
     * settingsStore.ts, shortcuts.ts, ChatSettingsPage.tsx, vite.config.ts,
     * mcp_server.rs), so it cannot drift from the build in front of the user, and
     * its last section forbids inventing names that are not in it.
     *
     * Blok inti sekarang DUA lapis dan punya anggaran keras (item
     * AI-TAHU-100-7: `AMBANG_TOKEN_INTI`, 2.000 token perkiraan = 8.000
     * karakter, lihat `scripts/uji-blok-inti.mjs` yang MENGGAGALKAN build kalau
     * lewat):
     *
     *  1. `faktaInti()`     - fakta generated yang selalu ikut, MINUS bagian
     *                         yang cuma berguna saat topiknya dibahas (setelan
     *                         model/API key: dikirim UTUH oleh kelas
     *                         kondisional `model` begitu user menyentuhnya).
     *  2. `blokLarangan()`  - larangan padat (item 153) di EKOR blok inti,
     *                         karena model paling patuh pada materi terakhir.
     *
     * Keduanya text-produk, bukan konstanta modul, jadi tidak ada teks fakta
     * yang disalin ke berkas ini dan tidak bisa basi kalau generated block
     * berubah. Blok di luar blok inti (indeks dan kondisional) TIDAK dihitung
     * anggaran: keduanya cuma ikut kalau giliran ini membutuhkannya.
     */
    faktaInti(),
    blokLarangan(),
    /* Peta fitur & tata letak terkini: sumber kebenaran soal di mana setiap
       fitur tinggal HARI INI (termasuk yang baru dipindah/dihapus). */
    petaFitur(),
    /*
     * Potongan INDEKS pengetahuan Zephyr (indeks penuh 676 KB di
     * `zephyrIndeks.ts`). Yang disuntik di sini HANYA entri yang cocok dengan
     * kata-kata pesan user giliran ini, dipilih `suntikanIndeks()` di
     * `zephyrCari.ts`.
     *
     * Inilah jalur OTOMATIS, dan itu intinya: sebelumnya satu-satunya jalan
     * mencapai indeks adalah tool `zephyr_self`, jadi fakta Zephyr sampai ke
     * jawaban HANYA kalau model kebetulan ingat memanggilnya. Pertanyaan
     * "di mana setelan panel" sering dijawab lebih dulu dari ingatan - dan nama
     * setelan karangan lebih mahal bagi user daripada satu blok konteks.
     *
     * Blok ini deterministik (kueri sama -> blok sama), dibatasi anggaran
     * karakter (`BATAS_KARAKTER_SUNTIK`), dan TIDAK PERNAH kosong: kalau tidak
     * ada entri yang cocok, kepala + meta indeks (jumlah entri, versi app, hash
     * sumber, peta kategori) tetap ikut, jadi model tahu indeks itu ada dan tahu
     * entri yang tidak ditemukan berarti fiturnya tidak ada.
     *
     * Urutannya sengaja: FAKTA_ZEPHYR memberi BENTUK Zephyr, blok ini
     * mempersempitnya ke pertanyaan giliran ini, dan blok keadaan live sesudahnya
     * tetap jadi kata terakhir soal keadaan app yang sebenarnya.
     */
    suntikanIndeks(kueri),
    /*
     * Blok KONDISIONAL (item 162): aturan/fakta tambahan yang dipilih
     * DETERMINISTIK dari isi pesan user giliran ini (`blokKondisional()` di
     * bawah - kata kunci, bukan penilaian model). Inilah jalan menambah aturan
     * baru sekarang: anggaran blok inti sudah habis, jadi aturan baru masuk ke
     * kelas di sini dan cuma menempel saat topiknya memang dibahas.
     *
     * Contoh: pesan minta tabel -> kelas `tabel` (bentuk jawaban); pesan soal
     * panel/jendela -> kelas `jendela` (kunci setelan + pintasan bawaan); pesan
     * soal model/API key -> kelas `model`, yang mengirimkan utuh bullet fakta
     * yang dipotong dari blok inti (`faktaModelAi()`).
     *
     * Kosong berarti tidak ada topik yang cocok - bukan fallback ke "serahkan
     * ke model": tidak ada kelas yang cocok memang tidak ada blok tambahan.
     */
    blokKondisional(kueri),
    /*
     * Keadaan SAAT INI, dibaca dari store yang sama dengan yang dibaca UI
     * (`zephyrRuntime.ts`): ekstensi terpasang + yang gagal dimuat beserta
     * alasannya, LSP yang jalan/terpasang, server MCP hidup di port berapa,
     * panel yang benar-benar terbuka, versi app + status update, dan nilai
     * setelan yang sedang berlaku.
     *
     * FAKTA_ZEPHYR tahu BENTUK Zephyr; blok ini tahu keadaannya. Tanpa ini
     * pertanyaan seperti "kenapa ekstensiku tidak jalan" dijawab dari tebakan -
     * sementara jawabannya sudah ada di memori proses yang sedang menjawab.
     * Dibaca tiap giliran, bukan sekali saat start: keadaan itu berubah tanpa
     * memberi tahu model.
     */
    blokKeadaanPrompt(),
    /*
     * The built-in caraKerja block carries OPERATIONAL rules, not prose style:
     * the numbered rules (plan in todo_write, one step one tool, verify, a
     * claim is not proof, spend a tool call only when it brings something new)
     * and the whole tool-routing block that says which tool is for which job.
     *
     * It used to go through lapisan(), where a persona that filled in caraKerja
     * replaced the floor entirely. The active persona "Zeph" does fill it in
     * (636 characters), so the 3568-character built-in block was being deleted
     * on every single request: no tool-thrift rule, no tool routing, no
     * one-step-one-tool. That is what turned "which folder am I in" into eight
     * tool calls and a minute of waiting.
     *
     * A persona may ADD way of working; it may not delete how the agent
     * operates. So the floor ships unconditionally and the persona layers on
     * top of it, which is the same order per.aturan already uses below.
     */
    b.caraKerja,
    ...lapisan('', per.caraKerja, saya),
    aturanRute(useStore.getState().settings.general.uiLang || 'en'),
    b.aturan,

    `${b.blokModelJudul}\n${b.blokModel(provider.trim() || 'unknown', model.trim())}`,
  ].filter(Boolean);
  /*
   * Blok bahasa dibangun dari pesan user giliran ini dan DISISIPKAN PALING
   * DEPAN, bukan ditambahkan di belakang seperti dua blok lain di bawah.
   *
   * Alasannya posisi: prompt ini panjang dan hampir seluruhnya berbahasa
   * Inggris (fakta Zephyr, indeks, potret keadaan, cara kerja, persona). Model
   * cenderung mengikuti bahasa materi yang paling akhir dan paling banyak
   * dibacanya, jadi aturan bahasa yang berdiri jauh di belakang - sebagai satu
   * butir di antara puluhan - kalah oleh beratnya materi sesudahnya. Di depan,
   * ia jadi premis yang membaca seluruh blok berikutnya sebagai sumber, bukan
   * sebagai contoh bahasa.
   *
   * `instruksiBahasa` sudah mengembalikan judul bloknya sendiri (`# Language
   * for this turn`), jadi tidak ada pembungkus `# Language` lagi di sini.
   * Kosong berarti TIDAK menebak bahasa (lihat `deteksiBahasaGiliran`): aturan
   * berdiri "ikuti bahasa yang dipakai user" di `b.aturan` yang mengambil alih.
   */
  const bhs = instruksiBahasa(answerLang, kueri);
  if (bhs) bagian.unshift(bhs);
  const gaya = instruksiGaya(answerStyle);
  if (gaya) bagian.push(gaya);

  if (aturan.trim()) bagian.push(`${b.aturanProyek}\n${aturan.trim()}`);
  if (konteks.trim()) bagian.push(`${b.konteksProyek}\n${konteks.trim()}`);

  /*
   * Memori lintas sesi: apa yang Zeph putuskan/utamakan/hasilkan di sesi
   * SEBELUMNYA - sesi baru tidak boleh mulai dari nol. Dokumen di-cache tiap
   * giliran; penyaring root penting supaya entri lapis proyek hanya muncul di
   * folder tempat ia ditulis, dan tanpa folder terbuka hanya lapis global.
   */
  const memoriSesi = blokMemoriTersimpan(BATAS_TOKEN_BAWAAN, {
    root: useStore.getState().workspace ?? null,
  });
  if (memoriSesi) bagian.push(memoriSesi);
  /*
   * "No folder is open" is a fact about the APP, not about the context text.
   *
   * This used to ride in the `else` of the context check, so it only spoke when
   * the context block was empty - which almost never happens, because the
   * context block carries the open tabs, the terminal panes and the settings
   * pointer on every turn. The rule was therefore dead code in the one state it
   * was written for: with no folder open the agent still believed a workspace
   * existed, asked for one, or reached for folder-scoped tools. Reading it off
   * the store makes the rule follow the real state.
   */
  const adaFolder = !!useStore.getState().workspace;
  if (!adaFolder && b.tanpaWorkspace) {
    bagian.push(konteks.trim() ? b.tanpaWorkspace : `${b.konteksProyek}\n${b.tanpaWorkspace}`);
  }

  /*
   * Batas tool MCP pihak ketiga (B5) disebut ke MODEL, bukan cuma ke panel.
   *
   * Kalau hanya panel yang tahu, model tetap melihat daftar yang terpotong dan
   * menjawab "server itu tidak punya tool seperti itu" - jawaban salah yang
   * terdengar benar. Satu baris di sini membuat model bisa bilang apa adanya.
   */
  const mcpDipotong = mcpTerpotong();
  if (mcpDipotong.length && b.batasMcp) {
    const ringkasMcp = mcpDipotong
      .map(
        (r) =>
          `${r.serverLabel}: ${r.dipakai}/${r.total} sent, ${r.dibuang} held back` +
          (r.contohDibuang.length ? ` (e.g. ${r.contohDibuang.join(', ')})` : ''),
      )
      .join('; ');
    bagian.push(`# External MCP tools (limit)\n${b.batasMcp(ringkasMcp)}`);
  }

  // A persona's own rules land last, after the project rules, so they read as
  // the operator's standing preference rather than a project constraint.
  if (per.aturan) bagian.push(`# Persona: ${personaAktif().nama}\n${per.aturan}`);
  return bagian.join('\n\n');
}

export function promptBawaan() {
  const b = bahasaPrompt();
  return { identitas: b.identitas, caraKerja: b.caraKerja, aturan: b.aturan };
}

/**
 * Pengingat yang ditempel di UJUNG pesan user (bukan di prompt sistem), jadi ia
 * adalah teks terakhir yang dibaca model sebelum mulai menjawab.
 *
 * `kueri` adalah pesan user giliran ini, dan bahasa jawabannya dikunci DI SINI
 * juga - bukan hanya di prompt sistem. Alasannya: blok bahasa di kepala prompt
 * sistem berjarak ribuan token dari jawaban, dan perintah di ujung pesan user
 * jauh lebih sulit "hilang" saat model menimbang bahasa. Dua tempat itu saling
 * menguatkan, dan keduanya memakai teks user yang sama persis.
 *
 * Kalau bahasanya tidak bisa ditebak (`deteksiBahasaGiliran` -> null) atau user
 * mengunci bahasa di Setelan, sufiks ini TIDAK ditambahkan: pemaksaan yang salah
 * justru jawaban yang salah.
 */
export function identityReminder(model = '', kueri = ''): string {
  const b = bahasaPrompt();
  const tetap = (useStore.getState().settings.models?.answerLang ?? '').trim();
  const det =
    tetap && tetap !== 'follow' ? { kode: tetap, nama: namaBahasa(tetap) } : deteksiBahasaGiliran(kueri);
  const sufiks = det ? `\n\nAnswer in ${det.nama} - the message above is written in it.` : '';
  return b.reminder(model.trim()) + sufiks;
}

/*
 * The rules files, in the order they are read, with a comment on WHY that file.
 *
 * Wider than the original five so a repository already using another tool's
 * convention does not need a duplicate file written for Zephyr — the whole
 * point of `AGENTS.md` being a shared convention is that it is shared.
 *
 * ORDER IS PRECEDENCE, and it is deliberate rather than alphabetical:
 *
 *   1. `AGENTS.md` first — the cross-tool convention, so it is the one a
 *      repository is most likely to maintain.
 *   2. `ZEPHYR.md` next — this editor's own name, so a repo that has both gets
 *      Zephyr's specifics applied on top.
 *   3. Then the other tools' files, so a project migrating from one of them
 *      keeps working before anyone rewrites anything.
 *
 * All matching files are CONCATENATED in this order, not first-match-wins. That
 * is the opposite of the per-tool permission rules, and for a different reason:
 * these are prose a human wrote for a repository, and silently dropping four of
 * five because the first exists would lose guidance nobody meant to discard. The
 * order still matters — a later file can contradict an earlier one, and the
 * agent reads the later one having seen the earlier, which is how precedence
 * works in prose.
 */
const FILE_ATURAN = [
  'AGENTS.md',
  'ZEPHYR.md',
  'CLAUDE.md',
  'GEMINI.md',
  'TERAX.md',
  'QWEN.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  '.rules',
  '.github/copilot-instructions.md',
  '.github/instructions.md',
];
/*
 * Memori proyek lintas-sesi, meniru `.opencode-context.md` opencode.
 *
 * Ini jawaban untuk "kenapa opencode selesai, Zephyr lupa di tengah": opencode
 * menyimpan rencana + keputusan + status ke SATU berkas di disk, jadi walau
 * percakapan dipadatkan atau sesi baru dibuka, agen tetap tahu sudah bikin apa
 * dan sisa apa. Zephyr dulu hanya mengandalkan todo dalam percakapan, yang
 * hilang saat auto-compact. Berkas ini dibaca ke dalam prompt tiap giliran
 * (kalau ada), dan agen diminta memeliharanya lewat tool `notes`/write.
 */
const FILE_KONTEKS_MEMORI = '.zephyr-context.md';
const KONTEKS_MEMORI_MAX = 6000;
const ATURAN_MAX_CHARS = 2000;
const ATURAN_TOTAL_MAX = 4000;
let cacheAturan: { at: number; teks: string } | null = null;
const ATURAN_TTL_MS = 30000;

/**
 * Baca memori proyek `.zephyr-context.md` dari akar workspace, kalau ada.
 *
 * Dikembalikan sebagai blok untuk ditempel ke prompt. Kosong kalau tak ada
 * workspace atau berkasnya belum dibuat - agen akan membuatnya saat kerja.
 */
export async function konteksMemoriProyek(): Promise<string> {
  const ws = useStore.getState().workspace;
  if (!ws) return '';
  const path = `${ws}/${FILE_KONTEKS_MEMORI}`.replace(/\\/g, '/');
  try {
    const isi = await fsRead(path, 'utf8');
    const teks = typeof isi === 'string' ? isi : ((isi as { content?: string })?.content ?? '');
    const bersih = teks.trim();
    if (!bersih) return '';
    const potong = bersih.length > KONTEKS_MEMORI_MAX
      ? `${bersih.slice(0, KONTEKS_MEMORI_MAX)}\n[... dipotong]`
      : bersih;
    return `## ${FILE_KONTEKS_MEMORI} (memori proyek lintas-sesi)\n${potong}`;
  } catch {
    return '';
  }
}

export async function aturanProyek(): Promise<string> {
  const now = Date.now();
  if (cacheAturan && now - cacheAturan.at < ATURAN_TTL_MS) return cacheAturan.teks;
  const ws = useStore.getState().workspace;
  if (!ws) return '';
  const bagian: string[] = [];
  let total = 0;
  for (const nama of FILE_ATURAN) {
    if (total >= ATURAN_TOTAL_MAX) break;
    const path = `${ws}/${nama}`.replace(/\\/g, '/');
    try {
      const isi = await fsRead(path, 'utf8');
      const teks = typeof isi === 'string' ? isi : ((isi as { content?: string })?.content ?? '');
      if (teks.trim()) {
        const potong = teks.slice(0, ATURAN_MAX_CHARS);
        bagian.push('## ' + nama + '\n' + potong);
        total += potong.length;
      }
    } catch {
    }
  }
  /*
   * File-pattern instructions ride along with the project rules, because they
   * are the same KIND of thing: standing guidance for this repository. What
   * separates them is WHEN they apply — each carries an `applyTo` glob, and only
   * the ones matching a file the reader has open are included.
   *
   * Filtering here rather than sending all of them is the whole point of the
   * feature. `instructions/` in the community corpus holds ~200 files; sending
   * every one would put Terraform conventions in front of a TypeScript task and
   * grow the prompt with material the task cannot use.
   *
   * The open tabs are the signal. They are not a perfect proxy for "what the
   * agent will touch" — a task can create a new file category — but they are the
   * only honest one available before the agent starts, and an instruction the
   * reader opened the file for is very likely the one they want.
   */
  const instruksi = await instruksiUntukTabTerbuka();
  if (instruksi) {
    const sisa = ATURAN_TOTAL_MAX - total;
    if (sisa > 0) bagian.push(instruksi.slice(0, sisa));
  }
  const hasil = bagian.join('\n\n');
  cacheAturan = { at: now, teks: hasil };
  return hasil;
}

/**
 * The instructions whose `applyTo` matches a file currently open in a tab.
 *
 * Read from the store at call time, not captured: the cache above lives 30
 * seconds and a stale set of open files would apply the wrong rules with no sign
 * anything was wrong.
 */
async function instruksiUntukTabTerbuka(): Promise<string> {
  try {
    const { useInstructions, cocokPola } = await import('./instructionsStore');
    const st = useInstructions.getState();
    if (st.daftar.length === 0) await st.muat();
    const daftar = useInstructions.getState().daftar;
    if (daftar.length === 0) return '';

    const tabs = useStore.getState().tabs;
    const jalur = tabs.map((t) => t.path).filter((p): p is string => !!p);
    if (jalur.length === 0) return '';

    /*
     * A workspace instruction of the same name shadows the global one, the same
     * rule the backend applies when listing skills — so only the first match per
     * name is kept.
     */
    const dipakai = new Set<string>();
    const blok: string[] = [];
    for (const ins of daftar) {
      const kunci = ins.name.toLowerCase();
      if (dipakai.has(kunci)) continue;
      if (!ins.apply_to.trim()) continue;
      if (!jalur.some((p) => cocokPola(ins.apply_to, p))) continue;
      dipakai.add(kunci);
      try {
        const isi = await instructionRead(ins.name);
        if (isi.trim()) {
          blok.push(`## ${ins.name} (applies to ${ins.apply_to})\n${isi.slice(0, ATURAN_MAX_CHARS)}`);
        }
      } catch {
        /* A listed instruction whose file cannot be read is skipped rather than
           failing the whole prompt build. */
      }
    }
    if (blok.length === 0) return '';
    return '# File-specific instructions (read from .zephyr/instructions)\n\n' + blok.join('\n\n');
  } catch {
    return '';
  }
}

export function resetAturanProyek() {
  cacheAturan = null;
}
