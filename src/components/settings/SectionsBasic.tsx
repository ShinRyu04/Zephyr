
import * as cmd from '../../lib/commands';
import { useStore } from '../../lib/store';
import { useT, UI_LANGS } from '../../lib/i18n';
import { semuaTema } from '../../lib/themes';
import { NumberInput, Pills, Row, Section, Select, TextInput, Toggle } from './SettingsControls';

import { useTerminal } from '../../lib/terminalStore';
export function GeneralSection() {
  const tr = useT();
  const g = useStore((s) => s.settings.general);
  const apply = useStore((s) => s.applySettings);
  const dataDir = useStore((s) => s.appInfo?.dataDir ?? '');

  const patch = (p: Partial<typeof g>) => void apply({ general: p });

  return (
    <Section title={tr('settings.general')}>
      <Row label={tr('general.theme')} hint={tr('light/dark mode; specific themes are in the Theme section')}>
        <Pills
          label={tr('general.theme')}
          testid="general-theme"
          value={g.theme}
          onChange={(v) => patch({ theme: v as typeof g.theme })}
          options={[
            { value: 'dark', label: 'Zephyr Dark' },
            { value: 'light', label: 'Zephyr Light' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Row>

      <Row label={tr('general.font')} hint={tr('used by the editor & terminal')}>
        <TextInput
          label={tr('general.font')}
          testid="general-font"
          mono
          value={g.fontFamily}
          onChange={(v) => patch({ fontFamily: v })}
        />
      </Row>

      <Row label={tr('general.fontSize')} testid="row-fontsize">
        <NumberInput
          label={tr('general.fontSize')}
          testid="general-fontsize"
          min={10}
          max={24}
          value={g.fontSize}
          onChange={(v) => patch({ fontSize: v })}
          suffix="px"
        />
      </Row>

      <Row label={tr('general.lineHeight')}>
        <NumberInput
          label={tr('general.lineHeight')}
          testid="general-lineheight"
          min={1.2}
          max={2}
          step={0.1}
          value={g.lineHeight}
          onChange={(v) => patch({ lineHeight: v })}
        />
      </Row>

      <Row label={tr('general.uiLang')} hint={tr('main labels only, not all text')}>
        <Select
          label={tr('general.uiLang')}
          testid="general-lang"
          value={g.uiLang}
          onChange={(v) => patch({ uiLang: v as typeof g.uiLang })}
          options={UI_LANGS}
        />
      </Row>

      <Row label={tr('general.zoom')} hint="Ctrl+= / Ctrl+- / Ctrl+0">
        <NumberInput
          label={tr('general.zoom')}
          testid="general-zoom"
          min={50}
          max={200}
          step={10}
          value={g.zoom}
          onChange={(v) => patch({ zoom: v })}
          suffix="%"
        />
      </Row>

      <Row label={tr('general.restoreSession')}>
        <Toggle
          label={tr('general.restoreSession')}
          testid="general-restore"
          checked={g.restoreSession}
          onChange={(v) => patch({ restoreSession: v })}
        />
      </Row>

      <Row label={tr('general.checkUpdates')} hint={tr('no telemetry; only checks the release version')}>
        <Toggle
          label={tr('general.checkUpdates')}
          testid="general-updates"
          checked={g.checkUpdates}
          onChange={(v) => patch({ checkUpdates: v })}
        />
      </Row>

      {/*
        * The four below are new in 1.2.0.
        *
        * Each falls back with `?? default` because these keys may be absent on
        * an upgraded install: `deep_merge` leaves a missing key missing rather
        * than filling it from the Rust default, and `undefined` on a Toggle
        * renders as off. An "off" that is really "absent" would be a lie told by
        * the UI, so the default is stated here as well.
        */}
      <Row
        label={tr('Confirm before closing the window')}
        hint={tr('asks first if there are unsaved files; a window closed by mistake cannot be undone')}
      >
        <Toggle
          label={tr('Confirm before closing the window')}
          testid="general-confirm-exit"
          checked={g.confirmExit ?? true}
          onChange={(v) => patch({ confirmExit: v })}
        />
      </Row>

      {/*
        * `minimizeToTray` is DISABLED with an explanation, and that is the
        * honest state of it rather than a shortcut.
        *
        * There is no tray in this app: no `tauri-plugin-tray` in Cargo.toml, no
        * tray setup in main.rs, no `trayIcon` in tauri.conf.json. Turning the
        * switch on would hide the window with no icon anywhere to bring it back
        * - the user would have closed Zephyr and lost it, while the process kept
        * running and kept holding the workspace lock. A switch that does that is
        * worse than a missing feature.
        *
        * It stays visible, greyed, with the reason next to it, so the state of
        * the feature is legible. A hidden switch would look like it was never
        * planned; an enabled one would lie.
        */}
      <Row
        label={tr('Keep running in the tray when closed')}
        hint={tr('not available yet: Zephyr has no tray icon, so a closed window could not be reopened. Coming once the tray is built.')}
      >
        <Toggle
          label={tr('Keep running in the tray when closed')}
          testid="general-tray"
          checked={false}
          disabled
          onChange={() => undefined}
        />
      </Row>

      <Row
        label={tr('Default terminal')}
        hint={tr('which shell a new terminal starts; "Default" means the one this system already uses')}
      >
        <Select
          label={tr('Default terminal')}
          testid="general-terminal"
          value={g.defaultTerminal ?? 'default'}
          onChange={(v) => patch({ defaultTerminal: v as typeof g.defaultTerminal })}
          options={[
            { value: 'default', label: tr('Default (auto-detect)') },
            { value: 'pwsh', label: 'PowerShell 7 (pwsh)' },
            { value: 'powershell', label: 'Windows PowerShell' },
            { value: 'cmd', label: 'Command Prompt (cmd)' },
            { value: 'bash', label: 'Bash' },
            { value: 'wsl', label: 'WSL' },
          ]}
        />
      </Row>

      <Row
        label={tr('Shell path')}
        hint={tr('leave empty to use the choice above; set it to point at a shell Zephyr cannot find on its own')}
      >
        <TextInput
          label={tr('Shell path')}
          testid="general-shell-path"
          mono
          value={g.shellPath ?? ''}
          onChange={(v) => patch({ shellPath: v })}
        />
      </Row>

      <Row
        label={tr('RAM saver mode')}
        hint={tr('smooth scroll off, minimap/sticky/indent/color decorators off, loaded tab limit 3 (of 12), terminal scrollback 1000 lines')}
      >
        <Toggle
          label={tr('RAM saver mode')}
          testid="general-lowram"
          checked={g.lowRam === true}
          onChange={(v) => patch({ lowRam: v })}
        />
      </Row>


      <Row
        label={tr('AI panel position')}
        hint={tr('bottom = flush with the terminal; right = a 340px column like VS Code')}
      >
        <select
          className="inp"
          data-testid="general-ai-panel"
          aria-label={tr('AI panel position')}
          value={g.aiPanel ?? 'bottom'}
          onChange={async (e) => {
            const nilai = e.target.value as 'bottom' | 'right';
            patch({ aiPanel: nilai });

            if (nilai === 'right') {

              useTerminal.getState().setVisible(false);
            }
          }}
        >
          <option value="bottom">{tr('Bottom (flush with terminal)')}</option>
          <option value="right">{tr('Right (340px)')}</option>
        </select>
      </Row>

      <Row
        label="Main layout"
        hint={tr('editor = large editor with the terminal docked below; terminal = the terminal becomes the main area, the editor becomes a side pane')}
      >
        <select
          className="inp"
        data-testid="general-layout"
        aria-label={tr('Main layout')}
          value={g.layout ?? 'editor'}
          onChange={(e) => patch({ layout: e.target.value as 'editor' | 'terminal' })}
        >
          <option value="editor">Editor-first</option>
          <option value="terminal">Terminal-first</option>
        </select>
      </Row>

      <Row label={tr('general.openDataFolder')} hint={dataDir || '%APPDATA%\\zephyr'}>
        <button
          className="btn"
          data-testid="general-open-data"
          onClick={() => void cmd.revealPath(dataDir).catch(() => {})}
        >
          {tr('general.openDataFolder')}
        </button>
      </Row>
    </Section>
  );
}

export function EditorSection() {
  const tr = useT();
  const e = useStore((s) => s.settings.editor);
  const apply = useStore((s) => s.applySettings);
  const patch = (p: Partial<typeof e>) => void apply({ editor: p });

  return (
    <Section title={tr('settings.editor')}>
      <Row label={tr('editor.tabSize')}>
        <NumberInput
          label={tr('editor.tabSize')}
          testid="editor-tabsize"
          min={1}
          max={8}
          value={e.tabSize}
          onChange={(v) => patch({ tabSize: v })}
        />
      </Row>

      <Row label={tr('editor.insertSpaces')}>
        <Toggle
          label={tr('editor.insertSpaces')}
          testid="editor-spaces"
          checked={e.insertSpaces}
          onChange={(v) => patch({ insertSpaces: v })}
        />
      </Row>

      <Row label={tr('editor.wordWrap')}>
        <Toggle
          label={tr('editor.wordWrap')}
          testid="editor-wrap"
          checked={e.wordWrap}
          onChange={(v) => patch({ wordWrap: v })}
        />
      </Row>

      <Row label={tr('editor.minimap')} hint={tr('off by default to save RAM')}>
        <Toggle
          label={tr('editor.minimap')}
          testid="editor-minimap"
          checked={e.minimap}
          onChange={(v) => patch({ minimap: v })}
        />
      </Row>

      <Row label={tr('editor.cursorStyle')}>
        <Select
          label={tr('editor.cursorStyle')}
          testid="editor-cursor"
          value={e.cursorStyle}
          onChange={(v) => patch({ cursorStyle: v as typeof e.cursorStyle })}
          options={[
            { value: 'line', label: 'Line' },
            { value: 'block', label: 'Block' },
            { value: 'underline', label: 'Underline' },
          ]}
        />
      </Row>

      <Row
        label={tr('editor.snippetSuggestions')}
        hint={tr('position of snippet suggestions in the completion list')}
      >
        <Select
          label={tr('editor.snippetSuggestions')}
          testid="editor-snippet-sug"
          value={e.snippetSuggestions}
          onChange={(v) => patch({ snippetSuggestions: v as typeof e.snippetSuggestions })}
          options={[
            { value: 'inline', label: 'Inline (mixed, sorted by relevance)' },
            { value: 'top', label: 'Top' },
            { value: 'bottom', label: 'Bottom' },
            { value: 'none', label: 'Disable' },
          ]}
        />
      </Row>

      <Row
        label="Ghost text (inline AI suggestions)"
        hint="Alt+\ requests a suggestion, Tab accepts, Esc dismisses - each suggestion = 1 paid API call"
      >
        <Toggle
          label="Ghost text"
          testid="editor-ghost"
          checked={e.ghostText}
          onChange={(v) => patch({ ghostText: v })}
        />
      </Row>

      <Row label={tr('editor.smoothScroll')} hint={tr('smoother, slightly heavier')}>
        <Toggle
          label={tr('editor.smoothScroll')}
          testid="editor-smooth"
          checked={e.smoothScroll}
          onChange={(v) => patch({ smoothScroll: v })}
        />
      </Row>

      <Row label={tr('editor.showWhitespace')} hint={tr('dot for spaces, arrow for tabs')}>
        <Toggle
          label={tr('editor.showWhitespace')}
          testid="editor-whitespace"
          checked={e.showWhitespace}
          onChange={(v) => patch({ showWhitespace: v })}
        />
      </Row>

      <Row
        label={tr('editor.vimMode')}
        hint={tr('Normal/insert/visual modes; the built-in keymap still handles unbound keys')}
      >
        <Toggle
          label={tr('editor.vimMode')}
          testid="editor-vim"
          checked={e.vimMode}
          onChange={(v) => patch({ vimMode: v })}
        />
      </Row>

      {/*
        Saving, as one group.
        *
        * These three were scattered: `formatOnSave` sat six rows above here, with
        * `showWhitespace` and `vimMode` between them, and the delay lived on its
        * own below. They are one decision - when a file reaches the disk, and what
        * happens on the way - and reading them apart let someone set an autosave
        * delay without ever noticing the format-on-save switch that changes what
        * actually gets written.
        *
        * Only the ORDER changed. Every testid is untouched, so nothing that looks
        * these up by name is affected.
        */}
      <div data-testid="set-grup-saving">
        {/* Reuses the sub-heading class phase 29 added for Security, rather than
            a new one: two sub-heading styles a hundred lines apart would drift,
            and the whole point of grouping is that it reads as one section. */}
        <div className="set-h2 set-h2-sub">{tr('Saving')}</div>

        <Row
          label={tr('editor.autoSave')}
          hint={tr('saves dirty tabs through the normal save path, so format on save still runs')}
        >
          <Select
            label={tr('editor.autoSave')}
            testid="editor-autosave"
            value={e.autoSave}
            onChange={(v) => patch({ autoSave: v as typeof e.autoSave })}
            options={[
              { value: 'off', label: tr('editor.autoSaveOff') },
              { value: 'afterDelay', label: tr('editor.autoSaveAfterDelay') },
              { value: 'onFocusChange', label: tr('editor.autoSaveOnFocusChange') },
            ]}
          />
        </Row>

        {/*
          Only meaningful for `afterDelay`; the delay is ignored by the other two
          modes, so it stays hidden rather than editable-but-inert.
        */}
        {e.autoSave === 'afterDelay' && (
          <Row label={tr('editor.autoSaveDelay')}>
            <NumberInput
              label={tr('editor.autoSaveDelay')}
              testid="editor-autosave-delay"
              min={200}
              max={10000}
              step={100}
              value={e.autoSaveDelay}
              onChange={(v) => patch({ autoSaveDelay: v })}
              suffix="ms"
            />
          </Row>
        )}

        <Row label={tr('editor.formatOnSave')} hint={tr('Uses the active language LSP formatter')}>
          <Toggle
            label={tr('editor.formatOnSave')}
            testid="editor-format"
            checked={e.formatOnSave}
            onChange={(v) => patch({ formatOnSave: v })}
          />
        </Row>
      </div>

      {/* ── phase 24: editor extras ──
          Key names are deliberately the same as VS Code so users switching over do not
          need to learn new names. The heavy ones get a warning in the hint. */}
      <p className="set-note">
        The editor conveniences below can be turned off one by one. They are all
        also available in the View → Appearance menu.
      </p>

      <Row label={tr('editor.breadcrumbs')} hint={tr('folder path + symbols from the language server')}>
        <Toggle
          label={tr('editor.breadcrumbs')}
          testid="editor-breadcrumbs"
          checked={e.breadcrumbs}
          onChange={(v) => patch({ breadcrumbs: v })}
        />
      </Row>

      <Row label={tr('editor.stickyScroll')} hint={tr('function/class lines stick while scrolling')}>
        <Toggle
          label={tr('editor.stickyScroll')}
          testid="editor-sticky"
          checked={e.stickyScroll}
          onChange={(v) => patch({ stickyScroll: v })}
        />
      </Row>

      <Row label={tr('editor.stickyScrollMaxLines')} hint={tr('how many header lines are stacked')}>
        <NumberInput
          label={tr('editor.stickyScrollMaxLines')}
          testid="editor-sticky-max"
          min={1}
          max={10}
          value={e.stickyScrollMaxLines}
          onChange={(v) => patch({ stickyScrollMaxLines: v })}
        />
      </Row>

      <Row
        label={tr('editor.minimapRenderCharacters')}
        hint={tr('draws the actual text, not color blocks - much heavier')}
      >
        <Toggle
          label={tr('editor.minimapRenderCharacters')}
          testid="editor-minimap-chars"
          checked={e.minimapRenderCharacters}
          onChange={(v) => patch({ minimapRenderCharacters: v })}
        />
      </Row>

      <Row label={tr('editor.indentGuides')} hint={tr('indent guides + active indent')}>
        <Toggle
          label={tr('editor.indentGuides')}
          testid="editor-indent-guides"
          checked={e.indentGuides}
          onChange={(v) => patch({ indentGuides: v })}
        />
      </Row>

      <Row label={tr('editor.colorDecorators')} hint={tr('swatch for #hex/rgb()/hsl(), click for a picker')}>
        <Toggle
          label={tr('editor.colorDecorators')}
          testid="editor-color-dec"
          checked={e.colorDecorators}
          onChange={(v) => patch({ colorDecorators: v })}
        />
      </Row>

      <Row label={tr('editor.unicodeHighlight')} hint={tr('flag ambiguous & invisible characters')}>
        <Toggle
          label={tr('editor.unicodeHighlight')}
          testid="editor-unicode"
          checked={e.unicodeHighlight}
          onChange={(v) => patch({ unicodeHighlight: v })}
        />
      </Row>

      <Row label={tr('editor.bracketPairColorization')} hint={tr('color brackets by depth')}>
        <Toggle
          label={tr('editor.bracketPairColorization')}
          testid="editor-bracket-color"
          checked={e.bracketPairColorization}
          onChange={(v) => patch({ bracketPairColorization: v })}
        />
      </Row>
    </Section>
  );
}

/**
 * Stable empty fallback for the selector below.
 *
 * Same reason as ContextMeter: `?? {}` inside a zustand v5 selector allocates a
 * new object per call, which reads as a changed snapshot every render and ends
 * in "Maximum update depth exceeded". Not reachable today — background is
 * present in the defaults and nothing patches it to null — but the crash is one
 * `{ background: null }` patch away, so it costs nothing to close.
 */
const BG_KOSONG = {} as NonNullable<ReturnType<typeof useStore.getState>['settings']['background']>;

export function ThemeSection() {
  const tr = useT();
  const theme = useStore((s) => s.settings.theme);

  const bg = useStore((s) => s.settings.background ?? BG_KOSONG);
  const general = useStore((s) => s.settings.general);
  const apply = useStore((s) => s.applySettings);

  return (
    <Section title={tr('settings.theme')}>
      <p className="set-note">{tr('theme.description')}</p>

      <div className="theme-grid" data-testid="theme-grid">
        {/* semuaTema() = built-in + themes from active extensions (phase 19.5). */}
        {semuaTema().map((th) => {
          const active = theme.current === th.id;
          return (
            <button
              key={th.id}
              className={`theme-card${active ? ' is-active' : ''}`}
              data-theme-card={th.id}
              aria-pressed={active}
              onClick={() =>
                void apply({
                  theme: { current: th.id },

                  general: { theme: th.kind === 'light' ? 'light' : 'dark' },
                })
              }
            >
              {/* The preview uses a local data-theme: theme tokens apply even
                  before it becomes the active theme. */}
              <span className="theme-preview" data-theme={th.id}>
                <span className="tp-side" />
                <span className="tp-main">
                  <span className="tp-line tp-kw" />
                  <span className="tp-line tp-str" />
                  <span className="tp-line tp-fn" />
                </span>
                <span className="tp-term" />
              </span>
              <span className="theme-name">{th.label}</span>
              <span className="theme-hint">{tr(th.hint)}</span>
            </button>
          );
        })}
      </div>

      <Row label={tr('theme.accent')} hint={tr('theme.accentHint')}>
        <span className="set-accent">
          <input
            type="color"
            className="set-color"
            aria-label={tr('theme.accent')}
            data-testid="theme-accent"
            value={theme.accent && /^#[0-9a-f]{6}$/i.test(theme.accent) ? theme.accent : '#3884ff'}
            onChange={(e) => void apply({ theme: { accent: e.target.value } })}
          />
          <button
            className="btn"
            data-testid="theme-accent-reset"
            onClick={() => void apply({ theme: { accent: '' } })}
          >
            {tr('common.reset')}
          </button>
        </span>
      </Row>

      {/* Custom background (user request: "can I also edit the background
          whether setting a photo, is that possible?"). The image is NOT copied to the
          data folder - its path is used directly via convertFileSrc so there is no
          duplication of large files and the user can still move their photo. */}
      <Row label={tr('theme.background')} hint={tr('theme.backgroundHint')}>
        <span className="set-bg">
          <button
            className="btn"
            data-testid="theme-bg-pick"
            onClick={async () => {
              try {

                const f = await cmd.fileDialogOpen(false);
                const path = Array.isArray(f) ? f[0] : f;
                if (!path) return;
                const img = await cmd.bgImageRead(path);
                await apply({ background: { image: img.data_url } });
              } catch {
                /* dialog cancelled / permission denied - not an error */
              }
            }}
          >
            {tr('theme.chooseImage')}
          </button>
          <button
            className="btn"
            data-testid="theme-bg-clear"
            onClick={() => void apply({ background: { image: '' } })}
          >
            {tr('common.reset')}
          </button>
        </span>
      </Row>

      {bg.image && (
        <>
          <Row label={tr('theme.strength')} hint={tr('theme.strengthHint')}>
            <span className="set-bg-kekuatan">
              <span className="set-pills" role="radiogroup" aria-label={tr('theme.strengthPreset')} data-testid="theme-bg-preset">
                {([
                  ['theme.strengthFaint', 25],
                  ['theme.strengthMedium', 55],
                  ['theme.strengthClear', 85],
                ] as const).map(([label, val]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={(bg.opacity ?? 55) === val}
                    className={`set-pill${(bg.opacity ?? 55) === val ? ' is-active' : ''}`}
                    data-preset={val}
                    onClick={() => void apply({ background: { opacity: val } })}
                  >
                    {tr(label)}
                  </button>
                ))}
              </span>
              <span className="set-num">
                <input
                  type="range"
                  className="set-range"
                  min={0}
                  max={100}
                  step={1}
                  aria-label={tr('theme.backgroundStrength')}
                  data-testid="theme-bg-opacity"
                  value={bg.opacity ?? 55}
                  onChange={(e) => void apply({ background: { opacity: Number(e.target.value) } })}
                />
                <span className="set-num-val">{bg.opacity ?? 55}%</span>
              </span>
            </span>
          </Row>
          <Row label={tr('theme.fitMode')} hint={tr('theme.fitHint')}>
            <span className="set-pills" role="radiogroup" aria-label={tr('theme.backgroundFitMode')} data-testid="theme-bg-size">
              {(['fill', 'fit', 'center'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={(bg.size ?? 'fill') === m}
                  className={`set-pill${(bg.size ?? 'fill') === m ? ' is-active' : ''}`}
                  data-pill={m}
                  onClick={() => void apply({ background: { size: m } })}
                >
                  {tr(m === 'fill' ? 'theme.fitFill' : m === 'fit' ? 'theme.fitWhole' : 'theme.fitOriginal')}
                </button>
              ))}
            </span>
          </Row>
          <Row label={tr('theme.translucentPanels')} hint={tr('theme.translucentHint')}>
            <Toggle
              checked={bg.transparan !== false}
              onChange={(v) => void apply({ background: { transparan: v } })}
              testid="theme-bg-transparan"
              label={tr('theme.translucentPanels')}
            />
          </Row>
          <p className="set-note" data-testid="theme-bg-info">
            {tr('theme.backgroundActiveInfo')}
          </p>
        </>
      )}

      <p className="set-note" data-testid="theme-active">
        {tr('theme.active')} <code>{document.documentElement.dataset.theme ?? '-'}</code> · {tr('theme.mode')}{' '}
        <code>{general.theme}</code>
      </p>
    </Section>
  );
}
