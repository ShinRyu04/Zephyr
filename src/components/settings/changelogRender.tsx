// changelogRender.tsx — render changelog markdown ringan untuk update notes.
// Mendukung: heading (##/###), list (- / 1.), bold (**x**), inline code (`x`),
// paragraf, dan tabel markdown (| a | b |) dengan header + baris.
// Aman: input dari latest.json / release notes — TIDAK pakai dangerouslySetInnerHTML.

import React from 'react';

function inline(teks: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // bold **x** dulu, lalu inline code `x`
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(teks)) !== null) {
    if (m.index > last) parts.push(teks.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      parts.push(
        <strong key={`${keyBase}-b${i}`}>{tok.slice(2, -2)}</strong>,
      );
    } else {
      parts.push(
        <code key={`${keyBase}-c${i}`}>{tok.slice(1, -1)}</code>,
      );
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < teks.length) parts.push(teks.slice(last));
  return parts;
}

function barisTabel(baris: string, keyBase: string, isHeader: boolean): React.ReactNode {
  const sel = baris
    .split('|')
    .map((s) => s.trim())
    .filter((s, idx, arr) => !(idx === 0 && s === '') && !(idx === arr.length - 1 && s === ''));
  const Tag = isHeader ? 'th' : 'td';
  return (
    <tr key={keyBase}>
      {sel.map((s, i) => (
        <Tag key={`${keyBase}-c${i}`}>{inline(s, `${keyBase}-${i}`)}</Tag>
      ))}
    </tr>
  );
}

/** Render teks changelog (markdown ringan) jadi elemen React. */
export function Changelog({ teks }: { teks: string }) {
  const baris = teks.replace(/\r\n/g, '\n').split('\n');

  const node: React.ReactNode[] = [];
  let i = 0;
  let list: React.ReactNode[] = [];
  let listKey = '';
  let tabel: React.ReactNode[] = [];
  let tabelHeader: React.ReactNode[] = [];
  let tabelAktif = false;

  const flushList = (k: number) => {
    if (list.length > 0) {
      node.push(<ul key={`list-${k}`}>{list}</ul>);
      list = [];
    }
  };
  const flushTabel = (k: number) => {
    if (tabelAktif) {
      node.push(
        <table key={`tab-${k}`} className="upd-tabel">
          <thead>{tabelHeader}</thead>
          <tbody>{tabel}</tbody>
        </table>,
      );
      tabel = [];
      tabelHeader = [];
      tabelAktif = false;
    }
  };

  let k = 0;
  while (i < baris.length) {
    const b = baris[i].trimEnd();
    if (/^\|/.test(b)) {
      const sel = b.split('|').map((s) => s.trim());
      // baris pemisah (|---|) → lewati
      if (/^:?-{2,}:?$/.test(sel.filter((x) => x !== '').join(''))) {
        i++;
        continue;
      }
      if (!tabelAktif) {
        flushList(k);
        tabelAktif = true;
        tabelHeader = [barisTabel(b, `th-${k}`, true)];
      } else {
        tabel.push(barisTabel(b, `td-${k}`, false));
      }
      k++;
      i++;
      continue;
    }
    flushTabel(k);
    const b2 = b.trim();
    if (b2 === '') {
      flushList(k);
      i++;
      continue;
    }
    if (/^#{1,4}\s/.test(b2)) {
      flushList(k);
      const level = b2.match(/^#+/ )![0].length;
      const isi = b2.replace(/^#+\s*/, '');
      if (level === 1) node.push(<h4 key={`h${k}`}>{inline(isi, `h${k}`)}</h4>);
      else if (level === 2) node.push(<h5 key={`h${k}`}>{inline(isi, `h${k}`)}</h5>);
      else node.push(<h6 key={`h${k}`}>{inline(isi, `h${k}`)}</h6>);
      k++;
      i++;
      continue;
    }
    if (/^[-*]\s/.test(b2)) {
      if (listKey !== 'u' + k) {
        flushList(k);
        listKey = 'u' + k;
      }
      list.push(<li key={`li-${k}`}>{inline(b2.replace(/^[-*]\s*/, ''), `li-${k}`)}</li>);
      k++;
      i++;
      continue;
    }
    if (/^\d+[.)]\s/.test(b2)) {
      if (listKey !== 'o' + k) {
        flushList(k);
        listKey = 'o' + k;
      }
      list.push(<li key={`li-${k}`}>{inline(b2.replace(/^\d+[.)]\s*/, ''), `li-${k}`)}</li>);
      k++;
      i++;
      continue;
    }
    flushList(k);
    node.push(<p key={`p-${k}`}>{inline(b2, `p-${k}`)}</p>);
    k++;
    i++;
  }
  flushList(k);
  flushTabel(k);

  return <div className="upd-changelog">{node}</div>;
}