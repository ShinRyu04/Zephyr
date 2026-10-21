const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const b = require(path.join(os.homedir(), '.cache', 'clean-room-cli', 'node_modules', 'clean-room-skill', 'lib', 'bootstrap.cjs'));

const log = (m) => { fs.writeSync(1, m + '\n'); };

const parsed = b.parseInitArgs(['--new-project', '--force', '--target-profile', 'speckit-feature-folder', '--target-dir', process.cwd()]);
const o = b.resolveInitOptions(parsed, process.env, os.homedir());
log('1 resolved');

const { assertWritableTargets } = require(path.join(os.homedir(), '.cache', 'clean-room-cli', 'node_modules', 'clean-room-skill', 'lib', 'bootstrap.cjs'));
log('2 required ok');

log('projectRoot=' + o.projectRoot);
log('outputRoot=' + o.outputRoot);
log('roots=' + JSON.stringify(o.roots));
log('metadataPath=' + o.metadataPath);
log('projectMetadataPath=' + o.projectMetadataPath);
log('repoStubPath=' + o.repoStubPath);
log('localStatePath=' + o.localStatePath);
log('localGitignorePath=' + o.localGitignorePath);
log('3 done');
process.exit(0);
