import { openPath } from '@tauri-apps/plugin-opener';
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
          onClick={() => void openPath(dataDir).catch(() => {})}
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

      <Row label={tr('editor.formatOnSave')} hint={tr('Uses the active language LSP formatter')}>
        <Toggle
          label={tr('editor.formatOnSave')}
          testid="editor-format"
          checked={e.formatOnSave}
          onChange={(v) => patch({ formatOnSave: v })}
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

      {/* ── fase 24: editor extras ──
          Nama kunci sengaja sama dengan VS Code supaya user yang pindah tidak
          perlu belajar nama baru. Yang berat diberi peringatan di hint. */}
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

export function ThemeSection() {
  const tr = useT();
  const theme = useStore((s) => s.settings.theme);

  const bg = useStore((s) => s.settings.background ?? {});
  const general = useStore((s) => s.settings.general);
  const apply = useStore((s) => s.applySettings);

  return (
    <Section title={tr('settings.theme')}>
      <p className="set-note">{tr('A theme changes the UI, editor, and terminal at once. The mode in the General section (light/dark) wins over the choice here - picking a dark theme while in light mode will switch it back to Zephyr Light.')}</p>

      <div className="theme-grid" data-testid="theme-grid">
        {/* semuaTema() = bawaan + tema dari ekstensi aktif (fase 19.5). */}
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
              {/* Preview memakai data-theme lokal: token tema ikut walau
                  belum jadi tema aktif. */}
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

      <Row label={tr('Accent color')} hint={tr('leave empty to use the theme color')}>
        <span className="set-accent">
          <input
            type="color"
            className="set-color"
            aria-label={tr('Accent color')}
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

      {/* Latar belakang kustom (permintaan user: "bisa edit background jga
          ntah pasang foto, apakah bisa?"). Gambar TIDAK disalin ke folder
          data - path-nya dipakai langsung lewat convertFileSrc supaya tidak
          ada duplikasi file besar dan user tetap bisa memindahkan fotonya. */}
      <Row label={tr('Background')} hint={tr('set a photo as the editor background')}>
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
                /* dialog dibatalkan / izin ditolak - bukan error */
              }
            }}
          >
            {tr('Choose an image…')}
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
          <Row label={tr('Strength')} hint={tr('how clearly the image shows through')}>
            <span className="set-bg-kekuatan">
              <span className="set-pills" role="radiogroup" aria-label="Strength preset" data-testid="theme-bg-preset">
                {([
                  ['Faint', 25],
                  ['Medium', 55],
                  ['Clear', 85],
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
                    {label}
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
                  aria-label="Background strength"
                  data-testid="theme-bg-opacity"
                  value={bg.opacity ?? 55}
                  onChange={(e) => void apply({ background: { opacity: Number(e.target.value) } })}
                />
                <span className="set-num-val">{bg.opacity ?? 55}%</span>
              </span>
            </span>
          </Row>
          <Row label={tr('Fit mode')} hint={tr('fill covers fully, fit shows it whole, center is original size')}>
            <span className="set-pills" role="radiogroup" aria-label={tr('Background fit mode')} data-testid="theme-bg-size">
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
                  {m === 'fill' ? 'Full' : m === 'fit' ? 'Whole' : 'Original'}
                </button>
              ))}
            </span>
          </Row>
          <Row label={tr('Translucent panels')} hint={tr('turn off if the text feels hard to read')}>
            <Toggle
              checked={bg.transparan !== false}
              onChange={(v) => void apply({ background: { transparan: v } })}
              testid="theme-bg-transparan"
              label={tr('Translucent panels')}
            />
          </Row>
          <p className="set-note" data-testid="theme-bg-info">
            Background active. Panels are made slightly translucent so the image shows through -
            the text stays over a sufficiently contrasting color.
          </p>
        </>
      )}

      <p className="set-note" data-testid="theme-active">
        {tr('Active theme:')} <code>{document.documentElement.dataset.theme ?? '-'}</code> · {tr('mode')}{' '}
        <code>{general.theme}</code>
      </p>
    </Section>
  );
}
