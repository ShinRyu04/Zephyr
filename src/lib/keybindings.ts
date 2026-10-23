import { normalizeBinding } from './shortcuts';
import { commandsEkstensi } from './extLoader';
import { commandIdAda, daftarkanCommandId } from './commandIds';
import { perintahKeymap } from './keymapAlias';

export type Layer = 'app' | 'editor' | 'terminal' | 'stub';

export type WhenCtx = 'global' | 'editorFocus' | 'terminalFocus' | 'debugActive';

export interface KeyBinding {
  
  chord: string;
  command: string;
  when: WhenCtx;
  layer: Layer;
  
  label?: string;
  
  source?: string;
  /*
   * Commands that share this row's chord but are NOT this row's command - the
   * "chord kembar" (twin chord) partners. Filled by `mergeBindings`; the row
   * still names one command so the resolver keeps working unchanged, but the
   * other doors on the same chord stay visible here instead of being silently
   * overwritten. Empty when the chord is exclusive.
   */
  chordAlias?: string[];
}

export function normalizeChord(chord: string): string {
  return chord
    .trim()
    .split(/\s+/)
    .map((c) => normalizeBinding(c))
    .filter(Boolean)
    .join(' ');
}

export function displayChord(chord: string): string {
  return chord ? chord : '—';
}

const D = (
  chord: string,
  command: string,
  layer: Layer,
  when: WhenCtx = 'global',
  label?: string,
): KeyBinding => ({ chord: normalizeChord(chord), command, when, layer, label });

