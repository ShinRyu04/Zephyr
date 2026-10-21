const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = (m) => fs.appendFileSync(path.join(process.cwd(), 'scratch', 'cr-t2.log'), m + '\n');

const docs = path.join(os.homedir(), 'Documents');
M('docs=' + docs);
M('exists=' + fs.existsSync(docs));
M('lstat=' + JSON.stringify(fs.lstatSync(docs).isSymbolicLink()));

const t1 = path.join(docs, 'cr-probe-a');
fs.mkdirSync(t1, { recursive: true });
M('mkdir Documents/ langsung OK');

const t2 = path.join(docs, 'cr-probe-b', 'x');
fs.mkdirSync(t2, { recursive: true });
M('mkdir nested OK');

fs.writeFileSync(path.join(t2, 'f.txt'), 'x');
M('write OK');

fs.rmSync(path.join(docs, 'cr-probe-a'), { recursive: true, force: true });
fs.rmSync(path.join(docs, 'cr-probe-b'), { recursive: true, force: true });
M('cleanup OK');
M('selesai');
process.exit(0);
