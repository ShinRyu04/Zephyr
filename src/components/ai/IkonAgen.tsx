/*
 * One renderer for every agent mark.
 *
 * There were six copies of this SVG before, each written out by hand wherever an
 * agent's icon was needed: the chat picker, the persona row in Settings, the
 * sub-agent row, the sub-agent editor, and a control. They were identical, and
 * every one of them assumed the mark is line art - a `<path d="...">` inside a
 * stroked 16px `<svg>`.
 *
 * That assumption broke the moment Zeph got a real dragon. The dragon is a
 * FILLED gradient shape with no `d`, so those copies all drew `<path d="">`:
 * nothing at all. The row still reserved its space, so it showed as a blank box
 * rather than an obvious hole - which is why it was reported as "the image is
 * empty" instead of "the image is missing". Fixing it in one place fixed the one
 * place someone happened to look, and left the other four waiting.
 *
 * Six copies is the bug. This is the single renderer: callers pass an icon id and
 * a size, and the mark's own definition decides how it is drawn. Adding a mark
 * that needs a different technique means changing this file once, not hunting for
 * every place that draws one.
 */

import DragonIcon from './DragonIcon';
import { ikonSubagent, type IkonDef } from '../../lib/subagentIcons';

export function IkonAgen({ ik, size = 15 }: { ik: IkonDef; size?: number }) {
  /* A mark that draws itself. The dragon is filled and gradient-painted; it
     cannot go through the stroked path below, and passing it an empty `d` would
     render a blank square with no error to notice. */
  if (ik.punyaKomponen) return <DragonIcon size={size} />;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ik.d} />
      {ik.dFill ? <path d={ik.dFill} fill="currentColor" stroke="none" /> : null}
    </svg>
  );
}

/** Same renderer, taking the icon's id instead of its definition. */
export function IkonAgenId({ id, size = 15 }: { id: string | undefined; size?: number }) {
  return <IkonAgen ik={ikonSubagent(id)} size={size} />;
}

export default IkonAgen;
