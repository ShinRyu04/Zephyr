/*
 * Pull the REAL brand paths out of `simple-icons` (already in node_modules) for
 * the CLIs whose marks it carries, and write them into a TS module.
 *
 * Why a generated module rather than inline JSX: the paths are thousands of
 * characters of vendor data. Inlining them by hand is how they get truncated or
 * mistyped, and a mistyped path renders as a blob nobody can debug.
 *
 * Brands `simple-icons` does not carry (OpenAI, xAI/Grok, Aider, Goose,
 * Continue) are NOT invented here - the module records them as `null` so the
 * component falls back to a labelled generic mark and says so, instead of
 * shipping a fake logo that claims to be official.
 */
import { writeFileSync } from 'node:fs';
import * as si from 'simple-icons';

/** id in our agent catalogue -> simple-icons export name. */
const PETA = {
  claude: 'siClaude',
  anthropic: 'siAnthropic',
  gemini: 'siGooglegemini',
  copilot: 'siGithubcopilot',
  gh: 'siGithubcopilot',
  zed: 'siZedindustries',
  qwen: 'siQwen',
  dsh: 'siDeepseek',
  'dsh-tui': 'siDeepseek',
  mistral: 'siMistralai',
  cline: 'siCline',
  amp: 'siAmp',
  kimi: 'siKimi',
  cursor: 'siCursor',
  opencode: 'siOpencode',
  opencode2: 'siOpencode',
};

const baris = [];
for (const [id, ekspor] of Object.entries(PETA)) {
  const ikon = si[ekspor];
  if (!ikon) {
    console.error(`GAGAL: ${ekspor} tidak ada di simple-icons`);
    process.exit(1);
  }
  baris.push({ id, judul: ikon.title, hex: ikon.hex, path: ikon.path });
}

/*
 * `simple-icons` normalises every mark into a 24x24 viewBox and ships ONE path
 * with the brand's own hex. Both facts are kept: the viewBox is what makes the
 * path render at the right scale, and the hex is the vendor's colour - using
 * `currentColor` instead would make a multi-brand list look like one product.
 */
const isi = `/*
 * REAL brand marks, generated from \`simple-icons\` (v${si.siClaude ? 'installed' : '?'}).
 *
 * DO NOT EDIT BY HAND. Regenerate with:
 *   node scripts/gen-logo-merek.mjs
 *
 * Each entry is the vendor's own path, in the vendor's own hex, on the 24x24
 * grid simple-icons normalises to. \`title\` is the brand name as the source
 * spells it - used for the accessible label, not shown in the UI.
 *
 * Brands simple-icons does NOT carry are absent from this map on purpose. The
 * component (\`PaneIcons.tsx\`) falls back to a generic mark for those rather than
 * drawing an approximation and presenting it as official.
 */
export interface MerekLogo {
  title: string;
  hex: string;
  path: string;
}

export const LOGO_MEREK: Record<string, MerekLogo> = {
${baris
  .map(
    (b) =>
      `  '${b.id}': {\n    title: ${JSON.stringify(b.judul)},\n    hex: '#${b.hex}',\n    path: ${JSON.stringify(b.path)},\n  },`,
  )
  .join('\n')}
};
`;

writeFileSync('src/components/terminal/logoMerek.ts', isi);
console.log(`ok: ${baris.length} logo ditulis (${[...new Set(baris.map((b) => b.judul))].join(', ')})`);
