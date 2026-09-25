import { gutter, GutterMarker, EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { Compartment, RangeSet, StateField, type Extension } from '@codemirror/state';
import type { Breakpoint } from './debugStore';
import { tx } from './i18n';

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
    
    el.className =
      'cm-bp-marker' +
      (this.verified ? ' is-verified' : '') +
      (this.enabled ? '' : ' is-disabled');
    el.textContent = this.verified ? '●' : '○';
    el.title = this.pesan
      ? `${tx('Breakpoint')}: ${this.pesan}`
      : this.verified
        ? tx('Breakpoint aktif')
        : tx('Breakpoint (belum diverifikasi adapter)');
    el.setAttribute('data-bp', this.verified ? 'verified' : 'pending');
    return el;
  }
}

export const bpCompartment = new Compartment();
export const barisAktifCompartment = new Compartment();

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
