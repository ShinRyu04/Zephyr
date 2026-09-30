import { Cdp } from './lib-cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);
const r = await cdp.runAsync(`
  const out = {};
  window.__ZEPHYR_TERM__.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.focusTab('ai');
  await wait(1200);
  const mic = q('[data-testid="ai-mic"]');
  out.sebelum = mic ? mic.getAttribute('aria-pressed') : null;
  // apakah SpeechRecognition tersedia?
  out.speechAPI = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  if (mic) { mic.click(); await wait(900); }
  const m2 = q('[data-testid="ai-mic"]');
  out.sesudah = m2 ? m2.getAttribute('aria-pressed') : null;
  out.titleSesudah = m2 ? m2.getAttribute('title') : null;
  out.kelasSesudah = m2 ? m2.className : null;
  return out;
`, 120000);
console.log(JSON.stringify(r, null, 1));
cdp.close();
