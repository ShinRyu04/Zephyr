/*
 * Commit the work, printing a CUSTOM line at the end.
 *
 * WHY A CUSTOM FINAL LINE: the shell tool summarises anything that looks like git
 * output, so `git status` and `git log` come back as a rewritten sentence rather
 * than the real text. A line that does not look like git ("HASIL_COMMIT=…") passes
 * through unchanged, which is how the outcome can be read at all.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

const GIT = 'C:\\Program Files\\Git\\cmd\\git.exe';
const CWD = 'D:\\Zephyr';

const run = (args, allowFail = false) => {
  try {
    return execFileSync(GIT, args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      cwd: CWD,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    if (allowFail) return `(exit ${e.status}) ${e.stderr ?? ''}`;
    throw e;
  }
};

/* 1. Stage everything the work touched. */
run(['add', '-A']);

/* 2. Count what is staged, so the commit message states a fact. */
const staged = run(['diff', '--cached', '--name-only'])
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

const pesan = [
  'feat(ui): AI Models ala TRAE + Conversation settings + Auto Fix Lints',
  '',
  'AI Models',
  '- 29 provider dalam urutan TRAE, logo dari BRAND_MARKS resmi (simple-icons),',
  '  5 provider tanpa merek resmi memakai monogram berwarna mereknya sendiri',
  '- baris model memakai ModelLogo (keluarga model), bukan logo provider',
  '- Add Model: Custom Model selebar penuh di atas, grid 2 kolom, tile 42px,',
  '  modal 700px, API key + URL + Refresh + deteksi model dengan jumlah',
  '',
  'Conversation (Agent Customizations)',
  '- 6 bagian setelan ala TRAE: To-Do List, Auto Fix Lints, Agent Questioning,',
  '  Code Review, Terminal Tool Preferences, Task Status Notification',
  '- tata letak dua kolom: teks kiri, kontrol rata kanan; IDE/SOLO ditumpuk',
  '- tab History dengan Clear All, Rename/Export/Delete, penanda (Active)',
  '',
  'Auto Fix Lints',
  '- modul Rust lint_fix.rs: deteksi fixer per ekosistem (cargo fmt, gofmt,',
  '  ruff, eslint --fix, prettier --write), tolak path di luar project root',
  '- 8 unit test',
  '',
  'Lain-lain',
  '- lebar kolom Agent Customizations mengisi jendela (margin auto)',
  '- perbaikan filter Extensions, plugin bundled 7, Skills rail, Browser kartu',
].join('\n');

const hasilCommit = run(['commit', '-m', pesan], true);
const hash = run(['rev-parse', '--short', 'HEAD']).trim();

fs.writeFileSync(
  'D:\\Zephyr\\scratch\\commit-hasil.txt',
  `HASIL_COMMIT=${hash}\nFILE_STAGED=${staged.length}\n${staged.join('\n')}\n\nOUTPUT:\n${hasilCommit}\n`,
  'utf8',
);

console.log(`HASIL_COMMIT=${hash}`);
console.log(`FILE_STAGED=${staged.length}`);
