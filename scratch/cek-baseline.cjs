const { execFileSync } = require('child_process');
const GIT = 'C:\\Program Files\\Git\\cmd\\git.exe';
const g = (a) => execFileSync(GIT, a, { encoding: 'utf8', maxBuffer: 67108864, cwd: 'D:\\Zephyr' });

/* Were the reported catalogue defects already in the last commit? */
const head = g(['show', 'HEAD:src/lib/zephyrTools/catalog.ts']);
const out = [];
out.push('HEAD punya ask_user    : ' + head.includes("'ask_user'"));
out.push('HEAD punya browser/web : ' + (head.includes("'browser',") && head.includes("'web',")));
out.push('HEAD punya web_fetch   : ' + head.includes('web_fetch'));
console.log(out.join('\n'));
