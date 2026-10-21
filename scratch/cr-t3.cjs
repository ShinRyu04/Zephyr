const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = (m) => fs.appendFileSync(path.join(process.cwd(), 'scratch', 'cr-t3.log'), m + '\n');

const base = path.join(os.homedir(), '.cleanroom');
M('base=' + base);
fs.mkdirSync(path.join(base, 'probe', 'x'), { recursive: true });
M('mkdir nested OK');
fs.writeFileSync(path.join(base, 'probe', 'x', 'f.txt'), 'x');
M('write OK');
fs.rmSync(path.join(base, 'probe'), { recursive: true, force: true });
M('cleanup OK');
M('selesai');
process.exit(0);