export const DEFAULT_BINDINGS: KeyBinding[] = [
  
  D('Ctrl+Shift+P', 'view.palette', 'app'),
  D('F1', 'view.palette', 'app'),
  D('Ctrl+P', 'view.quickOpen', 'app'),
  D('Ctrl+T', 'view.workspaceSymbol', 'app', 'global', 'Go to Symbol in Workspace'),
  D('Ctrl+,', 'view.settings', 'app'),
  D('Ctrl+K Ctrl+S', 'workbench.openGlobalKeybindings', 'app', 'global', 'Keyboard Shortcuts'),

  D('Ctrl+N', 'file.new', 'app'),
  D('Ctrl+O', 'file.open', 'app'),
  D('Ctrl+Shift+O', 'file.openFolder', 'app'),
  D('Ctrl+S', 'file.save', 'app'),
  D('Ctrl+Shift+S', 'file.saveAs', 'app'),
  D('Ctrl+K S', 'file.saveAll', 'app'),
  D('Ctrl+W', 'file.closeTab', 'app'),
  D('Ctrl+K Ctrl+W', 'editor.closeAll', 'app'),
  D('Ctrl+K F', 'explorer.closeFolder', 'app'),
  D('Ctrl+K P', 'file.copyPath', 'app'),
  D('Ctrl+K R', 'explorer.revealActive', 'app'),
  D('Ctrl+Shift+N', 'window.new', 'stub', 'global', 'New Window'),

  D('Ctrl+Z', 'editor.undo', 'editor', 'editorFocus'),
  D('Ctrl+Y', 'editor.redo', 'editor', 'editorFocus'),
  D('Ctrl+X', 'editor.clip.cut', 'editor', 'editorFocus'),
  D('Ctrl+C', 'editor.clip.copy', 'editor', 'editorFocus'),
  D('Ctrl+V', 'editor.clip.paste', 'editor', 'editorFocus'),
  D('Ctrl+F', 'edit.find', 'app'),
  D('Ctrl+H', 'edit.replace', 'app'),
  D('F3', 'editor.findNext', 'editor', 'editorFocus'),
  D('Shift+F3', 'editor.findPrevious', 'editor', 'editorFocus'),
  D('Ctrl+/', 'editor.comment.toggle', 'editor', 'editorFocus'),
  D('Alt+Up', 'editor.line.moveUp', 'editor', 'editorFocus'),
  D('Alt+Down', 'editor.line.moveDown', 'editor', 'editorFocus'),
  D('Ctrl+Shift+K', 'editor.line.delete', 'editor', 'editorFocus'),
  D('Ctrl+Enter', 'editor.line.insertBelow', 'editor', 'editorFocus'),
  D('Ctrl+Shift+\\', 'editor.jumpToBracket', 'editor', 'editorFocus'),
  D('Ctrl+D', 'editor.addSelectionToNextFindMatch', 'editor', 'editorFocus'),
  D('Ctrl+L', 'editor.select.line', 'editor', 'editorFocus'),
  D('Ctrl+A', 'editor.selectAll', 'editor', 'editorFocus'),
  D('Alt+Z', 'editor.wordWrap.toggle', 'app'),
  D('Shift+Alt+A', 'editor.blockComment.toggle', 'stub', 'editorFocus', 'Toggle Block Comment'),
  
  D('Shift+Alt+F', 'editor.formatDocument', 'app', 'editorFocus'),
  D('F12', 'editor.gotoDefinition', 'app', 'editorFocus'),
  D('Shift+F12', 'editor.findReferences', 'app', 'editorFocus'),
  D('F2', 'editor.renameSymbol', 'app', 'editorFocus'),
  D('Ctrl+.', 'editor.quickFix', 'app', 'editorFocus'),
  D('Ctrl+Space', 'editor.triggerSuggest', 'editor', 'editorFocus'),

  D('Ctrl+Shift+L', 'editor.select.occurrences', 'editor', 'editorFocus'),
  D('Ctrl+Alt+Up', 'editor.cursor.above', 'editor', 'editorFocus'),
  D('Ctrl+Alt+Down', 'editor.cursor.below', 'editor', 'editorFocus'),
  D('Shift+Alt+Right', 'editor.select.expand', 'stub', 'editorFocus', 'Expand Selection'),
  D('Shift+Alt+Left', 'editor.select.shrink', 'stub', 'editorFocus', 'Shrink Selection'),
  D('Shift+Alt+I', 'editor.cursor.lineEnds', 'stub', 'editorFocus', 'Add Cursor to Line Ends'),

  D('Ctrl+B', 'view.sidebar', 'app'),
  D('Ctrl+J', 'workbench.action.togglePanel', 'app'),
  D('Ctrl+`', 'terminalPanel.focus', 'app'),
  /*
   * Ctrl+Shift+T opens a new terminal pane.
   *
   * AGENTS.md records this as already decided in phase 12 ("Ctrl+Shift+T
   * sekarang = pane terminal baru (dulu Ctrl+Shift+`)"), and the verify12
   * harness has asserted Ctrl+Shift+T ever since — but this table kept the old
   * chord, so the runtime and both documents disagreed. The old chord is kept
   * as a second row (different `when` is not needed: `chordFor` returns the
   * first, and `gabungChordKembar` lists the twin) so nobody who learned
   * Ctrl+Shift+` loses it.
   */
  D('Ctrl+Shift+T', 'terminal.new', 'app'),
  D('Ctrl+Shift+`', 'terminal.new', 'app'),
  
  D('Ctrl+\\', 'view.splitEditorRight', 'app'),
  D('Ctrl+Shift+E', 'view.explorer', 'app'),
  D('Ctrl+Shift+F', 'edit.findInFiles', 'app'),
  D('Ctrl+Shift+G', 'git.panel', 'app'),
  /* Ctrl+Shift+A opens the 3-column Agents workspace. The right-column chat
     toggle that used to own this chord is reachable from Customize Layout, and
     the Agents window is the more prominent action of the two. */
  D('Ctrl+Shift+A', 'agents.openWindow', 'app', 'global', 'Open in Agents'),
  /* The AI column toggle used to advertise Ctrl+Shift+A in the Settings table
     while this router gave that chord to agents.openWindow - so the row was a
     lie and pressing it never opened the panel. Ctrl+Alt+A is free (Ctrl+Alt+O
     is the AI pop-out window) and keeps the "A = AI" mnemonic. */
  D('Ctrl+Alt+A', 'ai.panel', 'app', 'global', 'Toggle AI Panel'),
  D('Ctrl+Alt+O', 'ai.openWindow', 'app', 'global', 'Open AI Chat Window'),
  D('Ctrl+Alt+B', 'view.secondarySideBar', 'app', 'global', 'Toggle Secondary Side Bar (AI)'),
  D('Ctrl+Shift+X', 'extensions.focus', 'app'),
  D('Ctrl+=', 'view.zoomIn', 'app'),
  D('Ctrl+-', 'view.zoomOut', 'app'),
  D('Ctrl+0', 'view.zoomReset', 'app'),
  D('Ctrl+Tab', 'view.nextTab', 'app'),
  D('Ctrl+Shift+Tab', 'view.prevTab', 'app'),
  D('F11', 'window.fullscreen', 'app'),
  
  D('Ctrl+Shift+U', 'outputPanel.focus', 'app'),
  D('Ctrl+Shift+M', 'problemsPanel.focus', 'app'),
  D('Ctrl+Shift+Y', 'debugConsolePanel.focus', 'app'),
  D('Ctrl+PageDown', 'panel.nextTab', 'app'),
  D('Ctrl+PageUp', 'panel.prevTab', 'app'),
  
  D('Ctrl+G', 'editor.gotoLine', 'stub', 'editorFocus', 'Go to Line'),
  D('Ctrl+Shift+O', 'editor.gotoSymbol', 'app', 'editorFocus'),
  D('Alt+Left', 'nav.back', 'stub', 'global', 'Go Back'),
  D('Alt+Right', 'nav.forward', 'stub', 'global', 'Go Forward'),
  D('F8', 'editor.nextError', 'stub', 'global', 'Next Problem'),
  D('Shift+F8', 'editor.prevError', 'stub', 'global', 'Previous Problem'),

  D('F5', 'debug.start', 'app', 'global', 'Start Debugging'),
  D('Ctrl+F5', 'debug.runWithoutDebugging', 'app', 'global', 'Run Without Debugging'),
  D('Shift+F5', 'debug.stop', 'app', 'debugActive', 'Stop Debugging'),
  D('Ctrl+Shift+F5', 'debug.restart', 'app', 'debugActive', 'Restart Debugging'),
  D('F6', 'debug.pause', 'app', 'debugActive', 'Pause'),
  D('F10', 'debug.stepOver', 'app', 'debugActive', 'Step Over'),
  D('F11', 'debug.stepInto', 'app', 'debugActive', 'Step Into'),
  D('Shift+F11', 'debug.stepOut', 'app', 'debugActive', 'Step Out'),
  D('F9', 'debug.toggleBreakpoint', 'app', 'global', 'Toggle Breakpoint'),
  D('Shift+F9', 'debug.editBreakpoint', 'app', 'global', 'Edit Breakpoint'),
  D('Ctrl+Shift+D', 'debug.focus', 'app', 'global', 'Run & Debug'),

  D('Ctrl+Shift+C', 'terminal.copy', 'terminal', 'terminalFocus'),
  D('Ctrl+Shift+V', 'terminal.paste', 'terminal', 'terminalFocus'),
  D('Ctrl+Up', 'terminal.scrollLineUp', 'terminal', 'terminalFocus'),
  D('Ctrl+Down', 'terminal.scrollLineDown', 'terminal', 'terminalFocus'),

  D('Ctrl+Shift+B', 'run.file', 'app', 'editorFocus', 'Run Current File'),

  D('Ctrl+K Ctrl+I', 'help.about', 'app', 'global', 'About Zephyr'),
];

