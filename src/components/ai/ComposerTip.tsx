import { memo, useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';

/*
 * The "Tip:" strip at the top of the composer box (Copilot-style).
 *
 * The reference renders one bordered box that wraps THREE things — a tip row,
 * the field, and the toolbar — separated from the field by a hairline. The tip
 * is not decoration: each entry names a real gesture this composer supports
 * (@ to reference files, / for commands, Ctrl+Enter to queue), so the strip
 * teaches the box it sits in. It rotates slowly because a single fixed tip
 * becomes wallpaper within a session.
 *
 * Kept as its own memoised component on purpose: the rotation is a setInterval
 * that would otherwise re-render all ~2500 lines of AiPanel every few seconds
 * for one line of text.
 */
const TIPS = [
  'tip-at',
  'tip-slash',
  'tip-queue',
  'tip-newchat',
] as const;

function ComposerTipInner() {
  const tr = useT();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => (i + 1) % TIPS.length), 7000);
    return () => window.clearInterval(t);
  }, []);

  const tip = TIPS[idx];
  return (
    <div className="ai-tip-strip" data-testid="ai-tip-strip" role="note">
      {/* The bold lead-in is a separate span so the phrase can be translated
          as one unit later without touching the markup. */}
      <b>{tr('Tip:')}</b>
      <span>
        {tip === 'tip-at' && (
          <>
            {tr('type')} <kbd>@</kbd> {tr('to reference files inline')}
          </>
        )}
        {tip === 'tip-slash' && (
          <>
            {tr('type')} <kbd>/</kbd> {tr('for slash commands')}
          </>
        )}
        {tip === 'tip-queue' && (
          <>
            <kbd>Ctrl+Enter</kbd> {tr('adds your message to the queue')}
          </>
        )}
        {tip === 'tip-newchat' && <>{tr('Start a new chat to run another task in parallel')}</>}
      </span>
    </div>
  );
}

const ComposerTip = memo(ComposerTipInner);
export default ComposerTip;
