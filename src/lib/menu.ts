// menu.ts — struktur menu bar (fase 18.1).
//
// Menu HANYA menunjuk commandId. Kalau command-nya tidak ada di
// commandRegistry, item tetap TAMPIL tapi DISABLED — itu keputusan sadar dari
// 18.1: user melihat fitur apa yang direncanakan, bukan menu yang berubah-ubah
// isinya. Tidak ada jalur aksi kedua di luar COMMANDS (18.5).
//
// Accelerator TIDAK ditulis di sini. Menu bar mengambilnya dari
// keybindingStore, jadi remap user langsung terlihat di label menu (V7).

export interface MenuItem {
  /** '-' = pemisah */
  kind?: 'sep';
  label?: string;
  command?: string;
  /** submenu (mis. View → Appearance) */
  children?: MenuItem[];
}

export interface MenuDef {
  /** label menu; huruf setelah '&' jadi mnemonic (Alt+huruf) */
  label: string;
  /** huruf mnemonic tanpa '&' */
  mnemonic: string;
  items: MenuItem[];
}

const SEP: MenuItem = { kind: 'sep' };

export const MENUS: MenuDef[] = [
  {
    label: 'File',
    mnemonic: 'f',
    items: [
      { label: 'New File', command: 'file.new' },
      { label: 'New Window', command: 'window.new' },
      { label: 'Open File…', command: 'file.open' },
      { label: 'Open Folder…', command: 'file.openFolder' },
      SEP,
      // fase 29: multi-root workspace. Ditempatkan di menu File karena itu
      // tempat semua operasi "buka/simpan sesuatu" berada.
      { label: 'Add Folder to Workspace…', command: 'workspace.addFolder' },
      { label: 'Remove Folder from Workspace', command: 'workspace.removeFolder' },
      { label: 'Open Workspace from File…', command: 'workspace.openFile' },
      { label: 'Save Workspace As…', command: 'workspace.saveAs' },
      { label: 'Manage Workspace Trust', command: 'workspace.manageTrust' },
      SEP,
      { label: 'Save', command: 'file.save' },
      { label: 'Save As…', command: 'file.saveAs' },
      { label: 'Save All', command: 'file.saveAll' },
      SEP,
      { label: 'Close Editor', command: 'file.closeTab' },
      { label: 'Close All Editors', command: 'editor.closeAll' },
      { label: 'Close Folder', command: 'explorer.closeFolder' },
      { label: 'Reopen Closed Editor', command: 'editor.reopen' },
      SEP,
      { label: 'Exit', command: 'window.close' },
    ],
  },
  {
    label: 'Edit',
    mnemonic: 'e',
    items: [
      { label: 'Undo', command: 'editor.undo' },
      { label: 'Redo', command: 'editor.redo' },
      SEP,
      { label: 'Cut', command: 'editor.clip.cut' },
      { label: 'Copy', command: 'editor.clip.copy' },
      { label: 'Paste', command: 'editor.clip.paste' },
      SEP,
      { label: 'Find', command: 'edit.find' },
      { label: 'Replace', command: 'edit.replace' },
      { label: 'Find in Files', command: 'edit.findInFiles' },
      SEP,
      { label: 'Toggle Line Comment', command: 'editor.comment.toggle' },
      { label: 'Toggle Block Comment', command: 'editor.blockComment.toggle' },
      { label: 'Format Document', command: 'editor.formatDocument' },
    ],
  },
  {
    label: 'Selection',
    mnemonic: 's',
    items: [
      { label: 'Select All', command: 'editor.selectAll' },
      { label: 'Expand Selection', command: 'editor.select.expand' },
      { label: 'Shrink Selection', command: 'editor.select.shrink' },
      SEP,
      { label: 'Add Cursor Above', command: 'editor.cursor.above' },
      { label: 'Add Cursor Below', command: 'editor.cursor.below' },
      { label: 'Add Cursor to Line Ends', command: 'editor.cursor.lineEnds' },
      { label: 'Select Current Line', command: 'editor.select.line' },
      { label: 'Select All Occurrences', command: 'editor.select.occurrences' },
    ],
  },
  {
    label: 'View',
    mnemonic: 'v',
    items: [
      { label: 'Command Palette…', command: 'view.palette' },
      { label: 'Quick Open File…', command: 'view.quickOpen' },
      SEP,
      {
        label: 'Appearance',
        children: [
          { label: 'Toggle Full Screen', command: 'window.fullscreen' },
          { label: 'Zoom In', command: 'view.zoomIn' },
          { label: 'Zoom Out', command: 'view.zoomOut' },
          { label: 'Reset Zoom', command: 'view.zoomReset' },
          { label: 'Toggle Word Wrap', command: 'editor.wordWrap.toggle' },
          SEP,
          // fase 24: editor extras — semuanya toggle yang tersimpan ke settings.
          { label: 'Show Breadcrumbs', command: 'editor.breadcrumbs.toggle' },
          { label: 'Show Sticky Scroll', command: 'editor.stickyScroll.toggle' },
          { label: 'Show Minimap', command: 'editor.minimap.toggle' },
          { label: 'Show Indent Guides', command: 'editor.indentGuides.toggle' },
          { label: 'Show Color Decorators', command: 'editor.colorDecorators.toggle' },
          { label: 'Highlight Ambiguous Unicode', command: 'editor.unicodeHighlight.toggle' },
          {
            label: 'Bracket Pair Colorization',
            command: 'editor.bracketPairColorization.toggle',
          },
        ],
      },
      {
        label: 'Theme',
        children: [
          { label: 'Zephyr Dark', command: 'theme.zephyr-dark' },
          { label: 'Zephyr Light', command: 'theme.zephyr-light' },
          { label: 'Nord', command: 'theme.nord' },
          { label: 'Tokyo Night', command: 'theme.tokyo-night' },
          { label: 'Gruvbox', command: 'theme.gruvbox' },
          { label: 'One Dark Pro', command: 'theme.one-dark-pro' },
        ],
      },
      SEP,
      { label: 'Toggle Sidebar', command: 'view.sidebar' },
      { label: 'Move Sidebar Right', command: 'view.sidebarRight' },
      { label: 'Move Sidebar Left', command: 'view.sidebarLeft' },
      { label: 'Toggle Panel', command: 'workbench.action.togglePanel' },
      { label: 'Toggle Maximized Panel', command: 'workbench.action.toggleMaximizedPanel' },
      { label: 'Toggle Terminal', command: 'terminalPanel.focus' },
      SEP,
      // fase 33: layout editor
      { label: 'Split Editor Right', command: 'view.splitEditorRight' },
      { label: 'Join Editor Groups', command: 'view.joinEditorGroups' },
      SEP,
      { label: 'Explorer', command: 'view.explorer' },
      { label: 'Search', command: 'edit.findInFiles' },
      { label: 'Source Control', command: 'git.panel' },
      { label: 'AI Panel', command: 'ai.panel' },
      { label: 'Extensions', command: 'extensions.focus' },
      { label: 'Problems', command: 'problemsPanel.focus' },
      { label: 'Output', command: 'outputPanel.focus' },
      { label: 'Debug Console', command: 'debugConsolePanel.focus' },
      { label: 'Ports', command: 'portsPanel.focus' },
      SEP,
      { label: 'Notifications', command: 'notifications.show' },
    ],
  },
  {
    label: 'Go',
    mnemonic: 'g',
    items: [
      { label: 'Back', command: 'nav.back' },
      { label: 'Forward', command: 'nav.forward' },
      SEP,
      { label: 'Go to File…', command: 'view.quickOpen' },
      { label: 'Go to Line…', command: 'editor.gotoLine' },
      { label: 'Go to Symbol…', command: 'editor.gotoSymbol' },
      { label: 'Go to Definition', command: 'editor.gotoDefinition' },
      { label: 'Find All References', command: 'editor.findReferences' },
      SEP,
      { label: 'Next Problem', command: 'editor.nextError' },
      { label: 'Previous Problem', command: 'editor.prevError' },
      SEP,
      { label: 'Next Editor Tab', command: 'view.nextTab' },
      { label: 'Previous Editor Tab', command: 'view.prevTab' },
    ],
  },
  {
    label: 'Run',
    mnemonic: 'r',
    items: [
      { label: 'Start Debugging', command: 'debug.start' },
      { label: 'Stop Debugging', command: 'debug.stop' },
      { label: 'Restart Debugging', command: 'debug.restart' },
      SEP,
      { label: 'Step Over', command: 'debug.stepOver' },
      { label: 'Step Into', command: 'debug.stepInto' },
      { label: 'Step Out', command: 'debug.stepOut' },
      SEP,
      { label: 'Toggle Breakpoint', command: 'debug.toggleBreakpoint' },
      { label: 'Hapus Semua Breakpoint', command: 'debug.clearBreakpoints' },
    ],
  },
  {
    label: 'Terminal',
    mnemonic: 't',
    items: [
      { label: 'New Terminal', command: 'terminal.new' },
      { label: 'New Agent Pane', command: 'terminal.newAgent' },
      { label: 'Split With Browser', command: 'terminal.splitBrowser' },
      SEP,
      { label: 'Kill Active Pane', command: 'terminal.kill' },
      { label: 'Clear Terminal', command: 'terminal.clear' },
      SEP,
      // Tasks (fase 23) — di menu Terminal, sama seperti VS Code.
      { label: 'Run Build Task', command: 'tasks.runBuild' },
      { label: 'Run Task…', command: 'tasks.runTask' },
      { label: 'Terminate Task', command: 'tasks.terminate' },
      { label: 'Show Task Output', command: 'tasks.showOutput' },
      SEP,
      { label: 'MCP Server', command: 'mcp.panel' },
    ],
  },
  {
    label: 'Help',
    mnemonic: 'h',
    items: [
      { label: 'Documentation', command: 'help.docs' },
      { label: 'Keyboard Shortcuts', command: 'workbench.openGlobalKeybindings' },
      { label: 'Check for Updates…', command: 'help.checkUpdates' },
      SEP,
      { label: 'Diagnostics & Self-test', command: 'help.about' },
      { label: 'About Zephyr', command: 'help.about' },
    ],
  },
];