/*
 * The default bindings above name commands the editor owns directly
 * (`editor.line.moveUp`, `editor.line.delete`, `editor.clip.cut`, ...). Those
 * live in the editor layer, not in the command registry, so `commandIdAda()`
 * said "no such command" for them - and an extension keymap binding one of them
 * was dropped as a typo. Publishing them into the same id set the validator
 * reads makes the check agree with what the app can actually run.
 *
 * `stub` entries are excluded on purpose: they carry a label in the shortcuts
 * table but have no implementation, so a pack binding one would still be inert.
 */
for (const b of DEFAULT_BINDINGS) {
  if (b.layer !== 'stub') daftarkanCommandId(b.command);
}

export interface UserBinding {
  key: string;
  command: string;
  when?: WhenCtx;
  
  remove?: boolean;
}

export function mergeBindings(
  user: UserBinding[],
  ext: Array<{ key: string; command: string; source: string }> = [],
): KeyBinding[] {
  const out = DEFAULT_BINDINGS.map((b) => ({ ...b }));

  /*
   * An extension keymap may only bind a chord to a command that EXISTS.
   *
   * An extension command is contributed at runtime by the extension's own
   * JavaScript, so a typo or a command that failed to register produced a
   * binding that looked fine in the UI, swallowed the chord, and then did
   * nothing when pressed: `runCommand` found no handler and the keystroke
   * died silently. Such bindings are dropped here, and the chord falls back
   * to whatever it meant before.
   */
  /*
   * The source of truth is the COMMAND REGISTRY, not `ACTIONS` and not
   * DEFAULT_BINDINGS.
   *
   * `ACTIONS` (shortcuts.ts) only holds the ~34 Settings shortcut actions;
   * `COMMAND_IDS` (commandIds.ts) is the id set of the canonical command
   * registry in commandRegistry.ts. Testing real built-ins such as
   * `workbench.openGlobalKeybindings`, `file.saveAll`,
   * `workbench.action.togglePanel`, `problemsPanel.focus`, `outputPanel.focus`,
   * `debugConsolePanel.focus`, `terminalPanel.focus` or `editor.undo` against
   * ACTIONS alone rejected them, so an extension that bound one of them lost
   * the binding silently.
   *
   * `commandIds.ts` is a dependency-free leaf module. Importing
   * commandRegistry.ts here would close the cycle
   * keybindings.ts -> commandRegistry.ts -> keybindingStore.ts ->
   * keybindings.ts, which is what used to kill the default shortcuts, so the id
   * set is imported instead.
   */
  const adaCommand = (command: string) =>
      commandIdAda(command) || commandsEkstensi().some((c) => c.id === command);

    for (const e of ext) {
      const chord = normalizeChord(e.key ?? '');
      /*
       * VS Code-shaped names (`workbench.action.quickOpen`) are translated to the
       * Zephyr id before validation; a name with no counterpart stays untouched
       * and is dropped below with the reason already recorded by the loader.
       */
      const cmd = perintahKeymap(e.command ?? '');
      if (!chord || !cmd) continue;
      if (!adaCommand(cmd)) continue;

      /*
       * Satu perintah boleh punya BANYAK chord - dan tidak ada baris bawaan yang
       * boleh hilang.
       *
       * Versi lama memaksa satu baris per perintah: ia mencari baris PERTAMA
       * milik perintah ini lalu MENGGANTI chord-nya
       * (`out[idx] = { ...out[idx], chord }`). Akibatnya (a) chord bawaan
       * perintah itu - Ctrl+S, Ctrl+P, Ctrl+B, Ctrl+W, Ctrl+Tab - terhapus saat
       * paket keymap memberi perintah yang sama chord kedua, dan (b) chord yang
       * tadi ditulis hilang lagi saat paket berikutnya menyentuh perintah yang
       * sama, sehingga 11 chord paket dilaporkan DITOLAK oleh uji live.
       *
       * Aturannya sekarang:
       *   - baris (chord, perintah) yang sudah ada dilewati, tidak ditulis ganda;
       *   - chord yang sedang dipegang baris lain TIDAK dikosongkan: baris baru
       *     disisipkan DI DEPAN baris itu, jadi paket keymap tetap mengambil alih
       *     chord tersebut secara eksplisit (resolver membaca yang pertama),
       *     sementara baris bawaan tetap ada di tabel - terlihat di Settings dan
       *     tidak pernah hilang;
       *   - prioritas paket tetap urutan pemrosesan: paket yang memproses duluan
       *     memegang baris paling depan.
       */
      if (out.some((b) => b.chord === chord && b.command === cmd)) continue;

      const pemakai = out.filter((b) => b.chord === chord);
      const bawaan = pemakai[0];
      /*
       * `when`/`layer` diwarisi dari baris yang diambil alih (kalau ada) supaya
       * chord tetap menyala di konteks yang sama seperti sebelumnya; kalau tidak,
       * dari baris perintah ini yang sudah ada; terakhir 'global'/'app' seperti
       * dulu.
       */
      const sumber = out.find((b) => b.command === cmd && b.chord) ?? bawaan;
      const baris: KeyBinding = {
        chord,
        command: cmd,
        when: sumber?.when ?? 'global',
        layer: sumber?.layer ?? 'app',
        source: e.source,
      };
      const idx = bawaan ? out.indexOf(bawaan) : -1;
      if (idx >= 0) out.splice(idx, 0, baris);
      else out.push(baris);
    }
  
  const bersih = out.filter((b) => b.chord !== '');
  out.length = 0;
  out.push(...bersih);

  for (const u of user) {
    if (!u || !u.command) continue;
    const idx = out.findIndex((b) => b.command === u.command);
    if (u.remove) {
      if (idx >= 0) out.splice(idx, 1);
      continue;
    }
    const chord = normalizeChord(u.key ?? '');
    if (!chord) continue;
    
    for (const b of out) {
      if (b.command === u.command && b.chord === chord && b !== out[idx]) b.chord = '';
    }
    const lama = out.filter((b) => b.command === u.command && b !== out[idx] && b.chord);
    for (const l of lama) l.chord = '';
    if (idx >= 0) {
      
      out[idx] = { ...out[idx], chord, when: u.when ?? out[idx].when, source: undefined };
    } else {
      
      out.push({ chord, command: u.command, when: u.when ?? 'global', layer: 'app' });
    }
  }
  
  const akhir = out.filter((b) => b.chord !== '');
  out.length = 0;
  out.push(...akhir);

  /*
   * Chord kembar (ZEPH-KEYMAP-MERGE-SATU-CHORD): dua baris atau lebih yang
   * memakai SATU chord yang sama.
   *
   * Sampai di sini satu chord bisa dipegang beberapa perintah sekaligus - bawaan
   * pun sudah begitu (`Ctrl+Shift+O` = file.openFolder + editor.gotoSymbol,
   * `F11` = window.fullscreen + debug.stepInto) dan paket keymap menambah lagi
   * (emacs memberi `Ctrl+S` ke edit.find sementara file.save masih memegangnya).
   * Baris-baris itu TIDAK dihapus di sini: menghapusnya akan mengurangi
   * kemampuan (resolver memang butuh baris per `when` supaya chord tetap hidup
   * di konteks yang benar). Yang dilakukan: setiap baris diberi daftar
   * `chordAlias` - nama-nama lain yang menempati chord itu - sehingga tidak ada
   * pintasan yang "hilang" tanpa jejak, dan tabel kanonik satu-entri-per-chord
   * (`tabelEfektif`) bisa dibangun dari data yang sama.
   */
  const pemegangChord = new Map<string, string[]>();
  for (const b of out) {
    if (!b.chord) continue;
    const l = pemegangChord.get(b.chord) ?? [];
    l.push(b.command);
    pemegangChord.set(b.chord, l);
  }
  for (const b of out) {
    if (!b.chord) continue;
    b.chordAlias = (pemegangChord.get(b.chord) ?? []).filter((c) => c !== b.command);
  }

  return out;
}

