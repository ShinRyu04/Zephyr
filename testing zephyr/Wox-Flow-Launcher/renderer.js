const input = document.getElementById('q');
const list = document.getElementById('results');
const launcher = document.getElementById('launcher');

let items = [];
let active = 0;
let seq = 0;

const ROW = 46;

function setHeight() {
  const rows = list.hidden ? 0 : Math.min(items.length, 8);
  const h = 80 + (rows ? rows * ROW + 1 : 0);
  // window diatur dari main process; tinggi konten saja yang perlu disesuaikan
  launcher.style.height = h + 'px';
}

function render() {
  list.innerHTML = '';
  if (!items.length) {
    list.hidden = true;
    setHeight();
    return;
  }
  list.hidden = false;
  items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'result' + (i === active ? ' active' : '');

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = item.name.slice(0, 1).toUpperCase();

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = item.name;

    const p = document.createElement('span');
    p.className = 'path';
    p.textContent = shortenPath(item.path);

    li.append(badge, label, p);
    li.addEventListener('mouseenter', () => {
      active = i;
      render();
    });
    li.addEventListener('click', () => launchActive());
    list.appendChild(li);
  });
  setHeight();
  const el = list.children[active];
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function shortenPath(p) {
  const parts = p.split('\\');
  if (parts.length <= 3) return p;
  return '…\\' + parts.slice(-2).join('\\');
}

async function search() {
  const mySeq = ++seq;
  const results = await window.zephyr.search(input.value);
  if (mySeq !== seq) return;
  items = results;
  active = 0;
  render();
}

async function launchActive() {
  const item = items[active];
  if (!item) return;
  const err = await window.zephyr.launch(item.path);
  if (err) {
    console.error('Gagal membuka:', err);
  }
}

input.addEventListener('input', search);

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!items.length) return;
    active = (active + 1) % items.length;
    render();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!items.length) return;
    active = (active - 1 + items.length) % items.length;
    render();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    launchActive();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    window.zephyr.hide();
  }
});

window.zephyr.onFocus(() => {
  input.value = '';
  input.focus();
  search();
});

window.zephyr.onReset(() => {
  input.value = '';
  items = [];
  active = 0;
  render();
});

search();
