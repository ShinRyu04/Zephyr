/*
 * Icon set for the AI panel header.
 *
 * The header used to spell every action out in words ("+ New chat", "Delete
 * all", "Compact", "Export"), which cost a full row of width and read as a
 * toolbar of buttons rather than as the chrome of a chat panel. These are
 * stroke SVGs on one 16px grid with one weight, the same approach the activity
 * bar and the tool chips take, so the whole app draws icons the same way.
 *
 * Every icon is paired with a title + aria-label at the call site: icon-only
 * controls are only acceptable when the name is still reachable, both by hover
 * and by screen reader.
 */

interface Props {
  name:
    | 'new-chat'
    | 'trash'
    | 'compact'
    | 'export'
    | 'maximize'
    | 'restore'
    | 'close'
    | 'attach'
    | 'image'
    | 'check'
    | 'stethoscope'
    | 'more'
    | 'mic'
    | 'plus'
    | 'search'
    | 'chev-up'
    | 'chev-down'
    | 'chev-right'
    | 'refresh'
    | 'gear'
    | 'send'
    | 'stop'
    | 'file'
    | 'folder'
    | 'clipboard'
    | 'link'
    | 'snippet'
    | 'queue'
    /*
     * Reasoning and work glyphs: a thought, an eye for "looked at", a terminal
     * for "ran", and a fold mark for the queue's collapse control. They live
     * beside each other in one transcript, so each needs its own silhouette.
     */
    | 'thought'
    | 'eye'
    | 'terminal'
    | 'collapse'
    /*
     * Tool-row glyphs. One per action kind, so a transcript reads as a list of
     * shapes before it reads as words: a page means something was read, a page
     * with a pencil means something changed, a magnifier means a search, a
     * prompt means a command ran.
     */
    | 'doc'
    | 'doc-edit'
    | 'list'
    | 'search'
    | 'warn'
    | 'puzzle'
    | 'brain'
    | 'check'
    | 'clock'
    | 'dot'
    /* Tool-gate and debug controls: a spanner for the tool list, a bug for the
       request log, an X to dismiss either. */
    | 'wrench'
    | 'bug'
    | 'clock'
    | 'pin'
    | 'x';
  size?: number;
}

