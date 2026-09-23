import { gutter, GutterMarker } from '@codemirror/view';
import { Compartment, RangeSet, type Extension } from '@codemirror/state';
import type { Diagnostic } from './problemsStore';

class DiagMarker extends GutterMarker {
  constructor(private severity: Diagnostic['severity']) {
    super();
  }

  override toDOM() {
    const el = document.createElement('span');
    el.className = `cm-diag-marker is-${this.severity}`;
    el.textContent = this.severity === 'error' ? '⊗' : this.severity === 'warning' ? '⚠' : 'ⓘ';
    el.title = this.severity;
    return el;
  }
}

const MARKERS = {
  error: new DiagMarker('error'),
  warning: new DiagMarker('warning'),
  info: new DiagMarker('info'),
  hint: new DiagMarker('hint'),
};

const RANK: Record<Diagnostic['severity'], number> = { error: 0, warning: 1, info: 2, hint: 3 };

export const diagCompartment = new Compartment();

export function diagnosticsGutter(list: Diagnostic[], docLines: number): Extension {
  if (list.length === 0) return [];

  const perLine = new Map<number, Diagnostic['severity']>();
  for (const d of list) {
    if (d.line < 1 || d.line > docLines) continue;
    const ada = perLine.get(d.line);
    if (!ada || RANK[d.severity] < RANK[ada]) perLine.set(d.line, d.severity);
  }
  if (perLine.size === 0) return [];

  return gutter({
    class: 'cm-diag-gutter',
    markers: (view) => {
      const ranges = [...perLine.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([line, sev]) => {
          const from = view.state.doc.line(line).from;
          return MARKERS[sev].range(from);
        });
      return RangeSet.of(ranges, true);
    },
    initialSpacer: () => MARKERS.error,
  });
}
