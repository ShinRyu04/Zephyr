# Referensi Tool Agen — Terax (`crynta/terax-ai`)

Ringkasan desain sistem **tool agen** milik Terax, sebagai pembanding untuk
`src/lib/zephyrTools/**` di Zephyr.

- **Sumber:** `github.com/crynta/terax-ai`, `src/modules/ai/tools/**`,
  `src/modules/ai/agents/**`
- **Lisensi:** **Apache-2.0** — boleh dipakai, dimodifikasi, bahkan untuk rilis
  tertutup, **dengan syarat atribusi** + menyertakan salinan LICENSE.
  (Bandingkan Zed = **GPL-3.0**, yang menularkan ke seluruh proyek.)
- **Status berkas ini:** dokumen saja. Tidak ada berkas `src/**` Zephyr yang
  diubah.
- **Catatan penting:** Terax adalah **kode rujukan, bukan kode untuk ditempel**.
  Strukturnya TypeScript + Vercel AI SDK v6; Zephyr memakai pola katalog sendiri
  (`catalog.ts` + `effect`) yang setara. Yang layak diambil adalah **pola dan
  kebijakan**, bukan baris kodenya.

---

## 1. Daftar tool lengkap (26 tool, 8 builder)

Semua tool dirakit lewat satu fungsi `buildTools(ctx)` yang menyebar hasil 8
builder (`tools/tools.ts`). `ChatTools = ReturnType<typeof buildTools>`.

### Builder `fs` — `tools/fs.ts` (4)

| tool | approval | keterangan |
|---|---|---|
| `read_file` | otomatis | UTF-8; jendela `offset`/`limit`; cap 2000 baris / 25 KB; menolak biner, kelewat besar, dan berkas sensitif |
| `list_directory` | otomatis | entri langsung (file + dir); entri tersembunyi dibuang |
| `write_file` | **wajib** | buat/timpa; dipakai hanya untuk berkas baru atau berkas kecil |
| `create_directory` | **wajib** | buat dir + parent yang belum ada |

Detil penting `read_file`: ada **cache baca** (`readCache`, `Map<path,{size,hash}>`).
Panggilan kedua pada berkas yang sama **tanpa perubahan** mengembalikan
`{ unchanged: true }`, bukan isi berkas lagi — menghemat konteks.

### Builder `edit` — `tools/edit.ts` (2)

| tool | approval | keterangan |
|---|---|---|
| `edit` | **wajib** | ganti satu string persis; `old_string` wajib **unik** kecuali `replace_all` |
| `multi_edit` | **wajib** | banyak penggantian ke satu berkas, **atomik** — satu gagal, seluruh batch batal sebelum tulis |

Invarian **read-before-edit**: `edit`/`multi_edit` mengembalikan error kalau
`read_file` belum pernah dipanggil pada path itu di sesi tersebut. Ini yang
mencegah sunting buta.

### Builder `search` — `tools/search.ts` (2)

| tool | approval | keterangan |
|---|---|---|
| `grep` | otomatis | regex (dialek ripgrep), menghormati `.gitignore`; hasil dibatasi `max_results` (bawaan 30, maks 500); baris panjang dipotong 160 karakter |
| `glob` | otomatis | cari berkas per pola (`**/*.ts`); sadar gitignore; sadar `root` |

Keduanya menyaring hasil lewat `isReadableSearchHit` supaya berkas rahasia
tidak bocor **hasil pencariannya** (bukan cuma isinya).

### Builder `shell` — `tools/shell.ts` (5)

| tool | approval | keterangan |
|---|---|---|
| `bash_run` | **wajib** | perintah foreground di **shell sesi persisten**; cwd bertahan antar panggilan; timeout 1–300 dtk |
| `bash_background` | **wajib** | proses panjang (dev server, watcher); mengembalikan `handle`; buffer ring 4 MB |
| `bash_logs` | otomatis | baca log proses background; `since_offset` untuk tail inkremental; melaporkan `dropped` |
| `bash_list` | otomatis | daftar proses background — **wajib dipanggil sebelum spawn** agar tidak duplikat |
| `bash_kill` | otomatis | matikan proses by handle; idempoten |

Perintah disaring `checkShellCommand` sebelum jalan.

### Builder `subagent` — `tools/subagent.ts` (1)

| tool | approval | keterangan |
|---|---|---|
| `run_subagent` | otomatis | sub-agen terisolasi: riwayat bersih + toolset terbatas; mengembalikan satu ringkasan teks |

**Tidak bisa rekursi** — `run_subagent` tidak ada di allowlist sub-agen.

### Builder `terminal` — `tools/terminal.ts` (3)

