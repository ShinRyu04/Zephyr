// Where does the Dev Environment view actually render now?
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] || '9223');

for (const id of ['devenv', 'api', 'sftp']) {
  const r = await cdp.runAsync(
    `
    const st = S.getState();
    st.setActivity(${JSON.stringify(id)});
    await wait(1800);
    const ea = document.querySelector('.editor-area');
    const side = document.querySelector('.side-panel');
    return JSON.stringify({
      activity: st.activity,
      editorAreaAda: !!ea,
      editorAreaIsi: ea ? ea.children.length : -1,
      editorAreaTeks: ea ? ea.textContent.trim().slice(0, 100) : null,
      sideAda: !!side,
      sideTeks: side ? side.textContent.trim().slice(0, 60) : null,
      dvRoot: !!document.querySelector('[data-testid="dv-root"]'),
      apiRoot: !!document.querySelector('[data-testid="api-root"]'),
      sftpRoot: !!document.querySelector('[data-testid="sftp-root"]'),
    });
  `,
    40000,
  );
  console.log(id, '->', r);
}
process.exit(0);
