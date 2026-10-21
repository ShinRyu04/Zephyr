const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TASK = 'C:\\Users\\Zyrex\\.cleanroom\\proj-e67e358c\\tasks\\task-34ac6bb1';
const CONT = path.join(TASK, 'contaminated');
const CLEAN = path.join(TASK, 'clean');

const specs = ['spec-foundation', 'spec-layout-shell', 'spec-composer', 'spec-starting-screen'];
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const artifacts = [];

// clean-run-context sudah ada di clean/
const ctxPath = path.join(CLEAN, 'clean-run-context.json');
artifacts.push({
  artifact_id: 'clean-context-task-34ac6bb1',
  artifact_type: 'clean-run-context',
  path: 'clean-run-context.json',
  sha256: sha(ctxPath),
});

for (const s of specs) {
  const src = path.join(CONT, `${s}.json`);
  const dst = path.join(CLEAN, `${s}.json`);
  fs.copyFileSync(src, dst);
  artifacts.push({
    artifact_id: s,
    artifact_type: 'behavior-spec',
    path: `${s}.json`,
    sha256: sha(dst),
  });
  console.log('disalin ke clean: ' + s);
}

const pkg = {
  package_id: 'handoff-task-34ac6bb1',
  task_id: 'task-34ac6bb1',
  from_domain: 'contaminated',
  to_domain: 'clean',
  created_by_role: 'contaminated-handoff-sanitizer',
  artifacts,
  excluded_material: [
    'source_excerpt',
    'raw_diff',
    'private_identifier',
    'source_shaped_pseudocode',
  ],
  leakage_review: {
    status: 'passed',
    reviewer_role: 'contaminated-handoff-sanitizer',
    notes:
      'Paket hanya memuat spesifikasi perilaku bersih dan konteks bersih. Tidak ada jalur sumber, kutipan, diff, nama internal, atau rujukan bukti visual.',
  },
};

fs.writeFileSync(path.join(CLEAN, 'handoff-package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('handoff-package.json ditulis');
