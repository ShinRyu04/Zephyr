// Verifikasi fix glob path: regex pola glob harus cocok dengan path yang
// dinormalkan ke slash maju, bukan path backslash Windows mentah.
function polaKeRegex(glob) {
  const bagian = glob.split('|').filter(Boolean).map((g) => {
    return g
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '\u0001')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/\\\\]*')
      .replace(/\?/g, '.')
      .replace(/\u0000/g, '.*')
      .replace(/\u0001/g, '(?:.*/)?');
  });
  return new RegExp(`(?:${bagian.join('|')})$`, 'i');
}

const kasus = [
  ['senja/**/*.html', 'D:\\Testing\\senja\\index.html', true],
  ['senja/**/*.html', 'D:\\Testing\\senja\\sub\\x.html', true],
  ['senja/**/*.html', 'D:\\Testing\\senja\\css\\style.css', false],
  ['senja/*.html', 'D:\\Testing\\senja\\index.html', true],
  ['senja/css/*.css', 'D:\\Testing\\senja\\css\\style.css', true],
  ['senja/**/*.html', 'D:\\Testing\\_check.ps1', false],
];

let gagal = 0;
for (const [glob, pathAsli, harap] of kasus) {
  const re = polaKeRegex(glob);
  const lama = re.test(pathAsli);                       // sebelum fix (backslash mentah)
  const baru = re.test(pathAsli.replace(/\\/g, '/'));   // sesudah fix (slash maju)
  const ok = baru === harap;
  if (!ok) gagal++;
  console.log(
    `${ok ? 'LULUS' : 'GAGAL'}  glob=${glob.padEnd(18)} path=${pathAsli.padEnd(32)} ` +
    `lama=${lama} baru=${baru} harap=${harap}`,
  );
}
console.log(gagal === 0 ? '\n== semua lulus: fix glob benar ==' : `\n== ${gagal} GAGAL ==`);
process.exit(gagal === 0 ? 0 : 1);
