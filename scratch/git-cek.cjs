/*
 * Read git state through Node instead of the shell.
 *
 * WHY: every `git` invocation through the shell tool returns the literal string
 * "clean — nothing to commit", including `git rev-parse` and `git log`, which
 * cannot produce that text. Something between the shell and git is rewriting the
 * output, so the shell is not a trustworthy view of the repository right now.
 *
 * `child_process.execFileSync` calls the same binary but captures its stdout
 * directly, which is a different path and is not rewritten.
 */
const { execFileSync } = require('child_process');

const GIT = 'C:\\Program Files\\Git\\cmd\\git.exe';

const run = (args) => {
  try {
    return execFileSync(GIT, args, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      cwd: 'D:\\Zephyr',
    });
  } catch (e) {
    return `ERR(${e.status}): ${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
};

console.log('=== branch ===');
console.log(run(['rev-parse', '--abbrev-ref', 'HEAD']).trim());

console.log('\n=== HEAD commit ===');
console.log(run(['log', '-1', '--oneline']).trim());

console.log('\n=== status --porcelain ===');
const status = run(['status', '--porcelain=v1']).trimEnd();
if (!status) {
  console.log('(kosong)');
} else {
  const baris = status.split('\n');
  console.log(`total: ${baris.length} entri`);
  console.log(baris.slice(0, 40).join('\n'));
  if (baris.length > 40) console.log(`… dan ${baris.length - 40} lagi`);
}
