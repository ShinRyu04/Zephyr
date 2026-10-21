import { type ReactNode } from 'react';
import DiffViewTab from '../ai/DiffViewTab';

/*
 * Diff View di panel kanan — diff perubahan git yang sama dengan tab
 * Diff View di editor (`useGit` membaca dari store jendela ini, yang
 * sudah di-refresh oleh mount `AgentsWindow`).
 */
export default function AgentsPanelKananDiff({ bar }: { bar?: ReactNode | null }) {
  return (
    <>
      {bar}
      <div className="agx-view-isi" data-testid="agx-diff-view">
        <DiffViewTab />
      </div>
    </>
  );
}
