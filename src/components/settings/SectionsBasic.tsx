import { openPath } from '@tauri-apps/plugin-opener';
import * as cmd from '../../lib/commands';
import { useStore } from '../../lib/store';
import { useT, UI_LANGS } from '../../lib/i18n';
import { semuaTema } from '../../lib/themes';
import { NumberInput, Pills, Row, Section, Select, TextInput, Toggle } from './SettingsControls';

export function GeneralSection() {
  const tr = useT();
  const g = useStore((s) => s.settings.general);
  const apply = useStore((s) => s.applySettings);
  const dataDir = useStore((s) => s.appInfo?.dataDir ?? '');

  const patch = (p: Partial<typeof g>) => void apply({ general: p });

  return (
    <Section title={tr('settings.general')}>
      <Row label={tr('general.theme')} hint="mode terang/gelap; tema spesifik di section Tema">
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

      <Row label={tr('general.font')} hint="dipakai editor & terminal">
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

      <Row label={tr('general.uiLang')} hint="label utama saja, bukan seluruh teks">
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

      <Row label={tr('general.checkUpdates')} hint="tidak ada telemetri; hanya cek versi rilis">
        <Toggle
          label={tr('general.checkUpdates')}
          testid="general-updates"
          checked={g.checkUpdates}
          onChange={(v) => patch({ checkUpdates: v })}
        />
      </Row>

      <Row
        label="Mode penghemat RAM"
        hint="smooth scroll off, minimap dipaksa off, batas tab termuat 4 (dari 12), scrollback terminal 2000 baris"
      >
        <Toggle
          label="Mode penghemat RAM"
          testid="general-lowram"
          checked={g.lowRam === true}
          onChange={(v) => patch({ lowRam: v })}
        />
      </Row>

      <Row
        label="Tempat panel AI"
        hint="bawah = sejajar terminal; kanan = kolom 340px ala VS Code"
      >
        <select
          className="inp"
          data-testid="general-ai-panel"
          aria-label="Tempat panel AI"
          value={g.aiPanel ?? 'bottom'}
          onChange={async (e) => {
            const nilai = e.target.value as 'bottom' | 'right';
            patch({ aiPanel: nilai });

            if (nilai === 'right') {
              const { useTerminal } = await import('../../lib/terminalStore');
              useTerminal.getState().setVisible(false);
            }
          }}
        >
          <option value="bottom">Bawah (sejajar terminal)</option>
          <option value="right">Kanan (340px)</option>
        </select>
      </Row>

      <Row
        label="Tata letak utama"
        hint="editor = editor besar dengan terminal dock bawah; terminal = terminal jadi area utama, editor jadi pane samping"
      >
        <select
          className="inp"
          data-testid="general-layout"
          aria-label="Tata letak utama"
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

      <Row label={tr('editor.minimap')} hint="mati secara default demi RAM">
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
        hint="posisi saran snippet di daftar completion"
      >
        <Select
          label={tr('editor.snippetSuggestions')}
          testid="editor-snippet-sug"
          value={e.snippetSuggestions}
          onChange={(v) => patch({ snippetSuggestions: v as typeof e.snippetSuggestions })}
          options={[
            { value: 'inline', label: 'Inline (campur, urut relevansi)' },
            { value: 'top', label: 'Atas' },
            { value: 'bottom', label: 'Bawah' },
            { value: 'none', label: 'Matikan' },
          ]}
        />
      </Row>

      <Row
        label="Ghost text (saran AI inline)"
        hint="Alt+\ minta saran, Tab pakai, Esc buang — tiap saran = 1 panggilan API berbayar"
      >
        <Toggle
          label="Ghost text"
          testid="editor-ghost"
          checked={e.ghostText}
          onChange={(v) => patch({ ghostText: v })}
        />
      </Row>

      <Row label={tr('editor.smoothScroll')} hint="lebih halus, sedikit lebih berat">
        <Toggle
          label={tr('editor.smoothScroll')}
          testid="editor-smooth"
          checked={e.smoothScroll}
          onChange={(v) => patch({ smoothScroll: v })}
        />
      </Row>

      <Row label={tr('editor.formatOnSave')} hint={tr('Memakai formatter LSP bahasa yang aktif')}>
        <Toggle
          label={tr('editor.formatOnSave')}
          testid="editor-format"
          checked={e.formatOnSave}
          onChange={(v) => patch({ formatOnSave: v })}
        />
      </Row>

      <Row label={tr('editor.showWhitespace')} hint="titik untuk spasi, panah untuk tab">
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
        Kenyamanan editor di bawah ini bisa dimatikan satu per satu. Semuanya
        juga ada di menu View → Appearance.
      </p>

      <Row label={tr('editor.breadcrumbs')} hint="jalur folder + simbol dari language server">
        <Toggle
          label={tr('editor.breadcrumbs')}
          testid="editor-breadcrumbs"
          checked={e.breadcrumbs}
          onChange={(v) => patch({ breadcrumbs: v })}
        />
      </Row>

      <Row label={tr('editor.stickyScroll')} hint="baris function/class menempel saat scroll">
        <Toggle
          label={tr('editor.stickyScroll')}
          testid="editor-sticky"
          checked={e.stickyScroll}
          onChange={(v) => patch({ stickyScroll: v })}
        />
      </Row>

      <Row label={tr('editor.stickyScrollMaxLines')} hint="berapa baris header ditumpuk">
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
        hint="gambar teks asli, bukan blok warna — jauh lebih berat"
      >
        <Toggle
          label={tr('editor.minimapRenderCharacters')}
          testid="editor-minimap-chars"
          checked={e.minimapRenderCharacters}
          onChange={(v) => patch({ minimapRenderCharacters: v })}
        />
      </Row>

      <Row label={tr('editor.indentGuides')} hint="garis indentasi + indent aktif">
        <Toggle
          label={tr('editor.indentGuides')}
          testid="editor-indent-guides"
          checked={e.indentGuides}
          onChange={(v) => patch({ indentGuides: v })}
        />
      </Row>

      <Row label={tr('editor.colorDecorators')} hint="swatch #hex/rgb()/hsl(), klik untuk picker">
        <Toggle
          label={tr('editor.colorDecorators')}
          testid="editor-color-dec"
          checked={e.colorDecorators}
          onChange={(v) => patch({ colorDecorators: v })}
        />
      </Row>

      <Row label={tr('editor.unicodeHighlight')} hint="tandai karakter ambigu & tak terlihat">
        <Toggle
          label={tr('editor.unicodeHighlight')}
          testid="editor-unicode"
          checked={e.unicodeHighlight}
          onChange={(v) => patch({ unicodeHighlight: v })}
        />
      </Row>

      <Row label={tr('editor.bracketPairColorization')} hint="warna bracket per kedalaman">
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
      <p className="set-note">
        Tema mengubah UI, editor, dan terminal sekaligus. Mode di section Umum
        (terang/gelap) menang atas pilihan di sini — memilih tema gelap saat
        mode terang akan mengembalikannya ke Zephyr Light.
      </p>

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
              <span className="theme-hint">{th.hint}</span>
            </button>
          );
        })}
      </div>

      <Row label="Warna aksen" hint="kosongkan untuk memakai warna tema">
        <span className="set-accent">
          <input
            type="color"
            className="set-color"
            aria-label="Warna aksen"
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
          data — path-nya dipakai langsung lewat convertFileSrc supaya tidak
          ada duplikasi file besar dan user tetap bisa memindahkan fotonya. */}
      <Row label="Latar belakang" hint="pasang foto jadi background editor">
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
                /* dialog dibatalkan / izin ditolak — bukan error */
              }
            }}
          >
            Pilih gambar…
          </button>
          <button
            className="btn"
            data-testid="theme-bg-clear"
            disabled={!bg.image}
            onClick={() => void apply({ background: { image: '' } })}
          >
            {tr('common.reset')}
          </button>
        </span>
      </Row>

      {bg.image && (
        <>
          <Row label="Kekuatan" hint="seberapa jelas gambar terlihat">
            <span className="set-bg-kekuatan">
              <span className="set-pills" role="radiogroup" aria-label="Preset kekuatan" data-testid="theme-bg-preset">
                {([
                  ['Samar', 25],
                  ['Sedang', 55],
                  ['Jelas', 85],
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
                  aria-label="Kekuatan latar"
                  data-testid="theme-bg-opacity"
                  value={bg.opacity ?? 55}
                  onChange={(e) => void apply({ background: { opacity: Number(e.target.value) } })}
                />
                <span className="set-num-val">{bg.opacity ?? 55}%</span>
              </span>
            </span>
          </Row>
          <Row label="Cara pasang" hint="fill menutupi penuh, fit utuh, center asli">
            <span className="set-pills" role="radiogroup" aria-label="Cara pasang latar" data-testid="theme-bg-size">
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
                  {m === 'fill' ? 'Penuh' : m === 'fit' ? 'Utuh' : 'Asli'}
                </button>
              ))}
            </span>
          </Row>
          <Row label="Panel tembus pandang" hint="matikan bila teks terasa kurang jelas">
            <Toggle
              checked={bg.transparan !== false}
              onChange={(v) => void apply({ background: { transparan: v } })}
              testid="theme-bg-transparan"
              label="Panel tembus pandang"
            />
          </Row>
          <p className="set-note" data-testid="theme-bg-info">
            Latar aktif. Panel dibuat sedikit tembus pandang supaya gambar terlihat —
            teks tetap di atas warna yang cukup kontras.
          </p>
        </>
      )}

      <p className="set-note" data-testid="theme-active">
        Tema aktif: <code>{document.documentElement.dataset.theme ?? '-'}</code> · mode{' '}
        <code>{general.theme}</code>
      </p>
    </Section>
  );
}
