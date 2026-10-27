import { useMemo } from 'react';
import { useT } from '../../lib/i18n';
import { detectLang } from '../../lib/lang';
import { LANG_LABEL } from '../../lib/lang';
import { LABEL_PAKET, type LabelPaket } from '../../lib/labelPaket';

/*
 * The honest headline for the Languages tab.
 *
 * WHY THIS EXISTS: the tab lists around ninety language packs, and every one of
 * them looks like something the reader has to install to get syntax
 * highlighting. They do not. Zephyr ships its grammars in the app itself
 * (`src/lib/lang.ts` -> `BY_EXT`), so the highlighting is already on before the
 * tab is ever opened. Leading with the catalogue made the product look like it
 * needed a setup step that it does not.
 *
 * WHAT IT DOES NOT CLAIM: "88 languages work" is about HIGHLIGHTING. Compilers,
 * build tools and language servers are separate programs that live on the
 * reader's machine; Zephyr does not bundle `tsc`, `cargo` or `rust-analyzer`.
 * Saying so here is the difference between a helpful note and a promise the app
 * cannot keep - a reader who believes otherwise finds out at the first build.
 *
 * The per-pack notes come from `LABEL_PAKET`, the honesty table the extension
 * list already owns. That table decides "this pack only adds leftover
 * extensions" from the real catalogue, so this panel can never drift from it -
 * no second list is written here on purpose.
 */

/** One row of the "already supported" list: the language and what it covers. */
function bahasaBawaan(): { id: string; label: string; contoh: string }[] {
  /* A representative extension per language, taken from the detector itself so
     the label cannot name an extension the app does not actually recognise. */
  const contoh: Record<string, string> = {
    javascript: 'js',
    typescript: 'ts',
    jsx: 'jsx',
    tsx: 'tsx',
    json: 'json',
    html: 'html',
    css: 'css',
    markdown: 'md',
    python: 'py',
    rust: 'rs',
    go: 'go',
    sql: 'sql',
    yaml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    shell: 'sh',
    ini: 'ini',
    dart: 'dart',
    ruby: 'rb',
    lua: 'lua',
    perl: 'pl',
    swift: 'swift',
    kotlin: 'kt',
    scala: 'scala',
    csharp: 'cs',
    php: 'php',
    r: 'r',
    julia: 'jl',
    haskell: 'hs',
    elixir: 'ex',
  };
  return Object.entries(LANG_LABEL)
    .filter(([id]) => id !== 'plain')
    .filter(([id, label]) => {
      const ext = contoh[id];
      /* Only advertise a language the detector really resolves: the note has to
         survive somebody deleting an entry from `BY_EXT`. */
      return !ext || (detectLang(`berkas.${ext}`) === id && label.length > 0);
    })
    .map(([id, label]) => ({ id, label, contoh: contoh[id] ?? '' }));
}

export default function InfoBahasa() {
  const tr = useT();
  const daftar = useMemo(bahasaBawaan, []);
  const catatan = useMemo<LabelPaket[]>(() => Object.values(LABEL_PAKET), []);

  return (
    <div className="xmkt-info-bahasa" data-testid="xmkt-info-bahasa">
      <div className="xmkt-info-kepala">
        <strong>{tr('Already built in')}</strong>
        <span className="xmkt-badge">{daftar.length + ' ' + tr('languages')}</span>
      </div>
      <p className="xmkt-info-teks">
        {tr(
          'Zephyr highlights these languages without installing anything - the grammars ship with the app. The packs below are optional extras, not a setup step.',
        )}
      </p>

      <div className="xmkt-info-grid" data-testid="xmkt-info-bahasa-daftar">
        {daftar.map((b) => (
          <span className="xmkt-info-sel" key={b.id} data-bahasa={b.id}>
            {b.label}
            {b.contoh && <em>.{b.contoh}</em>}
          </span>
        ))}
      </div>

      <p className="xmkt-info-teks xmkt-info-ingat" data-testid="xmkt-info-toolchain">
        {tr(
          'Highlighting is not a toolchain: compilers, build tools and language servers (tsc, cargo, gcc, rust-analyzer) are separate programs on your machine. Zephyr runs them if they are installed - it does not bundle them.',
        )}
      </p>

      {catatan.length > 0 && (
        <ul className="xmkt-info-catatan" data-testid="xmkt-info-bahasa-catatan">
          {catatan.map((l) => (
            <li key={l.id}>
              <b>{l.bahasa}</b> — {tr(l.teks)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
