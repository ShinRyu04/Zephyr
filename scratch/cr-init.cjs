const os = require('node:os');
const path = require('node:path');
const b = require(path.join(os.homedir(), '.cache', 'clean-room-cli', 'node_modules', 'clean-room-skill', 'lib', 'bootstrap.cjs'));

const o = b.runInit(
  ['--new-project', '--force', '--target-profile', 'speckit-feature-folder', '--target-dir', process.cwd()],
  { env: process.env, homeDir: os.homedir() },
);
console.log('SELESAI', o ? o.outputRoot : '(null)');