export function chordFor(command: string, bindings: KeyBinding[]): string {
  return bindings.find((b) => b.command === command)?.chord ?? '';
}

export function prefixSet(bindings: KeyBinding[]): Set<string> {
  const s = new Set<string>();
  for (const b of bindings) {
    const parts = b.chord.split(' ');
    for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join(' '));
  }
  return s;
}

export function resolveBinding(
  sequence: string,
  bindings: KeyBinding[],
  ctx: Set<WhenCtx>,
): KeyBinding | null {
  const cocok = bindings.filter((b) => b.chord === sequence);
  if (cocok.length === 0) return null;
  const spesifik = cocok.filter((b) => b.when !== 'global' && ctx.has(b.when));
  if (spesifik.length > 0) return spesifik[0];
  const global = cocok.find((b) => b.when === 'global');
  return global ?? null;
}

export function chordConflicts(
  command: string,
  chord: string,
  when: WhenCtx,
  bindings: KeyBinding[],
): string[] {
  const c = normalizeChord(chord);
  if (!c) return [];
  /*
   * Dibaca dari tabel kanonik (satu entri per chord), bukan dari baris mentah:
   * dengan begitu perintah kembar yang menempel di chord itu ikut terlihat
   * walau urutannya berubah. Hasilnya sama dengan versi baris-langsung untuk
   * data yang sama - ini jalur yang sama, hanya lewat bentuk gabungan.
   */
  const e = entriChord(c, bindings);
  if (!e) return [];
  return e.alias.filter((a) => a.command !== command && a.when === when).map((a) => a.command);
}

