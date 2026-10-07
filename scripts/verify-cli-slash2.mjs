import WebSocket from 'ws';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
const PORT='9223';
const t=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const pg=t.find(x=>x.type==='page'&&/Zephyr/i.test(x.title));
const ws=new WebSocket(pg.webSocketDebuggerUrl,{perMessageDeflate:false});
await new Promise(r=>ws.once('open',r));
let id=0;const send=(m,p={})=>new Promise(res=>{const i=++id;const h=raw=>{const j=JSON.parse(raw);if(j.id===i){ws.off('message',h);res(j)}};ws.on('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))});
const run=async(body)=>{const slot='__ZV'+Math.random().toString(36).slice(2,7);
  await send('Runtime.evaluate',{expression:`(()=>{window.${slot}={done:false};(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;${body}})().then(v=>window.${slot}={done:true,value:v},e=>window.${slot}={done:true,error:String(e&&e.message||e)});return 1})()`});
  /*
   * Poll until the slot EXISTS, not merely until it reads.
   *
   * The evaluate that starts the async body returns `1` immediately; the slot
   * is only written when the awaited invoke resolves. Reading it in the very
   * next tick returned `undefined`, and `JSON.parse(undefined)` threw — which
   * took the whole run down before a single check printed, so the harness
   * looked like a failing test when it was a failing reader. A missing slot is
   * "not yet", not "no value"; only a PRESENT slot is read.
   */
  for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,150));
    const r=await send('Runtime.evaluate',{expression:`window.${slot}?JSON.stringify(window.${slot}):null`,returnByValue:true});
    const raw=r.result&&r.result.result&&r.result.result.value;
    if(raw===null||raw===undefined)continue;
    const st=JSON.parse(raw);if(st.done){if(st.error)throw new Error(st.error);return st.value;}}
  throw new Error('timeout');};
const results=[];const check=(id,ok,d)=>{results.push(ok);console.log(`${ok?'LULUS':'GAGAL'}  ${id.padEnd(6)} ${d}`)};
const b=await run(`return await invoke('claude_builtin_commands')`);
check('V1', b.length>=15 && b.some(x=>x.name==='/clear'), `builtins=${b.length}`);
const before=await run(`return (await invoke('claude_account_info',{cwd:'D:/Zephyr'})).output_style`);
await run(`return await invoke('claude_settings_patch',{patch:{outputStyle:'explanatory'}})`);
const mid=await run(`return (await invoke('claude_account_info',{cwd:'D:/Zephyr'})).output_style`);
await run(`return await invoke('claude_settings_patch',{patch:{outputStyle: ${JSON.stringify(before)}==='default'?null:${JSON.stringify(before)}}})`);
const after=await run(`return (await invoke('claude_account_info',{cwd:'D:/Zephyr'})).output_style`);
check('V2', mid==='explanatory'&&after===before, `style ${before}->${mid}->${after}`);
await run(`return await invoke('claude_settings_patch',{patch:{permissions:{allow:['Bash(echo zt)']}}})`);
const p1=await run(`return (await invoke('claude_account_info',{cwd:'D:/Zephyr'})).permission_allow`);
await run(`return await invoke('claude_settings_patch',{patch:{permissions:{allow:[]}}})`);
const p2=await run(`return (await invoke('claude_account_info',{cwd:'D:/Zephyr'})).permission_allow`);
check('V3', p1.includes('Bash(echo zt)')&&p2.length===0, `allow add=${JSON.stringify(p1)} clear=${JSON.stringify(p2)}`);
/*
 * V4/V5 — the WRITE commands, run against a throwaway directory.
 *
 * Both commands have a fixed target the caller cannot redirect:
 * `claude_command_write` always lands in `~/.claude/commands/` and
 * `claude_memory_write` with scope "user" always lands in `~/.claude/CLAUDE.md`.
 * The first version of this harness wrote to exactly those paths — it created a
 * real slash command in the user's own Claude config and overwrote their global
 * memory file with "# Zephyr test memory". A verification script must not
 * mutate the thing it is verifying: a test that leaves the user's config
 * changed is worse than no test, because the change outlives the run.
 *
 * So the writes are aimed at a sandbox under the system temp dir instead, the
 * assertions read the file back from there, and the sandbox is removed at the
 * end whether the checks passed or not. The user's `~/.claude` is read for
 * nothing and written to never.
 */
/* Forward slashes: the path is interpolated into JS source that runs in the
   page, where a Windows backslash would be read as an escape. */
const probeDir = `${tmpdir()}/zephyr-verify-${process.pid}`.split('\\').join('/');
mkdirSync(probeDir, { recursive: true });

try {
  const wrote = await run(`return await invoke('claude_command_write',{name:'zephyr-test-cmd',content:'Say hi',dir:${JSON.stringify(probeDir)}})`);
  const del = await run(`return await invoke('claude_command_delete',{name:'zephyr-test-cmd',dir:${JSON.stringify(probeDir)}})`);
  const onDiskCmd = existsSync(`${probeDir}/zephyr-test-cmd.md`);
  check('V4', Boolean(wrote) && del && !onDiskCmd, `wrote ${(wrote || '').replace(/.*[\/\\]/, '')} del=${del} gone=${!onDiskCmd}`);

  /* Project scope writes inside the sandbox; nothing global is touched. */
  const memPath = await run(`return await invoke('claude_memory_write',{scope:'project',content:'# Zephyr test memory\\nhello',cwd:${JSON.stringify(probeDir)}})`);
  const onDisk = existsSync(memPath) ? readFileSync(memPath, 'utf8') : '';
  check('V5', onDisk.includes('Zephyr test memory') && memPath.startsWith(probeDir), `wrote ${memPath} len=${onDisk.length}`);
} finally {
  rmSync(probeDir, { recursive: true, force: true });
}
ws.close();
const pass=results.filter(Boolean).length;
console.log(`\n== ${pass}/${results.length} lulus ==`);
process.exit(pass===results.length?0:1);
