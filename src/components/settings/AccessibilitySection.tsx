// AccessibilitySection.tsx — Settings → Aksesibilitas (fase 31).
//
// Penamaan kunci mengikuti VS Code (`accessibility.*`) supaya user yang datang
// dari sana menemukan hal yang sama di tempat yang sama.
//
// Yang ditampilkan di sini adalah SETELAN APP. Preferensi OS
// (`prefers-reduced-motion`) tetap dihormati lewat media query di a11y.css —
// baris statusnya menyebut itu supaya user tidak bingung kenapa animasi sudah
// mati padahal toggle-nya off.

import { useStore } from '../../lib/store';
import {
  DEFAULT_A11Y,
  osMintaReducedMotion,
  umumkan,
  type AccessibilitySettings,
} from '../../lib/a11yStore';
import { NumberInput, Row, Toggle } from './SettingsControls';

export default function AccessibilitySection() {
  const settings = useStore((s) => s.settings);
  const applySettings = useStore((s) => s.applySettings);
  const a = { ...DEFAULT_A11Y, ...(settings.accessibility ?? {}) };

  const patch = (p: Partial<AccessibilitySettings>) =>
    void applySettings({ accessibility: { ...a, ...p } });

  const osReduced = osMintaReducedMotion();

  return (
    <div className="set-section" data-testid="set-accessibility">
      <h2 className="set-h2">Aksesibilitas</h2>
      <p className="set-note">
        Zephyr bisa dipakai sepenuhnya dengan keyboard. Tekan <code>Tab</code> dari awal untuk
        melompat langsung ke editor, <code>Ctrl+Shift+P</code> untuk semua perintah. Kontras semua
        tema sudah memenuhi WCAG AA; tema <strong>High Contrast</strong> memenuhi AAA.
      </p>

      <Row
        label="Kurangi animasi"
        hint={
          osReduced
            ? 'Windows sudah meminta animasi dikurangi — animasi mati walau ini off'
            : 'matikan transisi & animasi di dalam Zephyr'
        }
        testid="a11y-row-motion"
      >
        <Toggle
          label="Kurangi animasi"
          testid="a11y-reduced-motion"
          checked={a.reducedMotion}
          onChange={(v) => {
            patch({ reducedMotion: v });
            umumkan(v ? 'Animasi dikurangi' : 'Animasi dinyalakan');
          }}
        />
      </Row>

      <Row
        label="Mode screen reader"
        hint="terminal & editor dioptimalkan untuk Narrator/NVDA (lebih berat)"
        testid="a11y-row-sr"
      >
        <Toggle
          label="Mode screen reader"
          testid="a11y-screen-reader"
          checked={a.screenReader}
          onChange={(v) => {
            patch({ screenReader: v });
            umumkan(v ? 'Mode screen reader aktif' : 'Mode screen reader nonaktif');
          }}
        />
      </Row>

      <Row
        label="Fokus otomatis di dialog"
        hint="pindahkan fokus ke dialog saat dibuka (matikan bila mengganggu)"
        testid="a11y-row-focus"
      >
        <Toggle
          label="Fokus otomatis di dialog"
          testid="a11y-auto-focus"
          checked={a.autoFocusDialog}
          onChange={(v) => patch({ autoFocusDialog: v })}
        />
      </Row>

      <Row
        label="Durasi minimum notifikasi"
        hint="screen reader butuh waktu membacakan; naikkan bila toast terlalu cepat hilang"
        testid="a11y-row-toast"
      >
        <NumberInput
          label="Durasi minimum notifikasi"
          testid="a11y-toast-durasi"
          value={a.toastDurasiMin}
          min={1500}
          max={30000}
          step={500}
          suffix="ms"
          onChange={(v) => patch({ toastDurasiMin: v })}
        />
      </Row>

      <h3 className="set-h2 set-h2-sub">Uji cepat</h3>
      <p className="set-note">
        Tombol ini mengirim pengumuman ke screen reader lewat jalur yang sama dengan notifikasi
        app — kalau Narrator membacakannya, jalur a11y-nya hidup.
      </p>
      <div className="set-row">
        <div className="set-row-control">
          <button
            className="btn btn-sm"
            data-testid="a11y-uji-umumkan"
            onClick={() => umumkan('Pengumuman uji dari Zephyr. Jalur screen reader berfungsi.')}
          >
            Kirim pengumuman uji
          </button>
        </div>
      </div>
    </div>
  );
}
