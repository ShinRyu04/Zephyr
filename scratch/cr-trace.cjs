const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const b = require(path.join(os.homedir(), '.cache', 'clean-room-cli', 'node_modules', 'clean-room-skill', 'lib', 'bootstrap.cjs'));

const M = (m) => fs.appendFileSync(path.join(process.cwd(), 'scratch', 'cr-trace.log'), m + '\n');

const parsed = b.parseInitArgs(['--new-project', '--force', '--target-profile', 'speckit-feature-folder', '--target-dir', process.cwd()]);
const o = b.resolveInitOptions(parsed, process.env, os.homedir());
M('A resolved ' + o.projectRoot);

const fsUtil = require(path.join(os.homedir(), '.cache', 'clean-room-cli', 'node_modules', 'clean-room-skill', 'lib', 'fs-utils.cjs'));
M('B fs-utils loaded');

fsUtil.atomicWriteFile(path.join(o.projectRoot, 'probe.txt'), 'halo\n', 'utf8');
M('C atomicWriteFile OK');

fs.mkdirSync(o.roots.contaminated, { recursive: true });
M('D mkdir contaminated OK');

fs.mkdirSync(path.join(o.projectRoot, 'tasks'), { recursive: true });
M('E mkdir tasks OK');

M('F selesai');
process.exit(0);
