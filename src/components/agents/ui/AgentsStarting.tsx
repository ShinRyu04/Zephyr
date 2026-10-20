import { useState } from 'react';
import { AgentsIcon, type AgentsIconName } from './AgentsIcon';
import { AgentsComposer } from './AgentsComposer';

/**
 * The Agents starting screen: heading, composer, then four category cards.
 *
 * The order matters and is the part that is easy to get wrong. Heading → composer
 * → cards, top to bottom, one centred column. Cards ABOVE the field make the
 * screen read as a menu; cards below it make it read as a place to type with
 * suggestions under it, which is what the reference does.
 *
 * Clicking a card FILLS the composer instead of sending. The user gets to edit
 * the prompt before it goes anywhere — a card that sent immediately would take
 * that choice away and make the first message a guess.
 *
 * There is no tagline between the heading and the field: it was a line of
 * marketing copy that added a third block of text above the composer without
 * telling the reader anything to do.
 */
const CATEGORIES: { id: string; label: string; icon: AgentsIconName; prompt: string }[] = [
  {
    id: 'app',
    label: 'Application Development',
    icon: 'wrench',
    prompt: 'Build a small feature end to end: plan it, implement it, then verify it runs.',
  },
  {
    id: 'project',
    label: 'Project Understanding',
    icon: 'map',
    prompt: 'Map how this repository is put together: the entry points, the main modules, and how data flows between them.',
  },
  {
    id: 'game',
    label: 'Game Creativity',
    icon: 'spark',
    prompt: 'Prototype a small playable game idea and show me how to run it.',
  },
  {
    id: 'automation',
    label: 'Automation Tools',
    icon: 'bolt',
    prompt: 'Find the most repetitive manual step in this project and script it.',
  },
];

export function AgentsStarting({ composerId }: { composerId: string }) {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="agx-starting" data-testid="agx-starting">
      <h1 className="agx-heading" data-testid="agx-heading" style={{ marginBottom: 12 }}>
        Build with Zephyr
      </h1>
      <p className="agx-sub" data-testid="agx-sub" style={{ marginBottom: 43 }}>
        More than writing every line of code — delivering production-grade results end-to-end.
      </p>

      <AgentsComposer composerId={composerId} variant="centered" />

      <div className="agx-cards" data-testid="agx-cards" style={{ marginTop: 32 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className="agx-card"
            data-testid={`agx-card-${c.id}`}
            onClick={() => setPicked(c.prompt)}
          >
            <span className="agx-card-icon" style={{ width: 14, height: 14 }}>
              <AgentsIcon name={c.icon} size={14} />
            </span>
            <span className="agx-card-label">{c.label}</span>
          </button>
        ))}
      </div>

      {/*
        * The picked prompt is handed to the composer through a tiny custom event
        * rather than by lifting the draft into this component: the draft already
        * lives in the AI store keyed by composer id, and a second copy here would
        * be two sources of truth for the same string.
        */}
      {picked && <PickBridge composerId={composerId} text={picked} onDone={() => setPicked(null)} />}
    </div>
  );
}

function PickBridge({ composerId, text, onDone }: { composerId: string; text: string; onDone: () => void }) {
  // Runs during render commit: write the draft, then clear the flag.
  if (typeof window !== 'undefined') {
    void import('../../../lib/aiStore').then((m) => {
      m.useAi.getState().setDraft(text, composerId);
      onDone();
    });
  }
  return null;
}