/* ───────────── ZEPH-KEYMAP-MERGE-SATU-CHORD: gabung + alias ─────────────── */

/*
 * Dua pintasan atau lebih yang memakai SATU chord yang sama digabung menjadi
 * SATU entri; nama lama tiap pintasan tetap ada sebagai alias sehingga tidak ada
 * jalan masuk yang hilang.
 *
 * Kenapa TIDAK boleh sekadar dihapus / ditulis ulang: sebuah chord bisa hidup di
 * lebih dari satu konteks. `Ctrl+Shift+O` adalah `file.openFolder` secara global
 * DAN `editor.gotoSymbol` saat fokus ada di editor; `F11` adalah
 * `window.fullscreen` global yang berubah menjadi `debug.stepInto` saat debug
 * aktif. Kalau salah satunya dibuang, pintasan itu mati di konteks asalnya -
 * kemampuan berkurang. Karena itu penggabungan di sini bersifat MENAMBAH:
 * satu baris tetap satu (perintah, when), tetapi entri chord menyimpan SEMUA
 * nama yang bisa dicapai lewat chord tersebut.
 *
 * Dua jenis kembar, dan bedanya penting:
 *
 *   - KEMBAR DAMAI - tiap baris punya `when` berbeda. Semuanya tetap tercapai,
 *     resolver sudah memilih yang sesuai konteks. Digabung tanpa catatan.
 *   - KEMBAR BENTROK - dua baris dengan `when` SAMA. `resolveBinding` hanya
 *     pernah mengembalikan yang PERTAMA, jadi yang kedua tertutup dan tidak akan
 *     pernah jalan selama konteksnya sama. Ini dilaporkan sebagai temuan
 *     (`ChordEntry.konflik`), bukan didiamkan dan bukan dihapus: menghapus akan
 *     menyembunyikan bahwa satu aksi kini tak bisa dijangkau.
 */

