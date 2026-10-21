const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
console.log("TARGETS=" + list.length);
list.forEach((x,i)=>console.log(i+" "+x.url));
