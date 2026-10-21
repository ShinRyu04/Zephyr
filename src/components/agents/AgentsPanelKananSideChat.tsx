import { useEffect, useState, type ReactNode } from 'react';
import { useAi } from '../../lib/aiStore';
import AiPanel from '../ai/AiPanel';

/*
 * Side Chat di panel kanan — percakapan INDEPENDEN dari chat utama.
 *
 * Persis seperti acuan TRAE: ngobrol di sini tidak menyentuh percakapan
 * di composer tengah. `AiPanel` sudah dirancang untuk itu: percakapan
 * dipilih per `composerId` (`activeIds[composerId]`), jadi id yang berbeda
 * berarti sesi yang benar-benar terpisah — cukup memakainya, tanpa menulis
 * ulang chat.
 *
 * Sesi dibuat saat dibuka pertama kali supaya panel langsung bisa dipakai
 * mengetik.
 */

const ID = 'agents-side-chat';

export default function AgentsPanelKananSideChat({ bar }: { bar?: ReactNode | null }) {
  const newChat = useAi((s) => s.newChat);
  const [siap, setSiap] = useState(false);

  useEffect(() => {
    const ada = useAi.getState().activeIds[ID];
    if (!ada) newChat(ID);
    setSiap(true);
  }, [newChat]);

  return (
    <>
      {bar}
      <div className="agx-view-isi agx-sidechat" data-testid="agx-sidechat-view">
        {siap && <AiPanel composerId={ID} />}
      </div>
    </>
  );
}
