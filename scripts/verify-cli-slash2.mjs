import WebSocket from 'ws';
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
const wrote=await run(`return await invoke('claude_command_write',{name:'zephyr-test-cmd',content:'Say hi'})`);
const l1=await run(`return (await invoke('claude_account_info',{cwd:'D:/Zephyr'})).slash_commands.map(c=>c.label)`);
const del=await run(`return await invoke('claude_command_delete',{name:'zephyr-test-cmd'})`);
const l2=await run(`return (await invoke('claude_account_info',{cwd:'D:/Zephyr'})).slash_commands.map(c=>c.label)`);
check('V4', l1.includes('/zephyr-test-cmd')&&del&&!l2.includes('/zephyr-test-cmd'), `wrote ${(wrote||'').replace(/.*[\/]/,'')} del=${del}`);
await run(`return await invoke('claude_memory_write',{scope:'user',content:'# Zephyr test memory\nhello',cwd:null})`);
const mem=await run(`const i=await invoke('claude_account_info',{cwd:'D:/Zephyr'});return (i.memory_files.find(f=>f.scope==='user')||{}).preview||''`);
check('V5', mem.includes('Zephyr test memory'), `memory preview len=${mem.length}`);
ws.close();
const pass=results.filter(Boolean).length;
console.log(`\n== ${pass}/${results.length} lulus ==`);
process.exit(pass===results.length?0:1);
