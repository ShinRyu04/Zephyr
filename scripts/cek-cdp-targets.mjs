const CDP = process.env.CDP;
async function list() { return (await (await fetch(CDP + '/json/list')).json()); }
(async () => {
  const semua = await list();
  console.log('jumlah target:', semua.length);
  console.log(semua.map(t => ({ type: t.type, url: t.url?.slice(0, 60) }).valueOf ? null : null).filter(Boolean));
  // Tampilkan semua target dan url-nya mentah
  semua.forEach((t, i) => console.log(i, t.type, '|', t.url));
})().catch(e => console.log('ERR', e.message));
