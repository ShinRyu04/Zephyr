// SettingsPage.tsx — isi halaman Settings (fase 08).
//
// Nav 11 section + tombol "Reset Semua ke Default" TIDAK ada di sini:
// keduanya hidup di sidebar kiri (components/settings/SettingsNav.tsx).
// Halaman ini murni isi section yang sedang dipilih, jadi lebarnya penuh.

import { useEffect } from 'react';
import { useSettingsUi, type SectionId } from '../../lib/settingsStore';
import { EditorSection, GeneralSection, ThemeSection } from './SectionsBasic';
import { AgentsSection, ModelsSection, ShortcutsSection } from './SectionsAdvanced';
import { AboutSection, ExtensionsSection, McpSection, ScmSection, SshSection } from './SectionsMisc';

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
    case 'extensions':
      return <ExtensionsSection />;
    case 'scm':
      return <ScmSection />;
    case 'mcp':
      return <McpSection />;
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

  // Pesan status hilang sendiri supaya tidak menumpuk.
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
