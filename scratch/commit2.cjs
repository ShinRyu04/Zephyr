const { execFileSync } = require('child_process');
const fs = require('fs');
const GIT = 'C:\\Program Files\\Git\\cmd\\git.exe';
const g = (a) => execFileSync(GIT, a, { encoding: 'utf8', maxBuffer: 67108864, cwd: 'D:\\Zephyr' });

const files = [
  'src/components/ai/ChatMessage.tsx',
  'src/lib/aiStore.ts',
  'src/lib/commands.ts',
  'src/lib/labelAksi.ts',
  'src/lib/notifikasiAi.ts',
  'src/lib/systemPrompt.ts',
  'src/lib/terminalStore.ts',
  'src/lib/zephyrTools/builtins.ts',
  'src/lib/zephyrTools/catalog.ts',
  'src/lib/zephyrTools/deskripsiTool.ts',
  'src/lib/autoFix.ts',
  'src/lib/bunyiNotif.ts',
  'src/lib/reviewUbah.ts',
  'src/lib/terminalAgent.ts',
  'src-tauri/src/lint_fix.rs',
];

g(['add', '--'].concat(files));

const msg = [
  'feat(conversation): sambungkan 6 setelan ke perilaku nyata',
  '',
  'Setiap kontrol di Conversation sekarang punya jalur kode, bukan nilai tersimpan:',
  '',
  'To-Do List / Agent Questioning',
  '- tool `ask_user` BARU: agent berhenti dan menunggu jawaban, bukan menebak.',
  '  Ini yang membuat switch "Agent Questioning Proactively" punya arti.',
  '- `todo_write` dan `ask_user` menolak dengan kalimat yang bisa ditindaklanjuti',
  '  saat switch-nya mati, dan spec-nya dicabut dari wire supaya model tidak',
  '  membuang satu langkah mencoba tool yang dimatikan.',
  '',
  'Auto Fix Lints',
  '- `autoFix.ts` menjalankan fixer proyek pada berkas yang benar-benar diubah',
  '  satu giliran, memakai daftar berkas dari checkpoint (bukan filter nama tool).',
  '- `lint_fix.rs` diperbaiki: manifest dicari NAIK dari berkas (crate di',
  '  src-tauri/ akhirnya ketemu), fixer dijalankan di folder manifest, dan',
  '  "berubah" hanya dilaporkan kalau BYTE berkas benar-benar berubah.',
  '- Windows: `npx` adalah `npx.cmd`; `Command::new("npx")` tidak pernah',
  '  menemukannya, dan `cmd /c` butuh satu string dengan kutip luar. Dua bug ini',
  '  membuat SEMUA fixer JS gagal sementara tesnya hijau.',
  '',
  'Code Review',
  '- `reviewScope` menentukan apakah sebuah giliran menyimpan checkpoint',
  '  (none) dan apakah checkpoint lama dipensiunkan (latest).',
  '- `reviewJump` memindahkan editor ke berkas berikutnya setelah keep/undo.',
  '',
  'Terminal Tool Preferences',
  '- `terminalEnv` memilih pipa `agent_exec` atau shell pane yang terlihat,',
  '  lewat `useTerminal.jalankanDiTerminal` dengan penanda selesai.',
  '- `terminalAutoOpen` menentukan kapan pane itu dinaikkan.',
  '',
  'Task Status Notification',
  '- Banner, Sound, Volume, dan tiga nada per hasil benar-benar dipakai:',
  '  `bunyiNotif.ts` menyintesis nada (chime/bell berbeda bentuk, bukan nama',
  '  lain untuk nada yang sama), volume masuk ke gain, "None" membungkam.',
  '- Nada "menunggu" berbunyi saat run PARKIR di pertanyaan, bukan saat keluar.',
  '',
  'Verifikasi: tsc 0 error; 14 tes Rust lulus; fixer nyata mengubah berkas di',
  'disk dan melaporkannya; 9 saklar + 6 dropdown menulis ke settings.json.',
].join('\n');

try {
  g(['commit', '-q', '-m', msg]);
} catch (e) {
  fs.writeFileSync('D:\\Zephyr\\scratch\\commit-err.txt', String(e.stderr || e.message), 'utf8');
}

const hash = g(['rev-parse', '--short', 'HEAD']).trim();
const sisa = g(['status', '--porcelain=v1'])
  .split('\n')
  .filter(Boolean)
  .filter((l) => !l.includes('scratch/') && !l.includes('target2'));

console.log('HASH=' + hash);
console.log('SISA=' + sisa.length);
if (sisa.length) console.log(sisa.join('\n'));
