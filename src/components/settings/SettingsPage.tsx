import { useEffect } from 'react';
import { useSettingsUi, type SectionId } from '../../lib/settingsStore';
import { EditorSection, GeneralSection, ThemeSection } from './SectionsBasic';
import { AgentsSection, ShortcutsSection, SubagentSection } from './SectionsAdvanced';
import CommandPermissions from './CommandPermissions';
import RulesSection from './RulesSection';
import { AboutSection, ScmSection, SshSection } from './SectionsMisc';
import { ExtensionsSection } from './SectionsExtensions';
import SectionsLsp from './SectionsLsp';
import AgentCustomPage from './AgentCustomPage';
import SecuritySection from './SecuritySection';
import AccessibilitySection from './AccessibilitySection';
import MemoriPanel from './MemoriPanel';
import DevEnvSettingsSection from './DevEnvSettingsSection';
import { DevUpdateSection } from './DevUpdateSection';
import IkonTemaSection from './IkonTemaSection';

function SectionBody({ id }: { id: SectionId }) {
  switch (id) {
    case 'general':
      return <GeneralSection />;
    case 'editor':
      return <EditorSection />;
    case 'theme':
      return <ThemeSection />;
    case 'icons':
      return <IkonTemaSection />;
    case 'shortcuts':
      return <ShortcutsSection />;
    case 'agents':
      return <AgentsSection />;
    case 'rules':
      return <RulesSection />;
    case 'subagent':
      return <SubagentSection />;
    case 'permissions':
      return <CommandPermissions />;
    case 'extensions':
      return <ExtensionsSection />;
    case 'lsp':
      return <SectionsLsp />;
    case 'scm':
      return <ScmSection />;
    case 'mcp':
      /* MCP bukan section Settings: ia tab di panel Agent Customizations
         (`bukaPanel('agent-custom', 'mcp')`, lihat `mcpStore.ts` `view.mcp`).
         `'mcp'` tetap ada di `SectionId` untuk tautan lama, dan tautan itu
         mendarat di sini - jadi yang ditampilkan adalah tab MCP yang sama,
         bukan halaman kosong. */
      return <AgentCustomPage seksiAwal="mcp" />;
    case 'devenv':
      return <DevEnvSettingsSection />;
    case 'devupdate':
      // The panel's Rust commands are cfg(debug_assertions)-only, so in a
      // release build it could only render a dead UI. Hide it instead: this
      // panel is what let a release install swap itself for a debug binary.
      return import.meta.env.DEV ? <DevUpdateSection /> : null;
    case 'security':
      return <SecuritySection />;
    case 'accessibility':
      return <AccessibilitySection />;
    case 'ssh':
      return <SshSection />;
    case 'memori':
      return <MemoriPanel />;
    case 'about':
      return <AboutSection />;
  }
}

export default function SettingsPage() {
  const section = useSettingsUi((s) => s.section);
  const message = useSettingsUi((s) => s.message);
  const setMessage = useSettingsUi((s) => s.setMessage);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(id);
  }, [message, setMessage]);

  return (
    <div className="settings-page" data-testid="settings-page">
      <div className="set-body">
        {message && (
          <div className="set-toast" data-testid="set-message" role="status">
            {message}
          </div>
        )}
        <SectionBody id={section} />
      </div>
    </div>
  );
}