| tool | approval | keterangan |
|---|---|---|
| `suggest_command` | otomatis | usul satu perintah; dirender sebagai kartu dengan tombol **Insert** — **tidak** dijalankan otomatis |
| `get_terminal_output` | otomatis | ekor scrollback terminal aktif (bawaan 80 baris, cap 24 KB); **menolak** terminal mode Privasi |
| `open_preview` | otomatis | buka tab preview (iframe) — **hanya** loopback: `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, `*.localhost` |

### Builder `todo` — `tools/todo.ts` (1)

| tool | approval | keterangan |
|---|---|---|
| `todo_write` | otomatis | ganti seluruh daftar tugas sesi; status `pending`/`in_progress`/`completed`; divalidasi `validateTodos` |

Dipakai untuk tugas berlapis (≥3 langkah substantif). Selalu kirim **daftar
penuh**, bukan delta.

### Builder `managedAgent` — `tools/agent.ts` (3)

| tool | approval | keterangan |
|---|---|---|
| `spawn_coding_agent` | **wajib** | jalankan agen Claude Code di tab terminal baru, terikat sesi chat |
| `send_to_agent` | **wajib** | kirim instruksi lanjutan ke agen aktif; satu baris, tanpa karakter kontrol |
| `read_agent_output` | otomatis | status agen + ekor keluarannya (bawaan 120 baris, maks 400) |

Detil halus: Enter dikirim **90 ms setelah** teks, sebagai potongan terpisah —
TUI Claude Code memperlakukan CR dalam chunk yang sama sebagai baris baru
literal, bukan submit.

---

## 2. Kebijakan approval (3 tingkat)

Terax membagi tool ke tiga kelas, dan ini yang paling mudah ditiru:

| kelas | tool | perilaku |
|---|---|---|
| **auto-execute** | `read_file`, `list_directory`, `grep`, `glob`, `bash_logs`, `bash_list`, `bash_kill`, `run_subagent`, `suggest_command`, `get_terminal_output`, `open_preview`, `todo_write`, `read_agent_output` | langsung jalan; tetap lewat penjaga keamanan |
| **butuh approval** (`needsApproval: true`) | `write_file`, `edit`, `multi_edit`, `create_directory`, `bash_run`, `bash_background`, `spawn_coding_agent`, `send_to_agent` | AI SDK berhenti di `tool-call` dan memunculkan `tool-approval-request`; UI merender kartu konfirmasi |

**Plan mode** (`usePlanStore`): saat aktif, tool pemutasi **tidak** langsung
menulis. Perubahan di-`enqueue` ke antrean review dan tool mengembalikan
`{ queued_for_plan_review: true }`. User meninjau batch, baru kemudian ditulis.

---

## 3. Penjaga keamanan — `src/modules/ai/lib/security.ts`

Empat fungsi, dipakai di **jalur baca maupun tulis**:

| fungsi | tugas |
|---|---|
| `checkReadable` / `checkReadableCanonical` | tolak baca berkas rahasia |
| `checkWritableCanonical` | tolak tulis ke berkas rahasia |
| `checkShellCommand` | saring perintah shell berbahaya |

Deny-list mencakup `.env*`, `.ssh/`, kredensial, direktori keychain. Yang
penting: pemeriksaan dilakukan pada **path kanonik** (setelah `canonicalize`),
jadi symlink tidak bisa dipakai untuk kabur dari penjaga.

---

## 4. Arsitektur `ToolContext` — `tools/context.ts`

Semua tool menerima satu objek konteks. Ini yang membuat tool tetap "bodoh"
(murni I/O) sementara seluruh pengetahuan aplikasi disuntik dari luar:

```ts
export type ToolContext = {
  getCwd: () => string | null;              // cwd terminal aktif
  getWorkspaceRoot: () => string | null;    // akar explorer
  getTerminalContext: () => string | null;  // N baris terakhir terminal
  isActiveTerminalPrivate: () => boolean;   // gerbang mode Privasi
  injectIntoActivePty: (text: string) => boolean;
  openPreview: (url: string) => boolean;
  spawnAgent: (prompt: string) => {...} | null;
  readAgentOutput: (leafId: number) => string | null;
  readCache: Map<string, { size: number; hash: number }>;
  getSessionId: () => string | null;
};
```

**Resolusi path** (`resolvePath`): path absolut (POSIX `/…` atau Windows
`C:\…`) dilewatkan apa adanya; path relatif di-resolve terhadap **cwd terminal
aktif**. Kalau tidak ada cwd → **melempar error**, bukan menebak direktori.
Prinsipnya: **model tidak boleh mengarang path**.

Ditambah *live context bridge* (`setLive({ getCwd, getTerminalContext })`) yang
**lazy** — nilai dibaca saat tool dipanggil, bukan disalin di awal sesi.

---

## 5. Loop agen

Terax memakai **Vercel AI SDK v6**:

```ts
streamText({ model, tools: buildTools(ctx),
             stopWhen: stepCountIs(MAX_AGENT_STEPS) });
