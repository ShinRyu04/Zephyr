const fs = require('fs');
const blok = fs.readFileSync('scratch/ikonext-blok.txt', 'utf8');

const kepala = [
  '/*',
  " * The mark inside an extension card's logo box.",
  ' *',
  ' * Lives in its own module because TWO surfaces draw it: the Installed list',
  ' * (the tall cards) and the Extensions tab of the marketplace grid. When the',
  ' * marketplace was added its cards drew initials instead - so the same package',
  ' * had a real logo on one screen and two grey letters on another. One component',
  ' * for both is what keeps the artwork identical wherever a package appears.',
  ' */',
  "import type { KatalogItem } from '../../lib/extCatalog';",
  "import { ikonEkstensi, inlineIkonDataUri } from '../../lib/extIkon';",
  '',
].join('\n');

const badan = blok.replace(/^function IkonExt/, 'export default function IkonExt');
fs.writeFileSync('src/components/extensions/IkonExt.tsx', kepala + badan + '\n');
console.log('ditulis IkonExt.tsx', kepala.length + badan.length);
