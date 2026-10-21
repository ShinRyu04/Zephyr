const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const b = require(path.join(os.homedir(), '.cache', 'clean-room-cli', 'node_modules', 'clean-room-skill', 'lib', 'bootstrap.cjs'));

const base = path.join(os.homedir(), '.cleanroom');
const o = b.runInit(
  [
    '--new-project',
    '--force',
    '--target-profile', 'speckit-feature-folder',
    '--target-dir', process.cwd(),
    '--artifact-base', base,
  ],
  { env: process.env, homeDir: os.homedir() },
);

const out = {
  project: o.projectId,
  projectRoot: o.projectRoot,
  taskRoot: o.outputRoot,
  roots: o.roots,
  metadata: o.metadataPath,
  projectMetadata: o.projectMetadataPath,
  repoStub: o.repoStubPath,
  localState: o.localStatePath,
  localGitignore: o.localGitignorePath,
  targetProfile: o.targetProfile,
};
fs.writeFileSync(path.join(process.cwd(), 'scratch', 'cr-init-out.json'), JSON.stringify(out, null, 2));
console.log('SELESAI ' + o.outputRoot);
process.exit(0);
