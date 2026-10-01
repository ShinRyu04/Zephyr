import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

/*
 * Verifikasi layout chat: pesan user = bubble KANAN, balasan AI = teks KIRI
 * tanpa bubble. Menyuntik dua pesan contoh lewat store supaya tidak perlu
 * mengirim permintaan ke provider.
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

console.log('  mount:', await cdp.eval('String(document.getElementById("root")?.children.length ?? -1)'));

const r = await cdp.runAsync(`
  const zzAI = X.store;
  zzAI.setState({
    sessions: [{
      id: 'uji-bubble',
      title: 'Uji bubble',
      at: Date.now(),
      messages: [
        { id: 'm1', role: 'user', content: 'halo ?' },
        { id: 'm2', role: 'assistant', content: 'Halo! Ada yang bisa saya bantu?' },
      ],
    }],
    activeId: 'uji-bubble',
  });
  await wait(1400);

  const zzChat = q('.ai-chat');
  const zzUser = q('.ai-msg.is-user .ai-body');
  const zzBot = q('.ai-msg.is-assistant .ai-body');
  if (!zzChat || !zzUser || !zzBot) return { ada: false, chat: !!zzChat, user: !!zzUser, bot: !!zzBot };

  const cr = zzChat.getBoundingClientRect();
  const ur = zzUser.getBoundingClientRect();
  const br = zzBot.getBoundingClientRect();
  const uc = getComputedStyle(zzUser);
  const bc = getComputedStyle(zzBot);

  return {
    ada: true,
    // Jarak dari tepi kanan/kiri kolom chat.
    userJarakKanan: Math.round(cr.right - ur.right),
    userJarakKiri: Math.round(ur.left - cr.left),
    botJarakKiri: Math.round(br.left - cr.left),
    botJarakKanan: Math.round(cr.right - br.right),
    userBg: uc.backgroundColor,
    userRadius: uc.borderRadius,
    userBorder: uc.borderTopWidth,
    botBg: bc.backgroundColor,
    botPadding: bc.padding,
    userLebar: Math.round(ur.width),
    botLebar: Math.round(br.width),
  };
`, 40000);

console.log('  bubble:', JSON.stringify(r, null, 1));

const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh?.result?.data) {
  writeFileSync('D:/Zephyr/shot-bubble.png', Buffer.from(sh.result.data, 'base64'));
  console.log('  shot-bubble.png');
}

cdp.close();