```

Tool didefinisikan dengan `tool({ description, inputSchema: z.object({…}),
execute, needsApproval })` — skema divalidasi **zod**, bukan JSON Schema tangan.

Perbandingan dengan Zephyr: Zephyr tidak memakai AI SDK; ia memakai katalog
sendiri (`catalog.ts` dengan `effect` + `needsApproval`) dan adapter provider
tangan untuk 3 format (OpenAI/Anthropic/Gemini). **Konsepnya setara, jalurnya
beda.**

---

## 6. Sub-agen — `agents/registry.ts`

Empat tipe tetap, semuanya **read-only**:

| tipe | label | tugas |
|---|---|---|
| `explore` | Explore | penjelajah kode: temukan berkas, telusuri referensi, rangkum arsitektur |
| `code-review` | Code review | temuan **actionable** saja, format `[MUST/SHOULD/NIT] file:line — issue → fix` |
| `security` | Security review | injeksi, bypass auth, bocor rahasia, validasi batas kepercayaan, kripto lemah |
| `general` | General research | riset multi-langkah lintas berkas |

`READ_ONLY_TOOLS = ["read_file","list_directory","grep","glob"]` — allowlist
yang dipakai keempatnya. `run_subagent` **sengaja tidak ada** di allowlist itu,
sehingga sub-agen tidak bisa memanggil sub-agen (bukan rekursi).

Setiap tipe punya **prompt sistem** yang menetapkan bentuk keluaran, mis. review
wajib menyebut `file:line` dan berhenti kalau tidak ada temuan ("Looks good.").

Perbandingan: Zephyr punya **6 peran** (`cari`, `telaah`, `rencana`, `audit`,
`kerja`, `jelajah`) dengan tambahan yang tidak dimiliki Terax — peran
**ber-PREFIX** (`@kerja`), deteksi otomatis lewat kata kunci, **rantai `->`**,
override model per tugas, peran custom buatan user, dan satu peran ber-izin
tulis (`kerja`). Terax lebih sederhana: 4 tipe, semua read-only, tanpa pipeline.

---

## 7. Edit sebagai diff

Perubahan berkas tidak langsung ditulis: tab `ai-diff` menampilkan usulan,
user menyetujui/menolak **per hunk**, baru write benar-benar dijalankan.
`multi_edit` memperkuat ini dengan atomisitas: seluruh batch dibatalkan kalau
satu `old_string` hilang atau tidak unik.

---

## 8. Ringkasan: Terax vs Zed vs Zephyr

| aspek | Zed | Terax | **Zephyr** |
|---|---|---|---|
| Bahasa tool | Rust (`tools!` macro) | TypeScript | TypeScript |
| Jumlah tool | 23 | 26 | **68** (43 builtin / 14 MCP / 11 web) |
| Lisensi | GPL-3.0 (menular) | Apache-2.0 (atribusi) | milik user |
| Kelas efek samping | `tool_permissions.rs` | `needsApproval` + `effect` implisit | **eksplisit**: `read\|net\|netWrite\|appWrite\|fsWrite\|exec` |
| Invarian read-before-edit | ada (di `edit_file`) | ada (`readCache`) | — (perlu dicek) |
| Plan/approval batch | ya | `usePlanStore` enqueue | `ai.approvalMode` |
| Sub-agen | built-in | 4 tipe read-only | **6 peran + custom + pipeline** |
| Penjaga rahasia | — | `security.ts` deny-list | `ambilWeb.ts`: allowlist host, sensor rahasia (10 pola), tolak path |

**Kesimpulan:** Zephyr **tidak perlu** mengambil kode Terax — Zephyr sudah
melampaui kedua proyek pembanding dalam jumlah tool dan kekayaan peran
sub-agen. Yang layak dicuri **hanyalah pola kecil yang murah dan terbukti**:

1. **`readCache`** — jangan kirim ulang isi berkas yang tidak berubah
   (`unchanged: true`). Penghematan konteks yang besar untuk agen.
2. **Read-before-edit invariant** — tolak `edit` kalau `read_file` belum
   dipanggil pada path itu di sesi tersebut.
3. **Atomisitas `multi_edit`** — seluruh batch batal kalau satu penggantian
   gagal, sebelum satu byte pun ditulis.
4. **`bash_list` sebelum spawn** — cegah dev server duplikat.
5. **`get_terminal_output` menolak mode Privasi** — penghormatan eksplisit
   yang bagus (Zephyr punya terminal privat; cek apakah sudah dihormati).

---

## 9. Lampiran — kutipan kode sumber Terax

> **PERINGATAN LISENSI — BACA SEBELUM MENYALIN.**
> Seluruh kutipan di lampiran ini adalah milik **crynta/terax-ai**, berlisensi
> **Apache License 2.0**. Kutipan ditampilkan **untuk rujukan desain**, bukan
> untuk ditempel ke `src/**` Zephyr.
>
> Jika kode di bawah benar-benar dimasukkan ke Zephyr, syarat Apache-2.0
> berlaku: (1) sertakan salinan `LICENSE` Apache-2.0 di repo, (2) tandai
> berkas yang memuat kode tersebut sebagai berasal dari Terax, (3) pertahankan
> pemberitahuan hak cipta. Itu berlaku walau Zephyr dirilis tertutup.
>
> Cara paling aman — dan yang dipakai untuk 8 bagian di atas — adalah mengambil
> **polanya**, lalu menulis implementasinya sendiri. Ide tidak berlisensi.

### 9.1 Daftar tool: `src/modules/ai/tools/tools.ts`

Pola `buildTools` — satu konteks, delapan builder, hasil disebar jadi satu objek:

```ts
import { buildManagedAgentTools } from "./agent";
import { buildEditTools } from "./edit";
import { buildFsTools } from "./fs";
import { buildSearchTools } from "./search";
import { buildShellTools } from "./shell";
import { buildSubagentTools } from "./subagent";
import { buildTerminalTools } from "./terminal";
import { buildTodoTools } from "./todo";

export { resolvePath, type ToolContext } from "./context";

export function buildTools(ctx: import("./context").ToolContext) {
  return {
    ...buildFsTools(ctx),
    ...buildEditTools(ctx),
    ...buildSearchTools(ctx),
    ...buildShellTools(ctx),
    ...buildSubagentTools(ctx),
    ...buildTerminalTools(ctx),
    ...buildTodoTools(ctx),
    ...buildManagedAgentTools(ctx),
  } as const;
}

export type ChatTools = ReturnType<typeof buildTools>;
```

### 9.2 `ToolContext` + `resolvePath`: `tools/context.ts`

Inti dari "tool bodoh, aplikasi pintar":

```ts
export type ToolContext = {
  getCwd: () => string | null;
  getWorkspaceRoot: () => string | null;
  getTerminalContext: () => string | null;
  isActiveTerminalPrivate: () => boolean;
  injectIntoActivePty: (text: string) => boolean;
  openPreview: (url: string) => boolean;
  spawnAgent: (prompt: string) => { tabId: number; leafId: number } | null;
  readAgentOutput: (leafId: number) => string | null;
  readCache: Map<string, { size: number; hash: number }>;
  getSessionId: () => string | null;
};

export function resolvePath(rawPath: string, cwd: string | null): string {
  if (rawPath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(rawPath)) return rawPath;
  if (!cwd)
    throw new Error(
      `cannot resolve relative path "${rawPath}": no active terminal cwd. Pass an absolute path.`,
    );
  const sep = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  return cwd.endsWith(sep) ? `${cwd}${rawPath}` : `${cwd}${sep}${rawPath}`;
}
```

### 9.3 `readCache` — jangan kirim ulang berkas yang tidak berubah: `tools/fs.ts`

**Pola paling layak diambil.** Hash `djb2` + bandingkan ukuran; panggilan kedua
pada berkas yang sama mengembalikan penanda, bukan isi:

```ts
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// ...di dalam read_file:
const hash = djb2(r.content);
const isFullRead = offset === undefined && limit === undefined;
const prior = ctx.readCache.get(abs);
if (isFullRead && prior && prior.size === r.size && prior.hash === hash) {
  return { path: abs, unchanged: true, size: r.size };
}
ctx.readCache.set(abs, { size: r.size, hash });
```

### 9.4 Invarian read-before-edit: `tools/edit.ts`

Gerbang yang menolak sunting buta — inti keamanan `edit` dan `multi_edit`:

```ts
if (!ctx.readCache.has(abs)) {
  return {
    error:
      "must call read_file on this path first (read-before-edit invariant).",
    path: abs,
  };
}
```

Dan atomisitas `multi_edit` — seluruh batch dibatalkan **sebelum** ada byte
yang ditulis, kalau satu `old_string` hilang atau tidak unik:

```ts
const first = content.indexOf(e.old_string);
if (first === -1) {
  return { error: `old_string not found: ${JSON.stringify(e.old_string.slice(0, 80))}`, path: abs };
}
const second = content.indexOf(e.old_string, first + 1);
if (second !== -1) {
  return {
    error:
      "old_string is not unique. Provide more surrounding context, or set replace_all=true.",
    path: abs,
  };
}
```

Kunci atomisitasnya: penulisan (`native.writeFile`) berada di **luar** loop
penggantian, setelah semua edit sukses:

```ts
try {
  await native.writeFile(abs, content);   // <-- hanya tercapai bila SEMUA edit sukses
  readCache.set(abs, { size: content.length, hash: djb2(content) });
  return { ok: true, replacements: totalReplacements, bytesWritten: content.length, path: abs };
} catch (err) {
  return { error: String(err), path: abs };
}
```

### 9.5 Penjaga rahasia: `lib/security.ts`

Basename rahasia (diringkas — daftar aslinya 21 pola):

```ts
const SECRET_BASENAME_PATTERNS: RegExp[] = [
  /^\.env(\..+)?(?:[.\s:]|$)/i,
  /^.*\.pem(?:[.\s:]|$)/i,
  /^.*\.key(?:[.\s:]|$)/i,
  /^.*\.p12(?:[.\s:]|$)/i,
  /^.*\.pfx(?:[.\s:]|$)/i,
  /^id_(rsa|dsa|ecdsa|ed25519)([._-].*)?(?:[.\s:]|$)/i,
  /^credentials(?:[.\s:]|$)/i,
  /^\.npmrc(?:[.\s:]|$)/i,
  /^secrets?\.(json|ya?ml|toml|env)(?:[.\s:]|$)/i,
  /^service[-_]?account.*\.json(?:[.\s:]|$)/i,
];
```

Direktori terlindungi (dipotong):

```ts
const PROTECTED_DIRS = [
  "/.ssh", "/.gnupg", "/.aws", "/.azure", "/.kube", "/.docker",
  "/.config/gh", "/.config/gcloud", "/.config/op",
  "/.git", "/.terraform.d", "/library/keychains", "/library/cookies",
  "/etc", "/proc", "/sys", "/var/db", "/var/root",
  "/appdata/roaming/microsoft/credentials",
  "/appdata/roaming/gcloud",
];
```

Pencocokan direktori memakai **segmen penuh**, bukan substring mentah — supaya
`/.sshx` tidak ikut tertangkap `/.ssh`:

```ts
function isUnderProtected(cmp: string, dir: string): boolean {
  return (cmp + "/").includes(dir + "/");
}
```

**Bentuk perbandingan** (jantung lintas-platform): backslash → slash, buang
prefix drive `C:`, buang `//?/`, buang sufiks NTFS ADS (`name:stream`), buang
titik/spasi di ujung segmen (Windows membuangnya saat membuka), lipat ganda,
lowercase. Tanpa ini, `.env.` dan `.env::$DATA` lolos dari pola berjangkar `$`.

**Symlink / TOCTOU** — cek literal, lalu canonicalize, lalu **cek ulang**:

```ts
export async function checkReadableCanonical(path, canonicalize) {
  const initial = checkReadable(path);
  if (!initial.ok) return initial;
  let canonical: string;
  try {
    canonical = await canonicalize(path);
  } catch {
    return { ok: true, canonical: path };   // belum ada — biarkan ENOENT muncul
  }
  const recheck = checkReadable(canonical);   // SELALU cek ulang
  if (!recheck.ok) return recheck;
  return { ok: true, canonical };              // pakai kanonik untuk baca → lolos TOCTOU
}
```

**`checkShellCommand`** — beberapa pola yang ditolak, semuanya sesudah user
menyetujui pun:

```ts
// C0 controls (CR/LF menyelundupkan perintah kedua lewat UI persetujuan)
if (/[\x00-\x1f]/.test(c)) return { ok: false, reason: "Refused: control characters." };
// Trojan Source: override bidi membuat urutan visual ≠ urutan eksekusi
if (/[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/.test(c))
  return { ok: false, reason: "Refused: Unicode bidirectional override." };
// rm -rf /  ·  rm -rf ~ / $HOME  ·  --no-preserve-root
// dd of=/dev/sd*  ·  mkfs/fdisk/parted  ·  fork bomb
// curl|wget ... | sh   <-- unduh dulu, periksa, baru jalankan
```

### 9.6 Sub-agen: `agents/registry.ts` + `agents/runSubagent.ts`

Allowlist read-only yang dipakai keempat tipe. `run_subagent` **sengaja tidak
ada di sini** — itulah yang mematikan rekursi:

```ts
const READ_ONLY_TOOLS = ["read_file", "list_directory", "grep", "glob"];

export const SUBAGENTS: Record<SubagentType, SubagentDef> = {
  explore:       { id: "explore",       label: "Explore",         tools: READ_ONLY_TOOLS, systemPrompt: `...` },
  "code-review": { id: "code-review", label: "Code review",     tools: READ_ONLY_TOOLS, systemPrompt: `...` },
  security:      { id: "security",      label: "Security review", tools: READ_ONLY_TOOLS, systemPrompt: `...` },
  general:       { id: "general",       label: "General research", tools: READ_ONLY_TOOLS, systemPrompt: `...` },
};
```

Penyaringan toolset di runner — hanya nama yang ada di `readOnly` yang lolos:

```ts
const readOnly: Record<string, unknown> = {
  ...buildFsTools(toolContext),
  ...buildSearchTools(toolContext),
};
const tools: Record<string, unknown> = {};
for (const t of def.tools) {
  if (t in readOnly) tools[t] = readOnly[t];
}

const result = await generateText({
  model,
  system: def.systemPrompt,
  prompt,
  tools,
  stopWhen: stepCountIs(SUBAGENT_MAX_STEPS),   // 12 langkah
});
```

### 9.7 Shell sesi persisten + kirim Enter terpisah: `tools/shell.ts`, `tools/agent.ts`

Satu shell per sesi, sehingga `cd` bertahan antar panggilan tool:

```ts
const sessionShells = new Map<string, Promise<number>>();

async function getSessionShell(sessionId: string, cwd: string | null) {
  let p = sessionShells.get(sessionId);
  if (!p) {
    p = native.shellSessionOpen(cwd);
    sessionShells.set(sessionId, p);
  }
  return p;
}
```

Dan trik menulis ke TUI agen — Enter dikirim sebagai potongan terpisah setelah
jeda, sebab CR dalam chunk yang sama dibaca sebagai baris baru literal:

```ts
const SUBMIT_DELAY_MS = 90;
// ...
if (!writeToSession(managed.leafId, oneLine)) { /* agen sudah mati */ }
setTimeout(() => writeToSession(managed.leafId, "\r"), SUBMIT_DELAY_MS);
```

### 9.8 Plan mode: enqueue, bukan tulis

Saat plan mode aktif, tool pemutasi **tidak menulis**; ia memasukkan usulan ke
antrean review dan mengembalikan penanda:

```ts
if (usePlanStore.getState().active) {
  usePlanStore.getState().enqueue({
    id: newQueuedEditId(),
    kind,                       // "edit" | "multi_edit" | "write_file" | "create_directory"
    path: abs,
    originalContent: original,
    proposedContent: content,
    isNewFile: false,
  });
  return { ok: true, replacements: totalReplacements, bytesWritten: content.length, path: abs };
}
```

### 9.9 Pencarian: `tools/search.ts` (utuh)

Dua tool pencarian. Perhatikan `resolveRoot` (akar eksplisit → akar workspace →
cwd, error kalau ketiganya kosong) dan penyaringan **hasil** pencarian lewat
`isReadableSearchHit` — bukan cuma isinya yang dijaga, tapi juga bahwa berkas
rahasia tidak muncul sebagai hit.

```ts
import { tool } from "ai";
import { z } from "zod";
import { native } from "../lib/native";
import { checkReadable, checkReadableCanonical } from "../lib/security";
import { resolvePath, type ToolContext } from "./context";

