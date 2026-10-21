const l = await (await fetch('http://127.0.0.1:9223/json/list')).json(); console.log('JUMLAH=' + l.length);
