const fs = require("fs");
const P = "src/components/ai/AiPanel.tsx";
let t = fs.readFileSync(P, "utf8");
const NL = t.includes("\r\n") ? "\r\n" : "\n";
const awal = t.indexOf("            {/*" + NL + "             * A mark, a line of purpose, then three things to do.");
if (awal < 0) { console.log("awal tidak ketemu"); process.exit(1); }
const akhirPenanda = "            </div>" + NL + "          </div>" + NL + "        ) : (";
const akhir = t.indexOf(akhirPenanda, awal);
if (akhir < 0) { console.log("akhir tidak ketemu"); process.exit(1); }
const baru = [
'            {/*',
'             * The starting screen, laid out like the reference.',
'             *',
'             * Measured on the reference bitmap (1917x1138 at 1.25 scale),',
'             * centre column, top to bottom:',
'             *',
'             *   y 267  heading, ~28px, bright',
'             *   y 348  hairline',
'             *   y 370  tagline, 13px, dim, one or two lines',
'             *   y 431  composer box begins',
'             *',
'             * What it replaced was a small mark, "Ask about this code." and',
'             * three suggestion cards - a panel-sized empty state. The',
'             * reference treats this as a LAUNCH screen: one big statement,',
'             * one line of purpose, then the box you type into. The heading is',
'             * the largest text in the window on purpose; it is the only thing',
'             * telling a first-time reader what this surface is for.',
'             */}',
'            <p className="ai-empty-judul">{tr(\'Build with Zephyr\')}</p>',
'            <p className="ai-empty-tagline">',
'              {tr(\'More than writing every line of code - delivering production-grade results end-to-end.\')}',
'            </p>',
'            <div className="ai-saran" role="list">',
'              {[',
'                { id: \'aplikasi\', label: \'Application Development\', sub: \'Build a feature end to end\', isi: \'Build a small feature end to end: plan it, implement it, then verify it runs.\' },',
'                { id: \'pahami\', label: \'Project Understanding\', sub: \'Map how this repo works\', isi: \'Map how this repository is put together: the entry points, the main modules, and how data flows between them.\' },',
'                { id: \'kreatif\', label: \'Game Creativity\', sub: \'Prototype a game idea\', isi: \'Prototype a small playable game idea and show me how to run it.\' },',
'                { id: \'otomasi\', label: \'Automation Tools\', sub: \'Script a repetitive job\', isi: \'Find the most repetitive manual step in this project and script it.\' },',
'              ].map((s) => (',
'                <button',
'                  key={s.id}',
'                  type="button"',
'                  role="listitem"',
'                  className="ai-saran-kartu"',
'                  data-testid={`ai-saran-${s.id}`}',
'                  onClick={() => {',
'                    setDraft(tr(s.isi));',
'                    inputRef.current?.focus();',
'                  }}',
'                >',
'                  <span className="ai-saran-teks">',
'                    <span className="ai-saran-label">{tr(s.label)}</span>',
'                    <span className="ai-saran-sub">{tr(s.sub)}</span>',
'                  </span>',
'                </button>',
'              ))}',
'            </div>',
'          </div>',
'        ) : ('
].join(NL);
t = t.slice(0, awal) + baru + t.slice(akhir + akhirPenanda.length);
fs.writeFileSync(P, t, "utf8");
console.log("empty state diganti");
