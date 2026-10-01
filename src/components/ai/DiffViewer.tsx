import { useMemo } from 'react';
import '../../styles/ai-tool-cards.css';

export interface DiffViewerProps {
  text: string;
  maxLines?: number;
  className?: string;
  tr: (text: string) => string;
  tf: (template: string, values: Record<string, string | number>) => string;
}

type DiffKind = 'add' | 'delete' | 'context' | 'hunk' | 'meta';
interface DiffLine {
  kind: DiffKind;
  text: string;
  oldLine?: number;
  newLine?: number;
}

function parseDiff(text: string): { lines: DiffLine[]; additions: number; deletions: number } {
  const source = text.replace(/\r\n?/g, '\n').split('\n');
  const unified = source.some((line) => /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line));
  if (!unified) {
    return {
      lines: source.map((line, index) => ({ kind: 'context', text: line, oldLine: index + 1, newLine: index + 1 })),
      additions: 0,
      deletions: 0,
    };
  }

  const lines: DiffLine[] = [];
  let oldLine: number | undefined;
  let newLine: number | undefined;
  let additions = 0;
  let deletions = 0;

  for (const textLine of source) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(textLine);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      lines.push({ kind: 'hunk', text: textLine });
      continue;
    }
    if (/^(?:diff --git|index |--- |\+\+\+ )/.test(textLine)) {
      lines.push({ kind: 'meta', text: textLine });
      continue;
    }
    if (oldLine == null || newLine == null) {
      lines.push({ kind: 'meta', text: textLine });
      continue;
    }
    if (textLine.startsWith('+')) {
      lines.push({ kind: 'add', text: textLine.slice(1), newLine });
      newLine += 1;
      additions += 1;
    } else if (textLine.startsWith('-')) {
      lines.push({ kind: 'delete', text: textLine.slice(1), oldLine });
      oldLine += 1;
      deletions += 1;
    } else if (textLine.startsWith('\\')) {
      lines.push({ kind: 'meta', text: textLine });
    } else {
      lines.push({ kind: 'context', text: textLine.startsWith(' ') ? textLine.slice(1) : textLine, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    }
  }
  return { lines, additions, deletions };
}

export default function DiffViewer({ text, maxLines = 600, className = '', tr, tf }: DiffViewerProps) {
  const parsed = useMemo(() => parseDiff(text), [text]);
  const requestedLimit = Number.isFinite(maxLines) ? Math.floor(maxLines) : 600;
  const limit = Math.min(2000, Math.max(1, requestedLimit));
  const visible = parsed.lines.slice(0, limit);
  const omitted = parsed.lines.length - visible.length;

  return (
    <figure className={`w4-diff${className ? ` ${className}` : ''}`} aria-label={tr('Code changes')}>
      <figcaption className="w4-diff-head">
        <span>{tr('Changes')}</span>
        <span className="w4-diff-badge is-add">+{parsed.additions}</span>
        <span className="w4-diff-badge is-delete">-{parsed.deletions}</span>
      </figcaption>
      <div className="w4-diff-body">
        {visible.map((line, index) => (
          <div className={`w4-diff-line is-${line.kind}`} key={index}>
            <span className="w4-diff-number">{line.oldLine ?? ''}</span>
            <span className="w4-diff-number">{line.newLine ?? ''}</span>
            <span className="w4-diff-mark" aria-hidden="true">{line.kind === 'add' ? '+' : line.kind === 'delete' ? '-' : ' '}</span>
            <code>{line.text || ' '}</code>
          </div>
        ))}
        {omitted > 0 && <div className="w4-diff-omitted">{tf('{n} more lines not rendered', { n: omitted })}</div>}
      </div>
    </figure>
  );
}
