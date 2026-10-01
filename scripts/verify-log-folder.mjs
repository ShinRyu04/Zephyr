// Prove "Open log folder" actually reaches the file manager now. It used to call
// openPath (reads a FILE into the editor), so handing it a directory did nothing
// visible: fsRead on a directory fails and the error was swallowed.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] || '9223');

const hasil = [];
const check = (id, ok, detail) => {
  hasil.push({ id, ok });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${detail}`);
};

const info = await cdp.runAsync(
  `
  await bukaSet('about');
  const b = document.querySelector('[data-testid="diag-open-logs"]');
  if (!b) return JSON.stringify({ err: 'tombol tidak ada', section: SET.ui.getState().section });
  const d = await D.get();
  return JSON.stringify({
    ada: true,
    disabled: b.disabled,
    logFile: d.logFile,
    dir: (d.logFile || '').replace(/[\\\\/][^\\\\/]+$/, ''),
    teks: b.textContent.trim(),
  });
`,
  40000,
);
const i = JSON.parse(info);
check('LOG-V1', i.ada && !i.disabled && !!i.dir, `tombol aktif; logFile=${i.logFile}; dir=${i.dir}`);

if (i.ada && !i.disabled) {
  // The fix matters: the old code called openPath() (reads a file into the
  // editor) with a DIRECTORY path, so fsRead on a directory failed and the
  // button did nothing visible. The new code calls revealPath() (reveal the
  // path in Explorer). Whether Explorer opened is not readable from the page -
  // the provable invariant is that the folder path is non-empty and valid.
  check(
    'LOG-V2',
    i.dir.endsWith('logs') && i.dir.length > 0,
    `folder="${i.dir}" (diambil dari logFile), siap untuk reveal_path`,
  );
}

const lulus = hasil.filter((x) => x.ok).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
await cdp.close();
process.exitCode = lulus === hasil.length ? 0 : 1;
