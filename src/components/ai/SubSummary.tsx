import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSubAgent } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';

/*
 * The combined summary is the report a batch produces: one section per agent,
 * separated by `---` in the stored text.
 *
 * It used to render inside a <pre>, which printed the markdown source verbatim
 * — `## Comet — done` with the hashes, `-` where a bullet belonged, every line
 * the same monospace weight.
 *
 * Each agent section is its own block in a grid rather than one long column or a
 * CSS multi-column flow. Multi-column was tried first and split the file list
 * across two columns mid-list, which breaks the reading order; a grid keeps each
 * agent's report whole and still uses the width of a wide panel.
 */
export default function SubSummary({ className }: { className?: string }) {
  const tr = useT();
  const ringkasan = useSubAgent((s) => s.ringkasan);
  const sibuk = useSubAgent((s) => s.sibuk);

  if (!ringkasan || sibuk) return null;

  // The store joins sections with a horizontal rule, and that separator IS the
  // section boundary: it is consumed here and replaced by the grid gap.
  const bagian = ringkasan
    .split(/\n\s*-{3,}\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    /*
     * Closed by default. The report is long — with three agents it ran to 280px
     * and, sitting in a flex column above nothing, it took the space the
     * timeline needed and pushed the agent rows out of the panel entirely.
     * Collapsed, it is one line, and the timeline keeps the room.
     */
    <details className={`sub-ringkas${className ? ` ${className}` : ''}`} data-testid="sub-summary">
      <summary>{tr('Combined summary')}</summary>
      <div className="sub-ringkas-isi">
        {bagian.map((b, i) => (
          <div className="sub-ringkas-bagian" key={i}>
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({ className: cls, children }) => {
                  const teks = String(children ?? '').replace(/\n$/, '');
                  const blok = /language-/.test(cls ?? '') || teks.includes('\n');
                  return blok ? (
                    <pre className="sub-ringkas-kode">
                      <code>{teks}</code>
                    </pre>
                  ) : (
                    <code className="sub-ringkas-inline">{teks}</code>
                  );
                },
              }}
            >
              {b}
            </Markdown>
          </div>
        ))}
      </div>
    </details>
  );
}