export default function AiIkon({ name, size = 15 }: Props) {
  const box = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
  };

  switch (name) {
    // A speech bubble with a plus: start a new conversation.
    case 'new-chat':
      return (
        <svg {...box}>
          <path d="M14.2 8.6a5.4 5.4 0 0 1-7.6 4.9L2.4 14.4l1-4a5.4 5.4 0 1 1 10.8-1.8z" />
          <path d="M8.2 5.9v4M6.2 7.9h4" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...box}>
          <path d="M2.6 4.2h10.8" />
          <path d="M6.2 4.2V2.8a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v1.4" />
          <path d="M12.2 4.2v8.6a1.2 1.2 0 0 1-1.2 1.2H5a1.2 1.2 0 0 1-1.2-1.2V4.2" />
          <path d="M6.6 7v4M9.4 7v4" />
        </svg>
      );
    // Arrows pointing inward: shrink the conversation.
    case 'compact':
      return (
        <svg {...box}>
          <path d="M2.6 8h10.8" />
          <path d="M5.4 5.2 8 2.6l2.6 2.6" />
          <path d="M10.6 10.8 8 13.4l-2.6-2.6" />
        </svg>
      );
    // An arrow leaving a tray: copy out.
    case 'export':
      return (
        <svg {...box}>
          <path d="M8 10.4V2.4" />
          <path d="M5.2 5.2 8 2.4l2.8 2.8" />
          <path d="M2.8 9.6v3.2a1 1 0 0 0 1 1h8.4a1 1 0 0 0 1-1V9.6" />
        </svg>
      );
    case 'maximize':
      return (
        <svg {...box}>
          <path d="M6.2 2.4h7.4v7.4" />
          <path d="M13.6 2.4 8.4 7.6" />
          <path d="M9.8 13.6H2.4V6.2" />
          <path d="M2.4 13.6l5.2-5.2" />
        </svg>
      );
    case 'restore':
      return (
        <svg {...box}>
          <path d="M9.8 2.4H2.4v7.4" />
          <path d="M2.4 2.4l5.2 5.2" />
          <path d="M6.2 13.6h7.4V6.2" />
          <path d="M13.6 13.6 8.4 8.4" />
        </svg>
      );
    case 'close':
      return (
        <svg {...box}>
          <path d="M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" />
        </svg>
      );
    // A paperclip: attach the active file.
    case 'attach':
      return (
        <svg {...box}>
          <path d="M11.6 5.2 6 10.8a1.7 1.7 0 0 0 2.4 2.4l6-6a3.4 3.4 0 0 0-4.8-4.8l-6 6a5.1 5.1 0 0 0 7.2 7.2l4.4-4.4" />
        </svg>
      );
    // A picture frame.
    case 'image':
      return (
        <svg {...box}>
          <rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.2" />
          <circle cx="6" cy="6.6" r="1.1" />
          <path d="M2.6 11.2 6 8.4l2.2 1.8 2-1.6 3 2.6" />
        </svg>
      );
    case 'check':
      return (
        <svg {...box} strokeWidth={2}>
          <path d="M3.2 8.4l3.2 3.2 6.4-7" />
        </svg>
      );
    // A pulse line: run the type check.
    case 'stethoscope':
      return (
        <svg {...box}>
          <path d="M2.4 8h2.8l1.4-3.4 2 7 1.4-3.6h3.6" />
        </svg>
      );
    // Three dots: the session actions menu.
    case 'more':
      return (
        <svg {...box}>
          <circle cx="3.4" cy="8" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="12.6" cy="8" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    // A microphone: dictate a message.
    case 'mic':
      return (
        <svg {...box}>
          <rect x="6.2" y="1.8" width="3.6" height="7.2" rx="1.8" />
          <path d="M3.6 7.4a4.4 4.4 0 0 0 8.8 0" />
          <path d="M8 11.8v2.4M5.8 14.2h4.4" />
        </svg>
      );
    // A plus: add something to the message.
    case 'plus':
      return (
        <svg {...box}>
          <path d="M8 3.2v9.6M3.2 8h9.6" />
        </svg>
      );
    // A chevron: this control opens a menu.
    case 'chev-up':
      return (
        <svg {...box}>
          <path d="M4 9.5l4-3.5 4 3.5" />
        </svg>
      );
    // Pointing down: the group below is open.
    case 'chev-down':
      return (
        <svg {...box}>
          <path d="M4 6.5l4 3.5 4-3.5" />
        </svg>
      );
    // Pointing right: the group is folded shut.
    case 'chev-right':
      return (
        <svg {...box}>
          <path d="M6.5 4L10 8l-3.5 4" />
        </svg>
      );
    // A circular arrow: reload the model list from the provider.
    case 'refresh':
      return (
        <svg {...box}>
          <path d="M13.2 6.8A5.3 5.3 0 0 0 3.6 5.1" />
          <path d="M2.8 9.2a5.3 5.3 0 0 0 9.6 1.7" />
          <path d="M2.8 2.9v2.4h2.4M13.2 13.1v-2.4h-2.4" />
        </svg>
      );
    // Two cogs: settings.
    case 'gear':
      return (
        <svg {...box}>
          <circle cx="8" cy="8" r="2.1" />
          <path d="M8 1.9v1.6M8 12.5v1.6M14.1 8h-1.6M3.5 8H1.9M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1M12.3 12.3l-1.1-1.1M4.8 4.8L3.7 3.7" />
        </svg>
      );
    // A paper plane: send.
    case 'send':
      return (
        <svg {...box}>
          <path d="M14 2L7.2 8.9" />
          <path d="M14 2l-4.4 12-2.4-5.1L2 6.5 14 2z" />
        </svg>
      );
    // A square: stop.
    case 'stop':
      return (
        <svg {...box}>
          <rect x="4" y="4" width="8" height="8" rx="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    // A page: a file.
    case 'file':
      return (
        <svg {...box}>
          <path d="M9 2H4.4a1.2 1.2 0 0 0-1.2 1.2v9.6A1.2 1.2 0 0 0 4.4 14h7.2a1.2 1.2 0 0 0 1.2-1.2V5.8L9 2z" />
          <path d="M9 2v3.8h3.8" />
        </svg>
      );
    // A folder: a directory.
    case 'folder':
      return (
        <svg {...box}>
          <path d="M2 4.6a1.2 1.2 0 0 1 1.2-1.2h2.6l1.4 1.8h4.6A1.2 1.2 0 0 1 13 6.4v5.4a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 11.8V4.6z" />
        </svg>
      );
    // A clipboard: paste.
    case 'clipboard':
      return (
        <svg {...box}>
          <path d="M6 3H4.6a1 1 0 0 0-1 1v8.4a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H10" />
          <rect x="6" y="1.7" width="4" height="2.6" rx="0.9" />
        </svg>
      );
    // A chain: a URL.
    case 'link':
      return (
        <svg {...box}>
          <path d="M6.6 9.4a2.6 2.6 0 0 0 3.9.3l1.9-1.9a2.6 2.6 0 0 0-3.7-3.7l-1.1 1.1" />
          <path d="M9.4 6.6a2.6 2.6 0 0 0-3.9-.3L3.6 8.2a2.6 2.6 0 0 0 3.7 3.7l1.1-1.1" />
        </svg>
      );
    // A bubble with a dash: a prompt snippet.
    case 'snippet':
      return (
        <svg {...box}>
          <path d="M13.6 8.2a5.2 5.2 0 0 1-7.3 4.7l-3.9.9.9-3.8A5.2 5.2 0 1 1 13.6 8.2z" />
          <path d="M6 7.6h4" />
        </svg>
      );
    // Three stacked lines: the outgoing queue.
    case 'queue':
      return (
        <svg {...box}>
          <path d="M2.4 4.6h11.2M2.4 8h8.4M2.4 11.4h5.6" />
        </svg>
      );
    /*
     * The reasoning row's own glyphs.
     *
     * A thought is drawn as a head in profile with a small spark beside it —
     * the same idea as Hermes's "Thought for 2s" line, and distinct from every
     * tool glyph, so the reasoning rows and the work rows never read as the
     * same kind of thing. The eye is a tool call that looked at something, and
     * the terminal is one that ran something; both are drawn here rather than
     * reusing the row's text icons because a reasoning block and a tool row sit
     * side by side and their icons have to be told apart at a glance.
     */
    case 'thought':
      return (
        <svg {...box}>
          <path d="M9.6 2.6a3.4 3.4 0 0 0-3.3 4.2 3.1 3.1 0 0 0-1.5 2.7 3.1 3.1 0 0 0 3.1 3.1h.4v1.4" />
          <path d="M8.3 12.6v1.8" />
          <path d="M12.4 2.2l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5.5-1.1z" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...box}>
          <path d="M1.8 8S4 3.9 8 3.9 14.2 8 14.2 8 12 12.1 8 12.1 1.8 8 1.8 8z" />
          <circle cx="8" cy="8" r="1.9" />
        </svg>
      );
    case 'terminal':
      return (
        <svg {...box}>
          <path d="M3 4.4 6 8l-3 3.6" />
          <path d="M8.4 11.6h4.6" />
        </svg>
      );
    /*
     * Tool-row glyphs, drawn to one visual weight so a column of rows reads as
     * a single list rather than a ransom note. Every one is an outline with the
     * same 1.4 stroke as the rest of the set; colour comes from CSS, which is
     * what lets a Read row and a Run row differ at a glance without redrawing
     * anything. The shapes follow the convention every developer already knows:
     * a page for reading, a page with a pencil for editing, a magnifier for
     * searching, a prompt for running.
     */
    case 'doc':
      return (
        <svg {...box}>
          <path d="M9 1.8H4.6a1.2 1.2 0 0 0-1.2 1.2v10a1.2 1.2 0 0 0 1.2 1.2h6.8a1.2 1.2 0 0 0 1.2-1.2V5.4L9 1.8z" />
          <path d="M9 1.8v3.6h3.6" />
        </svg>
      );
    case 'doc-edit':
      return (
        <svg {...box}>
          <path d="M8.6 2H4.4a1.2 1.2 0 0 0-1.2 1.2v9.6A1.2 1.2 0 0 0 4.4 14h3" />
          <path d="M11.9 6.6 13.4 8 9.2 12.2l-2 .5.5-2z" />
          <path d="M10.6 7.9l1.3 1.4" />
        </svg>
      );
    case 'list':
      return (
        <svg {...box}>
          <path d="M5.4 3.8h8.2M5.4 8h8.2M5.4 12.2h8.2" />
          <path d="M2.6 3.8h.01M2.6 8h.01M2.6 12.2h.01" />
        </svg>
      );
    case 'search':
      return (
        <svg {...box}>
          <circle cx="7" cy="7" r="4.4" />
          <path d="M10.3 10.3 14 14" />
        </svg>
      );
    case 'warn':
      return (
        <svg {...box}>
          <path d="M8 2.4 14.4 13H1.6z" />
          <path d="M8 6.4v3.2M8 11.4h.01" />
        </svg>
      );
    case 'puzzle':
      return (
        <svg {...box}>
          <path d="M6.2 2.6h3.6v1.9a1.3 1.3 0 1 0 2.6 0V2.6h.8a1.2 1.2 0 0 1 1.2 1.2v2.6h-1.9a1.3 1.3 0 1 0 0 2.6h1.9v4.4a1.2 1.2 0 0 1-1.2 1.2H3.8a1.2 1.2 0 0 1-1.2-1.2V9h1.9a1.3 1.3 0 1 0 0-2.6H2.6V3.8a1.2 1.2 0 0 1 1.2-1.2h2.4z" />
        </svg>
      );
    case 'brain':
      return (
        <svg {...box}>
          <path d="M6.4 2.6a2.2 2.2 0 0 0-2.2 2.2 2 2 0 0 0-1.2 3.6 2.1 2.1 0 0 0 .9 3.4 2.2 2.2 0 0 0 4.1.6V4.4a2 2 0 0 0-1.6-1.8z" />
          <path d="M9.6 2.6a2.2 2.2 0 0 1 2.2 2.2 2 2 0 0 1 1.2 3.6 2.1 2.1 0 0 1-.9 3.4 2.2 2.2 0 0 1-4.1.6" />
        </svg>
      );
    case 'dot':
      return (
        <svg {...box}>
          <circle cx="8" cy="8" r="2.4" fill="currentColor" stroke="none" />
        </svg>
      );
    // A stack with an arrow: fold the list away.
    case 'collapse':
      return (
        <svg {...box}>
          <path d="M2.6 4.4h10.8" />
          <path d="M2.6 11.6h10.8" />
          <path d="M6 8h4" />
        </svg>
      );
    /*
     * A spanner. The tool gate is a maintenance surface — it decides what the
     * agent is allowed to reach — and the wrench is the one glyph every reader
     * already files under that meaning.
     */
    case 'wrench':
      return (
        <svg {...box}>
          <path d="M13.6 3.4a3.2 3.2 0 0 1-4.2 4.2L4.6 12.4a1.5 1.5 0 1 1-2.1-2.1l4.8-4.8a3.2 3.2 0 0 1 4.2-4.2l-2 2 .9 1.4 1.4.9 2-2z" />
        </svg>
      );

    // A bare cross: dismiss the floating panel.
    case 'x':
      return (
        <svg {...box}>
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      );
    /*
     * A beetle. The debug drawer is a request log, and the bug is the one mark
     * that reads as "diagnostics" without a label in every toolchain a
     * developer already uses.
     */
    case 'bug':
      return (
        <svg {...box}>
          <path d="M5.4 5.6a2.6 2.6 0 0 1 5.2 0v3.2a2.6 2.6 0 0 1-5.2 0z" />
          <path d="M5.4 7.4H2.8M5.4 9.6H3M10.6 7.4h2.6M10.6 9.6H13M5.6 5.2 4 3.6M10.4 5.2 12 3.6" />
        </svg>
      );
    // A dial: the schedule list is a set of times.
    case 'clock':
      return (
        <svg {...box}>
          <circle cx="8" cy="8" r="6.1" />
          <path d="M8 4.6V8l2.3 1.5" />
        </svg>
      );
    // A pushpin: pinned items sort to the top of the list.
    case 'pin':
      return (
        <svg {...box}>
          <path d="M9.4 1.8 14.2 6.6l-2 .6-2.2 3.4.5 2.5-1 .9-4.5-4.5.9-1 2.5.5L11.8 6.8l.6-2z" />
          <path d="M5.4 10.6 2.4 13.6" />
        </svg>
      );




    default:
      return null;
  }
}