function resolveRoot(
  rawRoot: string | undefined,
  ctx: ToolContext,
): { ok: true; path: string } | { ok: false; error: string } {
  if (rawRoot && rawRoot.trim().length > 0) {
    try {
      return { ok: true, path: resolvePath(rawRoot, ctx.getCwd()) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  const ws = ctx.getWorkspaceRoot();
  if (ws) return { ok: true, path: ws };
  const cwd = ctx.getCwd();
  if (cwd) return { ok: true, path: cwd };
  return {
    ok: false,
    error: "no workspace root or active cwd; pass `root` explicitly.",
  };
}

const MAX_LINE_LEN = 160;

function clipLine(s: string): string {
  if (s.length <= MAX_LINE_LEN) return s;
  return `${s.slice(0, MAX_LINE_LEN)}…[+${s.length - MAX_LINE_LEN}]`;
}

function pathForSafety(path: string, root: string): string {
  if (path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)) return path;
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return root.endsWith(sep) ? `${root}${path}` : `${root}${sep}${path}`;
}

function isReadableSearchHit(path: string, root: string): boolean {
  return checkReadable(pathForSafety(path, root)).ok;
}

export function buildSearchTools(ctx: ToolContext) {
  return {
    grep: tool({
      description:
        "Search file contents in the workspace using a regular expression. Honors .gitignore. Returns up to `max_results` (default 30, max 500) `{path, line, text}` hits, with a `truncated` flag when more existed. Long match lines are clipped to 160 chars. Use this for code navigation — do NOT brute-force read_file across the tree. Narrow with `glob` when you can; raise `max_results` only if the first batch truly isn't enough.",
      inputSchema: z.object({
        pattern: z
          .string()
          .describe(
            "Regex pattern (Rust ripgrep dialect). Anchor and escape literal characters as needed.",
          ),
        root: z
          .string()
          .optional()
          .describe(
            "Root to search under. Defaults to workspace root, then active cwd.",
          ),
        glob: z
          .array(z.string())
          .optional()
          .describe(
            "Optional include-globs over relative paths, e.g. ['**/*.ts', 'src/**/*.tsx'].",
          ),
        case_insensitive: z.boolean().optional(),
        max_results: z.number().int().min(1).max(500).optional(),
      }),
      execute: async ({
        pattern,
        root,
        glob,
        case_insensitive,
        max_results,
      }) => {
        const r = resolveRoot(root, ctx);
        if (!r.ok) return { error: r.error };
        const safety = await checkReadableCanonical(
          r.path,
          native.canonicalize,
        );
        if (!safety.ok) return { error: safety.reason, root: r.path };
        r.path = safety.canonical;
        const cap = Math.min(max_results ?? 30, 500);
        try {
          const res = await native.grep({
            pattern,
            root: r.path,
            glob,
            caseInsensitive: case_insensitive,
            maxResults: cap,
          });
          const hits = res.hits.filter((h) =>
            isReadableSearchHit(h.path, r.path),
          );
          return {
            root: r.path,
            hits: hits.map((h) => ({
              path: h.path,
              rel: h.rel,
              line: h.line,
              text: clipLine(h.text),
            })),
            truncated: res.truncated,
            files_scanned: res.files_scanned,
          };
        } catch (e) {
          return { error: String(e), root: r.path };
        }
      },
    }),

    glob: tool({
      description:
        "Find files by path pattern (gitignore-aware). Use over `list_directory` when you want all matches recursively. Patterns use globset syntax: `**/*.ts`, `src/**/test_*.py`. Returns up to `max_results` matches.",
      inputSchema: z.object({
        pattern: z.string().describe("Glob pattern over relative paths."),
        root: z.string().optional(),
        max_results: z.number().int().min(1).max(2000).optional(),
      }),
      execute: async ({ pattern, root, max_results }) => {
        const r = resolveRoot(root, ctx);
        if (!r.ok) return { error: r.error };
        const safety = await checkReadableCanonical(
          r.path,
          native.canonicalize,
        );
        if (!safety.ok) return { error: safety.reason, root: r.path };
        r.path = safety.canonical;
        try {
          const res = await native.glob({
            pattern,
            root: r.path,
            maxResults: max_results,
          });
          return {
            root: r.path,
            hits: res.hits.filter((h) => isReadableSearchHit(h.path, r.path)),
            truncated: res.truncated,
          };
        } catch (e) {
          return { error: String(e), root: r.path };
        }
      },
    }),
  } as const;
}
```

### 9.10 Sisa `fs.ts` — `write_file` + `create_directory` (utuh)

Perhatikan: keduanya punya `needsApproval: true`, dan keduanya **memeriksa plan
mode lebih dulu** sebelum menyentuh disk.

```ts
    write_file: tool({
      description:
        "Create or overwrite a file with the given content. Always asks the user before running. Prefer `edit` / `multi_edit` for in-place changes — only use `write_file` for creating a brand-new file or fully replacing a tiny one.",
      inputSchema: z.object({
        path: z.string(),
        content: z.string(),
      }),
      needsApproval: true,
      execute: async ({ path, content }) => {
        const reqPath = resolvePath(path, ctx.getCwd());
        const safety = await checkWritableCanonical(reqPath, native.canonicalize);
        if (!safety.ok) return { error: safety.reason, path: reqPath };
        const abs = safety.canonical;

        if (usePlanStore.getState().active) {
          let original = "";
          let isNewFile = false;
          try {
            const r = await native.readFile(abs);
            if (r.kind === "text") original = r.content;
          } catch {
            isNewFile = true;
          }
          usePlanStore.getState().enqueue({
            id: newQueuedEditId(),
            kind: "write_file",
            path: abs,
            originalContent: original,
            proposedContent: content,
            isNewFile,
          });
          return {
            path: abs,
            queued_for_plan_review: true,
            ok: true,
          };
        }

        try {
          await native.writeFile(abs, content);
          ctx.readCache.set(abs, { size: content.length, hash: djb2(content) });
          return { path: abs, bytesWritten: content.length, ok: true };
        } catch (e) {
          return { error: String(e), path: abs };
        }
      },
    }),

    create_directory: tool({
      description:
        "Create a directory (and any missing parents). Always asks the user before running.",
      inputSchema: z.object({
        path: z.string(),
      }),
      needsApproval: true,
      execute: async ({ path }) => {
        const reqPath = resolvePath(path, ctx.getCwd());
        const safety = await checkWritableCanonical(reqPath, native.canonicalize);
        if (!safety.ok) return { error: safety.reason, path: reqPath };
        const abs = safety.canonical;
        if (usePlanStore.getState().active) {
          usePlanStore.getState().enqueue({
            id: newQueuedEditId(),
            kind: "create_directory",
            path: abs,
            originalContent: "",
            proposedContent: "",
            isNewFile: true,
            description: "Create directory",
          });
          return { path: abs, queued_for_plan_review: true, ok: true };
        }
        try {
          await native.createDir(abs);
          return { path: abs, ok: true };
        } catch (e) {
          return { error: String(e), path: abs };
        }
      },
    }),
```

### 9.11 Todo: `tools/todo.ts` + `lib/todos.ts` (utuh)

Tool-nya (`todo_write`) plus invarian anti-drift: **hanya satu** item boleh
`in_progress`.

```ts
// tools/todo.ts
const TodoStatus = z.enum(["pending", "in_progress", "completed"]);

export function buildTodoTools(ctx: ToolContext) {
  return {
    todo_write: tool({
      description:
        "Replace your current task list. Use this for any non-trivial multi-step task (≥3 substantive steps). Mark exactly one item `in_progress` while you work on it; flip it to `completed` and the next to `in_progress` as you go. The tool replaces the previous list — always pass the FULL list, not a delta. Auto-executes (no approval).",
      inputSchema: z.object({
        todos: z
          .array(
            z.object({
              id: z
                .string()
                .optional()
                .describe(
                  "Stable id; generated if omitted. Reuse ids across calls to keep UI stable.",
                ),
              title: z.string().min(1),
              description: z.string().optional(),
              status: TodoStatus,
            }),
          )
          .describe("The complete list of todos for this task."),
      }),
      execute: async ({ todos }) => {
        const sessionId = ctx.getSessionId();
        if (!sessionId)
          return { error: "no active session; cannot persist todos" };

        const normalized: Todo[] = todos.map((t) => ({
          id: t.id ?? newTodoId(),
          title: t.title,
          description: t.description,
          status: t.status,
        }));

        const err = validateTodos(normalized);
        if (err) return { error: err };

        useTodosStore.getState().setTodos(sessionId, normalized);

        return {
          ok: true,
          count: normalized.length,
          inProgress:
            normalized.find((t) => t.status === "in_progress")?.title ?? null,
        };
      },
    }),
  } as const;
}
```

```ts
// lib/todos.ts
export type TodoStatus = "pending" | "in_progress" | "completed";

export type Todo = {
  id: string;
  title: string;
  description?: string;
  status: TodoStatus;
};

const STORE_PATH = "terax-ai-todos.json";
const todosKey = (sessionId: string) => `todos:${sessionId}`;

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

export async function loadTodos(sessionId: string): Promise<Todo[]> {
  return (await store.get<Todo[]>(todosKey(sessionId))) ?? [];
}

export async function saveTodos(
  sessionId: string,
  todos: Todo[],
): Promise<void> {
  await store.set(todosKey(sessionId), todos);
}

export async function deleteTodos(sessionId: string): Promise<void> {
  await store.delete(todosKey(sessionId));
}

export function newTodoId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Validate a candidate todo list:
 *  - At most one item with status `in_progress` (anti-drift invariant).
 *  - Titles must be non-empty.
 * Returns null on valid, otherwise an error string.
 */
export function validateTodos(todos: Todo[]): string | null {
  let inProgress = 0;
  for (const t of todos) {
    if (!t.title.trim()) return "todo title cannot be empty";
    if (t.status === "in_progress") inProgress++;
  }
  if (inProgress > 1)
    return `only one todo may be in_progress at a time (got ${inProgress})`;
  return null;
}
```

### 9.12 Terminal: `tools/terminal.ts` (utuh)

Tiga tool. Yang penting: `get_terminal_output` **menolak** terminal mode Privasi,
dan `open_preview` **hanya** menerima loopback.

```ts
import { tool } from "ai";
import { z } from "zod";
import { checkShellCommand } from "../lib/security";
import type { ToolContext } from "./context";

export function buildTerminalTools(ctx: ToolContext) {
  return {
    suggest_command: tool({
      description:
        "Propose a single shell command. Renders a card in chat with an 'Insert' button — the command is NOT written to any terminal automatically; only the user's click inserts it at the prompt without executing. Use this when the answer IS a command.",
      inputSchema: z.object({
        command: z
          .string()
          .describe("The shell command. Single line, no trailing newline."),
        explanation: z
          .string()
          .optional()
          .describe("Optional one-line note shown beside the command."),
      }),
      execute: async ({ command, explanation }) => {
        const safety = checkShellCommand(command);
        if (!safety.ok) return { error: safety.reason };
        // Reject control bytes — the user inserts via click, but the rendered
        // command must reflect exactly what will land at the prompt.
        if (/[\n\r\x00\x1b\x07]/.test(command)) {
          return { error: "command must be a single line without control bytes" };
        }
        return { command, explanation };
      },
    }),

    get_terminal_output: tool({
      description:
        "Return the tail of the active terminal's scrollback. Use this when the user references 'this error', 'the last command', or you need to interpret recent terminal output. Default is 80 lines; raise it only when you genuinely need more. Returns an empty string if there is no active terminal; refuses if the terminal is in Privacy mode.",
      inputSchema: z.object({
        lines: z
          .number()
          .int()
          .min(1)
          .max(2000)
          .optional()
          .describe("Number of trailing lines to return. Default 80."),
      }),
      execute: async ({ lines }) => {
        if (ctx.isActiveTerminalPrivate()) {
          return {
            error:
              "active terminal is in Privacy mode; its buffer is withheld. Ask the user to switch to a regular tab if they want you to see it.",
          };
        }
        const buffer = ctx.getTerminalContext();
        if (!buffer) return { output: "", note: "no active terminal" };
        const n = lines ?? 80;
        const parts = buffer.split("\n");
        const sliced = parts.length <= n ? buffer : parts.slice(parts.length - n).join("\n");
        const MAX = 24_000;
        const capped =
          sliced.length > MAX ? `…[truncated]…\n${sliced.slice(sliced.length - MAX)}` : sliced;
        return { output: capped, lines_returned: Math.min(parts.length, n) };
      },
    }),

    open_preview: tool({
      description:
        "Open a preview tab (in-app iframe) at the given URL — restricted to localhost/loopback addresses for the local dev server. Use this after starting a dev server (e.g. `pnpm dev`, `npm run dev`) to surface the rendered page next to the terminal. To preview external sites, the user should paste the URL into the preview address bar themselves.",
      inputSchema: z.object({
        url: z
          .url()
          .describe(
            "Full URL to load (e.g. http://localhost:5173). Must include scheme. Only http/https on loopback hosts are accepted.",
          ),
      }),
      execute: async ({ url }) => {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return { error: "invalid URL", url };
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { error: "only http/https URLs are allowed", url };
        }
        const host = parsed.hostname;
        const isLocal =
          host === "localhost" ||
          host === "127.0.0.1" ||
          host === "0.0.0.0" ||
          host === "[::1]" ||
          host === "::1" ||
          host.endsWith(".localhost");
        if (!isLocal) {
          return {
            error:
              "open_preview is restricted to localhost URLs. Ask the user to paste the external URL into the preview address bar instead.",
            url,
          };
        }
        const ok = ctx.openPreview(url);
        if (!ok) return { error: "preview surface unavailable", url };
        return { url, ok: true };
      },
    }),

  } as const;
}
```

### 9.13 Pembungkus sub-agen: `tools/subagent.ts` (utuh)

Satu tool. Perhatikan ia **tidak** punya `needsApproval` — sub-agen read-only,
jadi jalan sendiri. Daftar tipe disuntik ke deskripsi dari registry.

```ts
import { tool } from "ai";
import { z } from "zod";
import { runSubagent } from "../agents/runSubagent";
import { SUBAGENTS, type SubagentType } from "../agents/registry";
import { useChatStore } from "../store/chatStore";
import type { ToolContext } from "./context";

const TYPE_KEYS = Object.keys(SUBAGENTS) as [SubagentType, ...SubagentType[]];

export function buildSubagentTools(ctx: ToolContext) {
  return {
    run_subagent: tool({
      description: `Spawn an isolated subagent with its own restricted toolset and a fresh message history. Use when you need to delegate a self-contained read-only investigation (large search, code review, security audit) without polluting your own context. The subagent returns a single text summary; pick a 'type' that matches its job.

Types:
${TYPE_KEYS.map((k) => `- ${k}: ${SUBAGENTS[k].description}`).join("\n")}

Auto-executes (no approval) — subagents are read-only by design.`,
      inputSchema: z.object({
        type: z.enum(TYPE_KEYS),
        prompt: z
          .string()
          .describe(
            "Self-contained instruction. The subagent has no memory of prior conversation — include all relevant context.",
          ),
        description: z
          .string()
          .optional()
          .describe("Short label shown in the chat UI for the spawn card."),
      }),
      execute: async ({ type, prompt, description }) => {
        const { apiKeys, selectedModelId, patchAgentMeta } =
          useChatStore.getState();
        try {
          const r = await runSubagent({
            type,
            prompt,
            keys: apiKeys,
            modelId: selectedModelId,
            toolContext: ctx,
            onStep: (label) => patchAgentMeta({ step: label }),
          });
          return {
            type,
            description,
            summary: r.summary,
            stepCount: r.stepCount,
            durationMs: r.durationMs,
          };
        } catch (e) {
          return { error: String(e), type };
        }
      },
    }),
  } as const;
}
```

### 9.14 Jembatan native: `lib/native.ts` (kutipan — bagian AI non-git)

Lapisan `invoke` Tauri. **Ini bagian terpenting untuk perbandingan dengan
Zephyr**: setiap panggilan membawa `workspace: currentWorkspaceEnv()` — jadi
backend Rust bisa menolak apa pun di luar workspace.

```ts
import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";

export type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

export const native = {
  readFile: (path: string) =>
    invoke<ReadResult>("fs_read_file", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  writeFile: (path: string, content: string) =>
    invoke<void>("fs_write_file", {
      path,
      content,
      workspace: currentWorkspaceEnv(),
    }),
  canonicalize: (path: string) =>
    invoke<string>("fs_canonicalize", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  createFile: (path: string) =>
    invoke<void>("fs_create_file", { path, workspace: currentWorkspaceEnv() }),
  createDir: (path: string) =>
    invoke<void>("fs_create_dir", { path, workspace: currentWorkspaceEnv() }),
  // AI tooling never sees dot-prefixed entries regardless of the user's
  // explorer preference — keeps .git / .env / .ssh out of agent context.
  readDir: (path: string) =>
    invoke<DirEntry[]>("fs_read_dir", {
      path,
      showHidden: false,
      workspace: currentWorkspaceEnv(),
    }),
  grep: (params: { pattern: string; root: string; glob?: string[]; caseInsensitive?: boolean; maxResults?: number }) =>
    invoke<GrepResponse>("fs_grep", {
      pattern: params.pattern,
      root: params.root,
      glob: params.glob ?? null,
      caseInsensitive: params.caseInsensitive ?? null,
      maxResults: params.maxResults ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  glob: (params: { pattern: string; root: string; maxResults?: number }) =>
    invoke<GlobResponse>("fs_glob", {
      pattern: params.pattern,
      root: params.root,
      maxResults: params.maxResults ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  shellSessionOpen: (cwd?: string | null) =>
    invoke<number>("shell_session_open", {
      cwd: cwd ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  shellSessionRun: (id: number, command: string, cwd?: string | null, timeoutSecs?: number) =>
    invoke<{ stdout: string; stderr: string; exit_code: number | null; timed_out: boolean; truncated: boolean; cwd_after: string }>(
      "shell_session_run",
      { id, command, cwd: cwd ?? null, timeoutSecs: timeoutSecs ?? null, workspace: currentWorkspaceEnv() },
    ),
  shellBgSpawn: (command: string, cwd?: string | null) =>
    invoke<number>("shell_bg_spawn", {
      command,
      cwd: cwd ?? null,
      workspace: currentWorkspaceEnv(),
    }),
  shellBgLogs: (handle: number, sinceOffset?: number) =>
    invoke<{ bytes: string; next_offset: number; dropped: number; exited: boolean; exit_code: number | null }>(
      "shell_bg_logs",
      { handle, sinceOffset: sinceOffset ?? null },
    ),
  shellBgKill: (handle: number) => invoke<void>("shell_bg_kill", { handle }),
  shellBgList: () =>
    invoke<{ handle: number; command: string; cwd: string | null; started_at_ms: number; exited: boolean; exit_code: number | null }[]>(
      "shell_bg_list",
    ),
};
```

**Nama command Rust yang dipakai tool agen** (kontrak yang harus ada di
`src-tauri`): `fs_read_file`, `fs_write_file`, `fs_canonicalize`,
`fs_create_file`, `fs_create_dir`, `fs_read_dir`, `fs_grep`, `fs_glob`,
`shell_session_open`, `shell_session_run`, `shell_session_close`,
`shell_bg_spawn`, `shell_bg_logs`, `shell_bg_kill`, `shell_bg_list`,
`workspace_current_dir`, `workspace_authorize`.

---

## 10. Atribusi

Kode dan desain di atas berasal dari **crynta/terax-ai**, dilisensikan
**Apache License 2.0**.

```
Copyright (c) crynta/terax-ai contributors
Licensed under the Apache License, Version 2.0
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

Berkas ini adalah **ringkasan desain + kutipan rujukan**, bukan salinan
berkas. Jika kelak ada bagian kode Terax yang benar-benar dimasukkan ke
`src/**` Zephyr, sertakan salinan penuh lisensi Apache-2.0 di repositori
Zephyr beserta penandaan berkas yang bersangkutan.
