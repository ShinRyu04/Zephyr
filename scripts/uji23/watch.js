// Fixture watch for verify23 V3.
//
// tasks.rs starts a background task with aktif=false, so a round only finishes
// when a beginsPattern line (aktif=true) is followed by an endsPattern line
// (aktif=false -> "end" event -> ready[id]=true in the store). The harness
// waits for round 1 to be ready, then waits for the "Found 0 errors" line and
// reads ready 500ms later. That is why the gap before "Ronde 2 selesai" is
// deliberately short: the round-2 end event must already be processed by the
// store when the harness reads it.
//
// The tsc-looking lines use the bare "Found N errors" shape with no
// file(line,col) prefix, so the $tsc matcher adds no Problems from this task.

const baris = [
  '> npx tsc --noEmit --watch',
  'Starting compilation in watch mode...',
  'Ronde 1 mulai',
  'Found 1 errors. Watching for file changes.',
  'Ronde 1 selesai',
  'Ronde 2 mulai',
  'Found 0 errors. Watching for file changes.',
  'Ronde 2 selesai',
  'Selesai menunggu perubahan berkas.',
];

// Delay AFTER each printed line.
const jeda = [400, 500, 600, 500, 2000, 500, 300, 400];

let i = 0;

function berikut() {
  if (i >= baris.length) {
    setInterval(() => {}, 1 << 30);
    return;
  }
  console.log(baris[i]);
  const d = jeda[i] ?? 400;
  i += 1;
  setTimeout(berikut, d);
}

setTimeout(berikut, 300);