export interface ChordAlias {
  /** Id perintah yang menempati chord ini (nama pintasan). */
  command: string;
  when: WhenCtx;
  layer: Layer;
  label?: string;
  source?: string;
  /** Perintah yang dipilih `resolveBinding` di konteks global. */
  utama: boolean;
  /** Tertutup oleh baris lain dengan `when` sama -> tidak pernah jalan. */
  tertutup: boolean;
}

export interface ChordEntry {
  chord: string;
  /** Perintah yang dijalankan resolver di konteks global. */
  utama: string;
  /** SEMUA nama lama yang tetap bisa dicari di chord ini; utama lebih dulu. */
  alias: ChordAlias[];
  /** Alias yang kalah di `when` yang sama - temuan yang dilaporkan. */
  konflik: ChordAlias[];
}

export interface LaporanChordKembar {
  /** Jumlah baris efektif (satu per (chord, perintah)) yang dibaca. */
  baris: number;
  /** Jumlah chord unik = panjang tabel efektif. */
  chord: number;
  /** Chord yang dipegang lebih dari satu nama, dengan angka nyatanya. */
  kembar: Array<{ chord: string; jumlah: number; utama: string; alias: string[]; konflik: string[] }>;
  jumlahKembar: number;
  /** Total jalan masuk nama di seluruh tabel - tidak boleh turun. */
  jumlahAlias: number;
  jumlahKonflik: number;
}

export interface HasilGabung {
  tabel: ChordEntry[];
  laporan: LaporanChordKembar;
}

/**
 * Gabungkan chord kembar menjadi satu entri per chord, sekaligus bikin laporan
 * angkanya. Deterministik: urutan chord mengikuti kemunculan pertama di
 * `bindings` dan urutan alias menaruh pemenang resolver lebih dulu, jadi dua
 * kali bangun dari masukan yang sama menghasilkan keluaran yang sama.
 */
