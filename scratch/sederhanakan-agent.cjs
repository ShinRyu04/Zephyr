const fs = require("fs");
const P = "src/components/ai/ModeMenu.tsx";
let t = fs.readFileSync(P, "utf8");
const awal = t.indexOf("        <div className=\"mode-pop is-naik\" data-testid=\"ai-mode-pop\" role=\"menu\">");
const akhir = t.indexOf("        </div>\n      )}\n    </span>\n  );\n}", awal);
if (awal < 0 || akhir < 0) { console.log("anchor tidak ketemu", awal, akhir); process.exit(1); }
const baru = `        <div className="mode-pop is-naik" data-testid="ai-mode-pop" role="menu">
          <div className="pick-seksi">{tr('Built-In Agents')}</div>
          {/*
           * Two rows, and that is the whole menu - the reference's shape.
           *
           * It used to list every persona (Zeph, Coder, Architect, Reviewer,
           * Security, ...) with their descriptions, then a divider, then
           * "Manage personas & sub-agents". That made a MENU out of what the
           * reference treats as a PICKER: two answers, not a catalogue. The
           * long list also pushed the popup far past the composer, so it
           * covered the transcript it was meant to help with.
           *
           * The personas themselves are NOT gone - they still exist, still
           * drive the system prompt, and are still edited in Agent
           * Customizations, which is what "Create Agent" opens. What changed
           * is that the composer no longer asks you to choose one every time
           * you type; the active one is shown, and changing it is one click.
           */}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={true}
            className="mode-item is-on"
            data-testid="ai-persona-aktif"
            title={aktifPersona?.deskripsi ?? undefined}
            onClick={() => setBuka(false)}
          >
            <IkonPersonaBaris id={personaAktif} />
            <span className="mode-item-teks">
              <b>{tr('Agent')}</b>
              <i>{aktifPersona?.nama ?? tr('The active agent persona')}</i>
            </span>
            <span className="pick-check">\u2713</span>
          </button>

          <div className="mode-div" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            className="mode-item"
            data-testid="ai-mode-manage"
            onClick={() => {
              setBuka(false);
              /* Personas are edited in "Agent Customizations", the modal
                 panel that follows VS Code's own agent surface. It is a
                 surface of its own, not a page buried in Settings, so this
                 row opens the editor instead of navigating away from the
                 chat. */
              bukaPanel('agent-custom', 'agents');
            }}
          >
            <span className="mode-item-teks">
              <b>{tr('Create Agent')}</b>
              <i>{tr('Opens the persona editor')}</i>
            </span>
          </button>
`;
t = t.slice(0, awal) + baru + t.slice(akhir);
fs.writeFileSync(P, t, "utf8");
console.log("ok");
