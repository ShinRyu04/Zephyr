const fs = require('fs');
const p = 'src/lib/modelCatalog.tsx';
let s = fs.readFileSync(p, 'utf8');

/* ── 1. LogoId union ─────────────────────────────────────────────────────── */
const awalUnion = s.indexOf('export type LogoId =');
const akhirUnion = s.indexOf(';', awalUnion);
const union = `export type LogoId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'xai'
  | 'opencode'
  | 'mistral'
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'zai'
  | 'minimax'
  | 'kimi'
  | 'byteplus'
  | 'novita'
  | 'aws'
  | 'azure'
  | 'vercel'
  | 'bigmodel'
  | 'volcano'
  | 'alibaba'
  | 'tencent'
  | 'gmi'
  | 'mimo'
  | 'siliconflow'
  | 'gitee'
  | 'ppio'
  | 'generic'`;
s = s.slice(0, awalUnion) + union + s.slice(akhirUnion);

/* ── 2. The marks ─────────────────────────────────────────────────────────── */
/*
 * Every provider gets its own mark.
 *
 * WHY EACH ONE IS DRAWN RATHER THAN REFERENCED: these are simple geometric
 * reductions of the real brand marks, drawn on the same 16px grid as the six that
 * already existed. A remote image would need a network request per row and would
 * fail silently offline; a raster copy would smear at 16px. The reduction is
 * chosen so the SHAPE is still recognisable at this size — which is the only
 * property that matters in a list scanned by eye.
 *
 * Colour is the brand's own where it is distinctive, and neutral grey where the
 * brand is monochrome — inventing a colour would be a lie about the identity.
 */
const penanda = `
    /* ── The remaining providers ─────────────────────────────────────────── */
    case 'zai':
      return (
        <svg {...p} aria-label="Z.ai">
          <path d="M3.2 3.6h9.6l-9.6 8.8h9.6" fill="none" stroke="#3f7cff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'minimax':
      return (
        <svg {...p} aria-label="MiniMax">
          <path d="M2.6 11.4V5.2l2.7 3.4 2.7-3.4 2.7 3.4 2.7-3.4v6.2" fill="none" stroke="#f24e1e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'kimi':
      return (
        <svg {...p} aria-label="Kimi">
          <path d="M8 2.6c2.6 0 4.6 2 4.6 4.6 0 3-2.2 5.4-4.6 6.2-2.4-.8-4.6-3.2-4.6-6.2 0-2.6 2-4.6 4.6-4.6z" fill="none" stroke="#1f6feb" strokeWidth="1.35" strokeLinejoin="round" />
          <circle cx="8" cy="7.1" r="1.15" fill="#1f6feb" />
        </svg>
      );
    case 'byteplus':
      return (
        <svg {...p} aria-label="BytePlus">
          <path d="M3.4 4.2h5.2a2.4 2.4 0 0 1 0 4.8H3.4z" fill="none" stroke="#00c8d7" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M3.4 9h5.8a2.4 2.4 0 0 1 0 4.8H3.4z" fill="none" stroke="#00c8d7" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case 'novita':
      return (
        <svg {...p} aria-label="Novita">
          <path d="M4 12.4V4l8 8.4V4" fill="none" stroke="#7c5cff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'aws':
      return (
        <svg {...p} aria-label="AWS">
          <path d="M2.8 9.6c3.2 1.6 7.2 1.6 10.4 0" fill="none" stroke="#ff9900" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M10.6 10.9l2.6-1.3-.5 2.4" fill="none" stroke="#ff9900" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.6 6.9V4.4M7.2 6.9V4.4M9.8 6.9V4.4" fill="none" stroke="#e8e8e8" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case 'azure':
      return (
        <svg {...p} aria-label="Azure OpenAI">
          <path d="M7.6 2.6L2.8 11.2h3.1l1.9-3.5 1.7 3.5h3.1L7.6 2.6z" fill="#0078d4" />
        </svg>
      );
    case 'vercel':
      return (
        <svg {...p} aria-label="Vercel">
          <path d="M8 3.2l5.2 9.1H2.8L8 3.2z" fill="#ffffff" />
        </svg>
      );
    case 'bigmodel':
      return (
        <svg {...p} aria-label="Bigmodel">
          <circle cx="8" cy="8" r="5.2" fill="none" stroke="#2f6bff" strokeWidth="1.4" />
          <path d="M8 4.4v7.2M4.4 8h7.2" fill="none" stroke="#2f6bff" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case 'volcano':
      return (
        <svg {...p} aria-label="Volcano Engine">
          <path d="M8 2.8l5 8.6H3L8 2.8z" fill="none" stroke="#1664ff" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M8 6.6l2.2 3.8H5.8L8 6.6z" fill="#1664ff" />
        </svg>
      );
    case 'alibaba':
      return (
        <svg {...p} aria-label="Alibaba Cloud">
          <path d="M3.2 9.4a3 3 0 0 1 .5-5.9 3.6 3.6 0 0 1 6.9-.6 2.9 2.9 0 0 1 .2 6.5H3.2z" fill="none" stroke="#ff6a00" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'tencent':
      return (
        <svg {...p} aria-label="Tencent Cloud">
          <path d="M9.6 4.2a3.4 3.4 0 1 0 2 5.6" fill="none" stroke="#0052d9" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M6.4 11.8a3.4 3.4 0 1 0-2-5.6" fill="none" stroke="#0052d9" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'gmi':
      return (
        <svg {...p} aria-label="GMI Cloud">
          <path d="M12.6 6.4A4.7 4.7 0 1 0 12.4 9.6" fill="none" stroke="#00d0a0" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M8.6 8h4v3.4" fill="none" stroke="#00d0a0" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'mimo':
      return (
        <svg {...p} aria-label="Xiaomi MIMO">
          <rect x="2.6" y="4.4" width="10.8" height="7.2" rx="2.2" fill="none" stroke="#ff6900" strokeWidth="1.4" />
          <path d="M5.4 9.2V6.8l1.6 1.8 1.6-1.8v2.4M11.4 6.8v2.4" fill="none" stroke="#ff6900" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'siliconflow':
      return (
        <svg {...p} aria-label="SiliconFlow">
          <path d="M4.6 3.4h4.2l2.6 4.6-2.6 4.6H4.6L7.2 8 4.6 3.4z" fill="none" stroke="#6d4aff" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'gitee':
      return (
        <svg {...p} aria-label="Gitee">
          <path d="M12.8 5.4H6.6v3h3.2a2.6 2.6 0 1 1-2.6-2.6" fill="none" stroke="#c71d23" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'ppio':
      return (
        <svg {...p} aria-label="PPIO">
          <circle cx="5.6" cy="8" r="2.6" fill="none" stroke="#4b5bff" strokeWidth="1.4" />
          <circle cx="10.4" cy="8" r="2.6" fill="none" stroke="#4b5bff" strokeWidth="1.4" />
        </svg>
      );
    default:`;

const penandaAwal = s.indexOf('    default:');
if (penandaAwal < 0) {
  console.error('default tidak ketemu');
  process.exit(1);
}
s = s.slice(0, penandaAwal) + penanda.replace('\n    default:', '') + s.slice(penandaAwal + '    default:'.length);

fs.writeFileSync(p, s);
console.log('logo ditambahkan; union', union.split('|').length - 1, 'jenis');
