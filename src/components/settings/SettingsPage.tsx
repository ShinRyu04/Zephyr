import { useEffect } from 'react';
import { useSettingsUi, type SectionId } from '../../lib/settingsStore';
import { EditorSection, GeneralSection, ThemeSection } from './SectionsBasic';
import { AgentsSection, ModelsSection, ShortcutsSection, SubagentSection } from './SectionsAdvanced';
import PromptSection from './PromptSection';
import { AboutSection, ScmSection, SshSection } from './SectionsMisc';
import { ExtensionsSection } from './SectionsExtensions';
import SectionsLsp from './SectionsLsp';
import McpPanel from './McpPanel';
import SecuritySection from './SecuritySection';
import AccessibilitySection from './AccessibilitySection';

function SectionBody({ id }: { id: SectionId }) {
  switch (id) {
    case 'general':
      return <GeneralSection />;
    case 'editor':
      return <EditorSection />;
    case 'theme':
      return <ThemeSection />;
    case 'shortcuts':
      return <ShortcutsSection />;
    case 'models':
      return <ModelsSection />;
    case 'agents':
      return <AgentsSection />;
    case 'subagent':
      return <SubagentSection />;
    case 'aiprompt':
      return <PromptSection />;
    case 'extensions':
      return <ExtensionsSection />;
    case 'lsp':
      return <SectionsLsp />;
    case 'scm':
      return <ScmSection />;
    case 'mcp':
      return <McpPanel />;
    case 'security':
      return <SecuritySection />;
    case 'accessibility':
      return <AccessibilitySection />;
    case 'ssh':
      return <SshSection />;
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