export function gabungChordKembar(bindings: KeyBinding[]): HasilGabung {
  const grup = new Map<string, ChordEntry>();
  for (const b of bindings) {
    const chord = normalizeChord(b.chord ?? '');
    if (!chord) continue;
    let e = grup.get(chord);
    if (!e) {
      e = { chord, utama: '', alias: [], konflik: [] };
      grup.set(chord, e);
    }
    const a: ChordAlias = {
      command: b.command,
      when: b.when,
      layer: b.layer,
      label: b.label,
      source: b.source,
      utama: false,
      /* `when` sama dengan baris SEBELUMNYA -> resolver cuma sampai yang pertama */
      tertutup: e.alias.some((x) => x.when === b.when),
    };
    e.alias.push(a);
    if (!e.utama && b.when === 'global') e.utama = b.command;
    if (a.tertutup) e.konflik.push(a);
  }
  const tabel: ChordEntry[] = [];
  for (const e of grup.values()) {
    if (!e.utama) e.utama = e.alias[0]?.command ?? '';
    e.alias.sort((x, y) => Number(y.utama) - Number(x.utama));
    const u = e.alias.find((x) => x.command === e.utama);
    if (u) u.utama = true;
    tabel.push(e);
  }
  const kembar = tabel
    .filter((e) => e.alias.length > 1)
    .map((e) => ({
      chord: e.chord,
      jumlah: e.alias.length,
      utama: e.utama,
      alias: e.alias.map((a) => a.command),
      konflik: e.konflik.map((a) => a.command),
    }));
  const laporan: LaporanChordKembar = {
    baris: tabel.reduce((n, e) => n + e.alias.length, 0),
    chord: tabel.length,
    kembar,
    jumlahKembar: kembar.length,
    jumlahAlias: tabel.reduce((n, e) => n + e.alias.length, 0),
    jumlahKonflik: tabel.reduce((n, e) => n + e.konflik.length, 0),
  };
  return { tabel, laporan };
}

/** Tabel efektif: SATU entri per chord, tiap nama lama masih di dalamnya. */
export function tabelEfektif(bindings: KeyBinding[]): ChordEntry[] {
  return gabungChordKembar(bindings).tabel;
}

/** Entri chord tertentu (chord sudah/belum dinormalkan), atau null. */
export function entriChord(chord: string, bindings: KeyBinding[]): ChordEntry | null {
  const c = normalizeChord(chord);
  if (!c) return null;
  return tabelEfektif(bindings).find((e) => e.chord === c) ?? null;
}

/**
 * Cari pintasan lewat NAMA LAMA atau chord-nya.
 *
 * Ini gerbang "tidak ada pintasan yang hilang": tiap nama yang pernah ada
 * sebagai pintasan harus tetap ketemu sesudah digabung. Nama persis menang;
 * kalau tidak ada, pencarian longgar atas id/label/chord.
 */
export function cariPintasan(nama: string, bindings: KeyBinding[]): ChordEntry | null {
  const q = (nama ?? '').trim().toLowerCase();
  if (!q) return null;
  const tabel = tabelEfektif(bindings);
  const persis =
    tabel.find((e) => e.chord.toLowerCase() === q) ??
    tabel.find((e) => e.alias.some((a) => a.command.toLowerCase() === q));
  if (persis) return persis;
  return (
    tabel.find(
      (e) =>
        e.chord.toLowerCase().includes(q) ||
        e.alias.some(
          (a) => a.command.toLowerCase().includes(q) || (a.label ?? '').toLowerCase().includes(q),
        ),
    ) ?? null
  );
}

/**
 * Selesaikan satu entri gabungan ke perintah yang harus jalan di `ctx`.
 *
 * Semantiknya sama persis dengan `resolveBinding`: baris non-global yang
 * konteksnya menyala menang, kalau tidak ada baris global yang dipakai. Jadi
 * penggabungan tidak mengubah chord mana yang memicu apa - ia hanya membuat
 * pintasan kembar terlihat dan bisa dicari.
 */
export function resolveChord(entry: ChordEntry, ctx: Set<WhenCtx>): string | null {
  if (!entry) return null;
  const spesifik = entry.alias.filter((a) => a.when !== 'global' && ctx.has(a.when));
  if (spesifik.length > 0) return spesifik[0].command;
  const g = entry.alias.find((a) => a.when === 'global');
  return g?.command ?? null;
}
