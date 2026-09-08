// SectionsBasic.tsx — section General, Code Editor, Theme (fase 08).

import { openPath } from '@tauri-apps/plugin-opener';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { semuaTema } from '../../lib/themes';
import { NumberInput, Pills, Row, Section, Select, TextInput, Toggle } from './SettingsControls';

export function GeneralSection() {
  const t = useT();
  const g = useStore((s) => s.settings.general);
  const apply = useStore((s) => s.applySettings);
  const dataDir = useStore((s) => s.appInfo?.dataDir ?? '');

  const patch = (p: Partial<typeof g>) => void apply({ general: p });

  return (
    <Section title={t('settings.general')}>
      <Row label={t('general.theme')} hint="mode terang/gelap; tema spesifik di section Tema">
        <Pills
          label={t('general.theme')}
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

      <Row label={t('general.font')} hint="dipakai editor & terminal">
        <TextInput
          label={t('general.font')}
          testid="general-font"
          mono
          value={g.fontFamily}
          onChange={(v) => patch({ fontFamily: v })}
        />
      </Row>

      <Row label={t('general.fontSize')} testid="row-fontsize">
        <NumberInput
          label={t('general.fontSize')}
          testid="general-fontsize"
          min={10}
          max={24}
          value={g.fontSize}
          onChange={(v) => patch({ fontSize: v })}
          suffix="px"
        />
      </Row>

      <Row label={t('general.lineHeight')}>
        <NumberInput
          label={t('general.lineHeight')}
          testid="general-lineheight"
          min={1.2}
          max={2}
          step={0.1}
          value={g.lineHeight}
          onChange={(v) => patch({ lineHeight: v })}
        />
      </Row>

      <Row label={t('general.uiLang')} hint="label utama saja, bukan seluruh teks">
        <Pills
          label={t('general.uiLang')}
          testid="general-lang"
          value={g.uiLang}
          onChange={(v) => patch({ uiLang: v as typeof g.uiLang })}
          options={[
            { value: 'id', label: 'Indonesia' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Row>

      <Row label={t('general.zoom')} hint="Ctrl+= / Ctrl+- / Ctrl+0">
        <NumberInput
          label={t('general.zoom')}
          testid="general-zoom"
          min={50}
          max={200}
          step={10}
          value={g.zoom}
          onChange={(v) => patch({ zoom: v })}
          suffix="%"
        />
      </Row>

      <Row label={t('general.restoreSession')}>
        <Toggle
          label={t('general.restoreSession')}
          testid="general-restore"
          checked={g.restoreSession}
          onChange={(v) => patch({ restoreSession: v })}
        />
      </Row>

      <Row label={t('general.checkUpdates')} hint="tidak ada telemetri; hanya cek versi rilis">
        <Toggle
          label={t('general.checkUpdates')}
          testid="general-updates"
          checked={g.checkUpdates}
          onChange={(v) => patch({ checkUpdates: v })}
        />
      </Row>

      <Row
        label="Mode penghemat RAM"
        hint="smooth scroll off, minimap dipaksa off, batas tab termuat 8 (dari 12)"
      >
        <Toggle
          label="Mode penghemat RAM"
          testid="general-lowram"
          checked={g.lowRam === true}
          onChange={(v) => patch({ lowRam: v })}
        />
      </Row>

      <Row label={t('general.openDataFolder')} hint={dataDir || '%APPDATA%\\zephyr'}>
        <button
          className="btn"
          data-testid="general-open-data"
          onClick={() => void openPath(dataDir).catch(() => {})}
        >
          {t('general.openDataFolder')}
        </button>
      </Row>
    </Section>
  );
}

export function EditorSection() {
  const t = useT();
  const e = useStore((s) => s.settings.editor);
  const apply = useStore((s) => s.applySettings);
  const patch = (p: Partial<typeof e>) => void apply({ editor: p });

  return (
    <Section title={t('settings.editor')}>
      <Row label={t('editor.tabSize')}>
        <NumberInput
          label={t('editor.tabSize')}
          testid="editor-tabsize"
          min={1}
          max={8}
          value={e.tabSize}
          onChange={(v) => patch({ tabSize: v })}
        />
      </Row>

      <Row label={t('editor.insertSpaces')}>
        <Toggle
          label={t('editor.insertSpaces')}
          testid="editor-spaces"
          checked={e.insertSpaces}
          onChange={(v) => patch({ insertSpaces: v })}
        />
      </Row>

      <Row label={t('editor.wordWrap')}>
        <Toggle
          label={t('editor.wordWrap')}
          testid="editor-wrap"
          checked={e.wordWrap}
          onChange={(v) => patch({ wordWrap: v })}
        />
      </Row>

      <Row label={t('editor.minimap')} hint="mati secara default demi RAM">
        <Toggle
          label={t('editor.minimap')}
          testid="editor-minimap"
          checked={e.minimap}
          onChange={(v) => patch({ minimap: v })}
        />
      </Row>

      <Row label={t('editor.cursorStyle')}>
        <Select
          label={t('editor.cursorStyle')}
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
        label={t('editor.snippetSuggestions')}
        hint="posisi saran snippet di daftar completion"
      >
        <Select
          label={t('editor.snippetSuggestions')}
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

      <Row label={t('editor.smoothScroll')} hint="lebih halus, sedikit lebih berat">
        <Toggle
          label={t('editor.smoothScroll')}
          testid="editor-smooth"
          checked={e.smoothScroll}
          onChange={(v) => patch({ smoothScroll: v })}
        />
      </Row>

      <Row label={t('editor.formatOnSave')} hint="formatter per bahasa menyusul">
        <Toggle
          label={t('editor.formatOnSave')}
          testid="editor-format"
          checked={e.formatOnSave}
          onChange={(v) => patch({ formatOnSave: v })}
        />
      </Row>

      <Row label={t('editor.showWhitespace')} hint="titik untuk spasi, panah untuk tab">
        <Toggle
          label={t('editor.showWhitespace')}
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

      <Row label={t('editor.breadcrumbs')} hint="jalur folder + simbol dari language server">
        <Toggle
          label={t('editor.breadcrumbs')}
          testid="editor-breadcrumbs"
          checked={e.breadcrumbs}
          onChange={(v) => patch({ breadcrumbs: v })}
        />
      </Row>

      <Row label={t('editor.stickyScroll')} hint="baris function/class menempel saat scroll">
        <Toggle
          label={t('editor.stickyScroll')}
          testid="editor-sticky"
          checked={e.stickyScroll}
          onChange={(v) => patch({ stickyScroll: v })}
        />
      </Row>

      <Row label={t('editor.stickyScrollMaxLines')} hint="berapa baris header ditumpuk">
        <NumberInput
          label={t('editor.stickyScrollMaxLines')}
          testid="editor-sticky-max"
          min={1}
          max={10}
          value={e.stickyScrollMaxLines}
          onChange={(v) => patch({ stickyScrollMaxLines: v })}
        />
      </Row>

      <Row
        label={t('editor.minimapRenderCharacters')}
        hint="gambar teks asli, bukan blok warna — jauh lebih berat"
      >
        <Toggle
          label={t('editor.minimapRenderCharacters')}
          testid="editor-minimap-chars"
          checked={e.minimapRenderCharacters}
          onChange={(v) => patch({ minimapRenderCharacters: v })}
        />
      </Row>

      <Row label={t('editor.indentGuides')} hint="garis indentasi + indent aktif">
        <Toggle
          label={t('editor.indentGuides')}
          testid="editor-indent-guides"
          checked={e.indentGuides}
          onChange={(v) => patch({ indentGuides: v })}
        />
      </Row>

      <Row label={t('editor.colorDecorators')} hint="swatch #hex/rgb()/hsl(), klik untuk picker">
        <Toggle
          label={t('editor.colorDecorators')}
          testid="editor-color-dec"
          checked={e.colorDecorators}
          onChange={(v) => patch({ colorDecorators: v })}
        />
      </Row>

      <Row label={t('editor.unicodeHighlight')} hint="tandai karakter ambigu & tak terlihat">
        <Toggle
          label={t('editor.unicodeHighlight')}
          testid="editor-unicode"
          checked={e.unicodeHighlight}
          onChange={(v) => patch({ unicodeHighlight: v })}
        />
      </Row>

      <Row label={t('editor.bracketPairColorization')} hint="warna bracket per kedalaman">
        <Toggle
          label={t('editor.bracketPairColorization')}
          testid="editor-bracket-color"
          checked={e.bracketPairColorization}
          onChange={(v) => patch({ bracketPairColorization: v })}
        />
      </Row>
    </Section>
  );
}

export function ThemeSection() {
  const t = useT();
  const theme = useStore((s) => s.settings.theme);
  const general = useStore((s) => s.settings.general);
  const apply = useStore((s) => s.applySettings);

  return (
    <Section title={t('settings.theme')}>
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
                  // Sinkronkan mode supaya tidak saling menimpa.
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
            {t('common.reset')}
          </button>
        </span>
      </Row>

      <p className="set-note" data-testid="theme-active">
        Tema aktif: <code>{document.documentElement.dataset.theme ?? '-'}</code> · mode{' '}
        <code>{general.theme}</code>
      </p>
    </Section>
  );
}
