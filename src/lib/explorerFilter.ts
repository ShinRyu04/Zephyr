/*
 * Name filter for the Explorer tree.
 *
 * The tree only knows the children of the folders that have been expanded, so a
 * filter that merely hid rows would show nothing below an unopened folder -
 * the files are not in memory to match. This therefore walks the folders itself
 * through `scanDir` (shallow, one level per call) and returns the matches with
 * their ancestors, which is what the reader expects: type `mcp`, see the three
 * mcp files wherever they live, each under the folder chain that holds it.
 *
 * Two hard limits:
 * - `MAKS_MASUK` folders per search. A filter that keeps walking node_modules
 *   would hang the sidebar; past the limit the result is simply capped and the
 *   UI says so rather than pretending it found everything.
 * - depth stops at the same depth the tree itself refuses to show.
 */
import { scanDir } from './commands';
import type { DirNode } from './types';

const MAKS_MASUK = 400;
const MAKS_KEDALAMAN = 12;
const MAKS_HASIL = 300;

export interface HasilCari {
  /** Folders that must be expanded for every match to be visible. */
  buka: string[];
  /** Matching files, in the order they were reached. */
  berkas: string[];
  /** True when a limit cut the walk short. */
  terpotong: boolean;
}

export async function cariNamaDiPohon(akar: string, cari: string): Promise<HasilCari> {
  const kueri = cari.trim().toLowerCase();
  if (!kueri) return { buka: [], berkas: [], terpotong: false };

  const buka = new Set<string>();
  const berkas: string[] = [];
  let masuk = 0;
  let terpotong = false;

  const antre: { dir: string; kedalaman: number }[] = [{ dir: akar, kedalaman: 0 }];

  while (antre.length > 0) {
    if (masuk >= MAKS_MASUK || berkas.length >= MAKS_HASIL) {
      terpotong = true;
      break;
    }
    const { dir, kedalaman } = antre.shift()!;
    masuk++;
    if (masuk > 1) buka.add(dir);

    let nodes: DirNode[];
    try {
      nodes = await scanDir(dir);
    } catch {
      /* An unreadable folder (permissions, race with a delete) is skipped
         rather than aborting the whole search. */
      continue;
    }

    for (const n of nodes) {
      if (n.name.toLowerCase().includes(kueri)) {
        if (n.isDir) {
          /* A matching FOLDER is shown by opening it: the tree has no way to
             display a folder it is not listing, so the useful answer is "here
             it is, expanded". */
          buka.add(n.path);
          if (kedalaman + 1 < MAKS_KEDALAMAN && antre.length + masuk < MAKS_MASUK) {
            antre.push({ dir: n.path, kedalaman: kedalaman + 1 });
          }
        } else {
          berkas.push(n.path);
        }
      } else if (n.isDir && kedalaman + 1 < MAKS_KEDALAMAN) {
        antre.push({ dir: n.path, kedalaman: kedalaman + 1 });
      }
    }
  }

  return { buka: [...buka], berkas, terpotong };
}
