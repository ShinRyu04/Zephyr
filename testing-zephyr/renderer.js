const state = {
  notes: [],
  filter: 'all',
  query: '',
  saveTimer: null
};

const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');
const savedEl = document.getElementById('saved');
const inputEl = document.getElementById('input');
const searchEl = document.getElementById('search');
const composerEl = document.getElementById('composer');

function makeId() {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function visibleNotes() {
  const q = state.query.trim().toLowerCase();
  return state.notes
    .filter((n) => {
      if (state.filter === 'active') return !n.done;
      if (state.filter === 'done') return n.done;
      return true;
    })
    .filter((n) => (q ? n.text.toLowerCase().includes(q) : true))
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function render() {
  const notes = visibleNotes();
  listEl.replaceChildren();

  for (const note of notes) {
    const li = document.createElement('li');
    li.className = note.done ? 'item done' : 'item';
    li.dataset.id = note.id;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toggle';
    toggle.textContent = '✓';
    toggle.title = note.done ? 'Tandai belum selesai' : 'Tandai selesai';
    toggle.dataset.action = 'toggle';

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = note.text;
    text.title = 'Klik dua kali untuk mengedit';
    text.dataset.action = 'edit';

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = formatDate(note.createdAt);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Hapus';
    remove.dataset.action = 'remove';

    li.append(toggle, text, meta, remove);
    listEl.append(li);
  }

  emptyEl.hidden = notes.length > 0;
  if (notes.length === 0) {
    emptyEl.textContent = state.notes.length === 0
      ? 'Belum ada catatan. Tulis satu di atas.'
      : 'Tidak ada catatan yang cocok.';
  }

  const total = state.notes.length;
  const done = state.notes.filter((n) => n.done).length;
  countEl.textContent = `${total} catatan · ${done} selesai`;
}

function scheduleSave() {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(persist, 250);
}

async function persist() {
  state.saveTimer = null;
  try {
    await window.notesAPI.save(state.notes);
    savedEl.classList.add('show');
    setTimeout(() => savedEl.classList.remove('show'), 1200);
  } catch (err) {
    savedEl.textContent = 'Gagal menyimpan';
    savedEl.style.color = 'var(--danger)';
    savedEl.classList.add('show');
    console.error('Gagal menyimpan catatan:', err);
  }
}

function addNote(text) {
  const clean = text.trim();
  if (!clean) return;
  state.notes.push({
    id: makeId(),
    text: clean,
    done: false,
    createdAt: new Date().toISOString()
  });
  scheduleSave();
  render();
}

function toggleNote(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  note.done = !note.done;
  scheduleSave();
  render();
}

function removeNote(id) {
  state.notes = state.notes.filter((n) => n.id !== id);
  scheduleSave();
  render();
}

function editNote(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  const next = window.prompt('Edit catatan', note.text);
  if (next === null) return;
  const clean = next.trim();
  if (!clean) return;
  note.text = clean.slice(0, 500);
  note.updatedAt = new Date().toISOString();
  scheduleSave();
  render();
}

composerEl.addEventListener('submit', (e) => {
  e.preventDefault();
  addNote(inputEl.value);
  inputEl.value = '';
  inputEl.focus();
});

listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const li = btn.closest('.item');
  if (!li) return;
  const id = li.dataset.id;
  if (btn.dataset.action === 'toggle') toggleNote(id);
  if (btn.dataset.action === 'remove') removeNote(id);
});

listEl.addEventListener('dblclick', (e) => {
  const text = e.target.closest('.text');
  if (!text) return;
  const li = text.closest('.item');
  if (li) editNote(li.dataset.id);
});

searchEl.addEventListener('input', () => {
  state.query = searchEl.value;
  render();
});

document.querySelectorAll('.filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    document.querySelectorAll('.filter').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    render();
  });
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  }
});

(async function init() {
  try {
    const loaded = await window.notesAPI.load();
    state.notes = Array.isArray(loaded) ? loaded : [];
  } catch (err) {
    console.error('Gagal memuat catatan:', err);
    state.notes = [];
  }
  render();
  inputEl.focus();
})();
