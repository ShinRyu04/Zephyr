const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const b = require(path.join(os.homedir(), '.cache', 'clean-room-cli', 'node_modules', 'clean-room-skill', 'lib', 'bootstrap.cjs'));

const out = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scratch', 'cr-init-out.json'), 'utf8'));

const errors = [];
const r = b.validateBootstrapScaffold(out.taskRoot, errors);
console.log('validateBootstrapScaffold ->', JSON.stringify(r));
console.log('errors:', errors.length ? errors : '(none)');

console.log('--- bootstrap metadata ---');
console.log(fs.readFileSync(out.metadata, 'utf8'));

console.log('--- project metadata ---');
console.log(fs.readFileSync(out.projectMetadata, 'utf8'));

console.log('--- local-state ---');
console.log(fs.readFileSync(out.localState, 'utf8'));
process.exit(0);
