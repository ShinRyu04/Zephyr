import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { avatarUrl } from '../../lib/commands';
import { ikonSubagent } from '../../lib/subagentIcons';
import IkonAgen from './IkonAgen';

/*
 * An agent's mark, wherever an agent is shown.
 *
 * An uploaded image wins over the drawn mark: the reader picked a picture, and
 * showing the robot instead would make the upload look like it did not take.
 * The drawn fallback is not decoration - it is what keeps every agent visible
 * when the avatar file is missing (deleted by hand, settings copied to another
 * machine), which is a state that must never render as a blank square.
 *
 * The image is loaded through one command (`avatar_url`) that returns a path
 * the webview is allowed to read. Doing it per render would be a round trip for
 * every row in the picker, so the resolved URL is cached per file name in a
 * module map - small, and it never grows past the number of agents.
 */

const cache = new Map<string, string>();

export interface AgenAvatarArgs {
  id: string;
  ikon: string;
  avatar?: string;
}

export default function AgenAvatar({
  agent,
  size = 15,
}: {
  agent: AgenAvatarArgs;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(() =>
    agent.avatar ? (cache.get(agent.avatar) ?? null) : null,
  );

  useEffect(() => {
    if (!agent.avatar) {
      setSrc(null);
      return;
    }
    const known = cache.get(agent.avatar);
    if (known) {
      setSrc(known);
      return;
    }
    let batal = false;
    void avatarUrl(agent.avatar)
      .then((p: string): string => {
        /*
         * `avatar_url` answers with an absolute path, or an empty string when
         * the file is gone. Converting an empty path produces a URL that
         * silently 404s, so the empty case has to fall through to the drawn
         * mark instead.
         */
        if (!p) return '';
        return convertFileSrc(p);
      })
      .then((url: string) => {
        if (batal || !url) return;
        cache.set(agent.avatar as string, url);
        setSrc(url);
      })
      .catch(() => {
        /* Missing file or no Tauri bridge (plain browser): keep the mark. */
      });
    return () => {
      batal = true;
    };
  }, [agent.avatar]);

  if (src) {
    return (
      <img
        className="agen-avatar-img"
        src={src}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        data-testid={`agen-avatar-${agent.id}`}
        onError={() => setSrc(null)}
      />
    );
  }

  return <IkonAgen ik={ikonSubagent(agent.ikon)} size={size} />;
}

/** Drop a cached file so a replaced avatar is fetched again. */
export function lupakanAvatar(nama: string) {
  cache.delete(nama);
}
