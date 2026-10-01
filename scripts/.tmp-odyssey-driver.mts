/*
 * Odyssey verification driver: proves the extension keymap validator now
 * accepts real built-in command ids, and that the default shortcuts survive.
 */
import { COMMANDS, daftarkanCommandId } from '../src/lib/commandRegistry';
import { commandIdAda, COMMAND_IDS } from '../src/lib/commandIds';
import { DEFAULT_BINDINGS, mergeBindings, chordFor } from '../src/lib/keybindings';

const hasil: string[] = [];
let gagal = 0;
function cek(nama: string, ok: boolean, info = '') {
  if (!ok) gagal++;
  hasil.push(`${ok ? 'OK  ' : 'GAGAL'} ${nama}${info ? ' :: ' + info : ''}`);
}

// commandRegistry's module body should already have published every id.
cek('COMMAND_IDS terisi dari registry', COMMAND_IDS.size >= 200, `size=${COMMAND_IDS.size}`);

const BUILTIN = [
  'workbench.openGlobalKeybindings',
  'file.saveAll',
  'workbench.action.togglePanel',
  'problemsPanel.focus',
  'outputPanel.focus',
  'debugConsolePanel.focus',
  'terminalPanel.focus',
  'editor.undo',
];
for (const id of BUILTIN) {
  cek(`commandIdAda(${id})`, commandIdAda(id));
  cek(`COMMANDS punya ${id}`, COMMANDS.some((c: { id: string }) => c.id === id));
}

// The real surface: an extension keymap replayed from disk.
const keymap = [
  { key: 'Ctrl+Shift+B', command: 'workbench.openGlobalKeybindings', source: 'ext' },
  { key: 'Ctrl+Alt+S', command: 'file.saveAll', source: 'ext' },
  { key: 'Ctrl+Alt+T', command: 'terminalPanel.focus', source: 'ext' },
  { key: 'Ctrl+Alt+U', command: 'editor.undo', source: 'ext' },
];
const merged = mergeBindings([], keymap as never);

for (const e of keymap) {
  cek(`chord ${e.key} -> ${e.command} hidup`, chordFor(merged, e.key) === e.command, chordFor(merged, e.key));
}

// A command that does not exist must still be refused (no silent false pass).
const merged2 = mergeBindings([], [
  { key: 'Ctrl+Alt+ZZ', command: 'tidak.ada.perintah', source: 'ext' },
] as never);
cek('command asing tetap ditolak', chordFor(merged2, 'Ctrl+Alt+ZZ') === null, String(chordFor(merged2, 'Ctrl+Alt+ZZ')));

// The default shortcuts must be intact: the original bug killed these.
const defaults = ['Ctrl+Shift+P', 'Ctrl+Shift+E', 'Ctrl+S', 'Ctrl+`'];
for (const d of defaults) {
  cek(`default ${d} masih hidup`, !!chordFor(merged, d), chordFor(merged, d));
}
cek('DEFAULT_BINDINGS tidak kosong', DEFAULT_BINDINGS.length > 20, `n=${DEFAULT_BINDINGS.length}`);

console.log(hasil.join('\n'));
console.log(`gagal=${gagal}`);
if (gagal > 0) process.exit(1);
