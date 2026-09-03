// breakpointGutter.ts — gutter breakpoint + highlight baris aktif (fase 22).
//
// Dipisah dari `diagnosticsGutter.ts` (fase 20) karena sumber datanya berbeda
// (debugStore vs problemsStore) dan keduanya harus bisa di-update independen:
// breakpoint berubah saat diklik, diagnostik berubah saat LSP/task selesai.
// Menggabungkannya berarti satu update memaksa yang lain ikut dibangun ulang.
//
// Pola sama seperti fase 20: GutterMarker + Compartment, BUKAN rebuild
// EditorView (rebuild membuang undo history + posisi kursor — pelajaran 13).

import { gutter, GutterMarker, EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { Compartment, RangeSet, StateField, type Extension } from '@codemirror/state';
import type { Breakpoint } from './debugStore';

class BpMarker extends GutterMarker {
  constructor(
    private verified: boolean,
    private enabled: boolean,
    private pesan?: string,
  ) {
    super();
  }

  override toDOM() {
    const el = document.createElement('span');
    // Titik penuh = diverifikasi adapter; lingkaran kosong = belum (sesi mati
    // atau baris tidak bisa dipasangi). Bedanya penting: user perlu tahu
    // breakpoint-nya benar-benar akan kena.
    el.className =
      'cm-bp-marker' +
      (this.verified ? ' is-verified' : '') +
      (this.enabled ? '' : ' is-disabled');
    el.textContent = this.verified ? '●' : '○';
    el.title = this.pesan
      ? `Breakpoint: ${this.pesan}`
      : this.verified
        ? 'Breakpoint aktif'
        : 'Breakpoint (belum diverifikasi adapter)';
    el.setAttribute('data-bp', this.verified ? 'verified' : 'pending');
    return el;
  }
}

export const bpCompartment = new Compartment();
export const barisAktifCompartment = new Compartment();

/**
 * Gutter breakpoint. `onToggle(line)` dipanggil saat gutter diklik.
 *
 * Gutter dipasang SELALU (walau daftar breakpoint kosong) supaya area klik
 * tersedia — kalau hanya dipasang saat ada breakpoint, breakpoint pertama
 * tidak akan pernah bisa dibuat.
 */
export function breakpointGutter(list: Breakpoint[], onToggle: (line: number) => void): Extension {
  const perLine = new Map<number, Breakpoint>();
  for (const b of list) perLine.set(b.line, b);

  return gutter({
    class: 'cm-bp-gutter',
    markers: (view) => {
      if (perLine.size === 0) return RangeSet.empty;
      const total = view.state.doc.lines;
      const ranges = [...perLine.entries()]
        .filter(([line]) => line >= 1 && line <= total)
        .sort((a, b) => a[0] - b[0])
        .map(([line, b]) => {
          const from = view.state.doc.line(line).from;
          return new BpMarker(b.verified, b.enabled, b.message).range(from);
        });
      return RangeSet.of(ranges, true);
    },
    initialSpacer: () => new BpMarker(false, true),
    domEventHandlers: {
      mousedown: (view, blok) => {
        const line = view.state.doc.lineAt(blok.from).number;
        onToggle(line);
        return true;
      },
    },
  });
}

/**
 * Highlight baris yang sedang dieksekusi (kuning, brief fase 22).
 *
 * StateField dipakai (bukan decorations.of langsung) supaya dekorasi ikut
 * dipetakan saat dokumen berubah — tanpa itu, mengedit file saat paused
 * membuat highlight melompat ke baris yang salah.
 */
const barisAktifDeco = Decoration.line({ class: 'cm-baris-aktif' });

export function barisAktifExt(line: number | null): Extension {
  if (line == null || line < 1) return [];
  return StateField.define<DecorationSet>({
    create(state) {
      if (line > state.doc.lines) return Decoration.none;
      return Decoration.set([barisAktifDeco.range(state.doc.line(line).from)]);
    },
    update(deco, tr) {
      return tr.docChanged ? deco.map(tr.changes) : deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}
