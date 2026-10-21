import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useRun } from '../../lib/runStore';
import { barisToolchain, semuaTool, DAP_TOOLS, type BarisToolchain } from '../../lib/toolchain';
import { Section } from './SettingsControls';

/*
 * Toolchain: one row per language, with the three things that decide whether
 * it is actually usable - the compiler, the language server, the debugger.
 *
 * WHY this page exists:
 *
 * 1. THE HALF-INSTALLED CASE WAS INVISIBLE. The LSP page showed a green server
 *    while Run answered "gcc not found", and nothing stated both facts at once.
 *    "Python works but cannot debug" was three screens away from being noticed.
 *
 * 2. IT PROBES WITH THE RUN PIPELINE'S OWN RESOLVER. `run_tool_status` looks in
 *    PATH, the well-known toolchain roots (mingw64, LLVM, Go, JDK) AND the
 *    WinGet package folder. A separate probe here would answer a different
 *    question than the Run button asks and be wrong in exactly the case that
 *    matters: a compiler installed by an installer that never reached PATH.
 *
 * 3. IT SAYS WHAT TO DO. A missing tool carries the command that installs it,
 *    and for a language server the row hands over to the install dialog that
 *    already knows every strategy (npm / winget / toolchain / archive).
 */

export default function ToolchainPanel() {
  const tr = useT();
  const cekTool = useRun((s) => s.cekTool);
  const tools = useRun((s) => s.tools);
  const [sibuk, setSibuk] = useState(true);

  const baris = useMemo(() => barisToolchain(), []);
  const daftar = useMemo(() => semuaTool(baris), [baris]);

  /*
   * `tools` survives navigation in the run store, so arriving back on this
   * panel does not re-probe - the same trick the LSP page uses. The dependency
   * is the primitive count, never the map itself: a new map identity per write
   * would re-probe forever.
   */
  const sudahAda = Object.keys(tools).length > 0;
  useEffect(() => {
    if (sudahAda) return;
    let hidup = true;
    setSibuk(true);
    void cekTool(daftar).finally(() => {
      if (hidup) setSibuk(false);
    });
    return () => {
      hidup = false;
    };
  }, [sudahAda, daftar, cekTool]);

  const periksaUlang = async () => {
    setSibuk(true);
    try {
      await cekTool(daftar);
    } finally {
      setSibuk(false);
    }
  };

  const ketemu = (tool: string) => tools[tool]?.found === true;

  /* A language is ready when EVERY tool it needs is there. One green row per
     language, not a green tick per column: the question being asked is "can I
     use this language", and a server without a compiler cannot run anything. */
  const siap = (b: BarisToolchain) => b.alat.every((a) => ketemu(a.tool));

  const jumlahSiap = baris.filter(siap).length;

  return (
    <Section title={tr('Toolchain')}>
      <div className="set-row">
        <div className="set-row-label">
          <span className="set-row-title">
            {tr('Language toolchains')} — {jumlahSiap}/{baris.length}
          </span>
          <span className="set-hint">
            {tr(
              'Compilers, language servers and debug adapters Zephyr found on this machine. Checked with the same resolver the Run button uses, so a toolchain installed outside PATH still counts.',
            )}
          </span>
        </div>
        <button className="btn btn-sm" data-testid="tc-reload" disabled={sibuk} onClick={() => void periksaUlang()}>
          {sibuk ? tr('Checking...') : tr('Check all')}
        </button>
      </div>

      <div className="tc-list" data-testid="tc-list">
        {baris.map((b) => {
          const dap = DAP_TOOLS[b.id];
          return (
            <div className="tc-baris" key={b.id} data-testid={`tc-${b.id}`}>
              <div className="tc-head">
                <span className={`tc-dot${siap(b) ? ' is-siap' : ''}`} aria-hidden="true" />
                <span className="tc-nama">{b.label}</span>
                <span className="tc-ext">{b.extensions.slice(0, 4).join(' ')}</span>
              </div>

              <div className="tc-alat">
                {b.alat.map((a) => {
                  const st = tools[a.tool];
                  return (
                    <span
                      className={`tc-chip${st?.found ? ' is-ada' : st ? ' is-hilang' : ''}`}
                      key={`${a.peran}-${a.tool}`}
                      data-testid={`tc-${b.id}-${a.tool}`}
                      title={st?.found ? `${st.path}${st.version ? ' — ' + st.version : ''}` : undefined}
                    >
                      <span className="tc-chip-peran">{tr(a.peran === 'lsp' ? 'server' : a.peran)}</span>
                      <code>{a.tool}</code>
                      {st?.found ? (
                        <span className="tc-chip-versi">{st.version ? st.version.replace(a.tool, '').trim().slice(0, 24) : 'ok'}</span>
                      ) : (
                        <span className="tc-chip-versi">
                          {st ? tr('missing') : sibuk ? '…' : tr('missing')}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>

              <div className="tc-debug">
                <span className="tc-chip-peran">{tr('debugger')}</span>
                {dap ? (
                  <>
                    <code>{dap.adapter}</code>
                    <span className={`tc-chip-versi${ketemu(dap.tool) ? ' is-ok' : ''}`}>
                      {ketemu(dap.tool) ? tr('found') : tr('missing')}
                    </span>
                  </>
                ) : (
                  <span className="tc-chip-versi">{tr('no adapter in Zephyr yet')}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="set-hint tc-note">
        {tr(
          'Missing a server? Install it from Language Servers - that page has a one-click install for every server Zephyr knows how to fetch, and a copyable command for the rest.',
        )}
      </p>
    </Section>
  );
}
