/* ===== Galery — logika aplikasi ===== */
(function () {
  "use strict";

  // ---------- Data contoh ----------
  // Foto contoh memakai layanan placeholder lokal-friendly; tanpa jaringan
  // tile tetap tampil sebagai kotak gradien (lihat fallback di render).
  const SEED = [];
  const TITLES = [
    "Senja di Pelabuhan", "Kabut Pagi", "Jalan Sepi", "Dermaga Tua", "Bukit Hijau",
    "Pasar Malam", "Langit Biru", "Kopi Pahit", "Hujan Pertama", "Bekas Jejak",
    "Menara Kota", "Sawah Terasering", "Tepi Pantai", "Jendela Kayu", "Lampu Jalan",
    "Sepeda Tua", "Awan Putih", "Taman Kota", "Gunung Berkabut", "Catatan Kecil",
    "Sudut Kafe", "Rel Kereta", "Malam Terang", "Daun Kering"
  ];
  const ALBUMS = ["Perjalanan", "Kota", "Alam", "Harian"];
  const ARTISTS = ["K. Rahman", "A. Putri", "R. Santoso", "M. Dewi"];

  const pad = (n) => String(n).padStart(2, "0");

  function seedPhotos() {
    const out = [];
    const now = Date.now();
    for (let i = 0; i < TITLES.length; i++) {
      const hue = (i * 37) % 360;
      const taken = new Date(now - i * 86400000 * 3 - i * 3600000);
      out.push({
        id: "p" + i,
        name: TITLES[i].toLowerCase().replace(/\s+/g, "-") + ".jpg",
        title: TITLES[i],
        album: ALBUMS[i % ALBUMS.length],
        artist: ARTISTS[i % ARTISTS.length],
        date: taken.toISOString(),
        width: [4032, 3024, 5472, 3840][i % 4],
        height: [3024, 4032, 3648, 2160][i % 4],
        size: 1_200_000 + i * 173_000,
        fav: i % 5 === 0,
        video: i % 9 === 4,
        duration: i % 9 === 4 ? 32 + i : 0,
        // pola warna sebagai "isi" gambar saat tanpa berkas asli
        grad: `linear-gradient(135deg, hsl(${hue} 62% 56%), hsl(${(hue + 48) % 360} 58% 34%))`
      });
    }
    return out;
  }

  // ---------- State ----------
  const state = {
    photos: [],
    filter: "all",        // all | fav | ALBUM:<nama>
    view: "grid",         // grid | timeline
    size: "m",            // s | m | l
    sort: "newest",       // newest | oldest | name
    query: "",
    selectedId: null,
    viewerIndex: -1
  };

  // ---------- Elemen ----------
  const $ = (sel) => document.querySelector(sel);
  const el = {
    body: document.body,
    grid: $("#grid"),
    timeline: $("#timeline"),
    scroll: $("#scroll"),
    empty: $("#empty"),
    dropzone: $("#dropzone"),
    search: $("#search"),
    searchWrap: $(".search-wrap"),
    searchClear: $("#searchClear"),
    sort: $("#sort"),
    counts: {
      all: $("#countAll"),
      fav: $("#countFav"),
      albums: $("#albumList"),
      total: $("#totalCount")
    },
    titleSub: $(".title-sub"),
    inspector: $("#inspector"),
    inspBody: $("#inspBody"),
    lightbox: $("#lightbox"),
    lbImg: $("#lbImg"),
    lbVideo: $("#lbVideo"),
    lbName: $("#lbName"),
    lbMeta: $("#lbMeta"),
    lbFav: $("#lbFav"),
    lbDownload: $("#lbDownload"),
    lbClose: $("#lbClose"),
    lbPrev: $("#lbPrev"),
    lbNext: $("#lbNext"),
    toast: $("#toast")
  };

  // ---------- Util ----------
  function formatSize(b) {
    if (!b) return "—";
    const mb = b / (1024 * 1024);
    return mb >= 1024 ? (mb / 1024).toFixed(2) + " GB" : mb.toFixed(1) + " MB";
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${pad(s)}`;
  }

  function monthKey(iso) {
    const d = new Date(iso);
    const bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
      "Agustus", "September", "Oktober", "November", "Desember"];
    return `${bulan[d.getMonth()]} ${d.getFullYear()}`;
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1900);
  }

  // ---------- Filter + sort ----------
  function visiblePhotos() {
    let list = state.photos.slice();

    if (state.filter === "fav") {
      list = list.filter((p) => p.fav);
    } else if (state.filter.startsWith("ALBUM:")) {
      const album = state.filter.slice(6);
      list = list.filter((p) => p.album === album);
    }

    const q = state.query.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.album.toLowerCase().includes(q) ||
        p.artist.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q)
      );
    }

    if (state.sort === "newest") list.sort((a, b) => new Date(b.date) - new Date(a.date));
    else if (state.sort === "oldest") list.sort((a, b) => new Date(a.date) - new Date(b.date));
    else list.sort((a, b) => a.title.localeCompare(b.title, "id"));

    return list;
  }

  // ---------- Render ----------
  function makeTile(p, index) {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.type = "button";
    tile.dataset.id = p.id;
    tile.title = p.title;
    tile.style.background = p.grad;
    tile.addEventListener("click", () => openViewer(index));

    if (p.video) {
      const badge = document.createElement("span");
      badge.className = "tile-badge";
      badge.textContent = "▶ " + formatDuration(p.duration);
      tile.appendChild(badge);
    }
    if (p.fav) {
      const fav = document.createElement("span");
      fav.className = "tile-fav";
      fav.textContent = "♥";
      tile.appendChild(fav);
    }
    const name = document.createElement("span");
    name.className = "tile-name";
    name.textContent = p.title;
    tile.appendChild(name);

    return tile;
  }

  function render() {
    const list = visiblePhotos();
    el.grid.innerHTML = "";
    el.timeline.innerHTML = "";
    el.grid.className = "grid size-" + state.size;

    const isGrid = state.view === "grid";
    el.grid.hidden = !isGrid;
    el.timeline.hidden = isGrid;

    if (list.length === 0) {
      el.empty.hidden = false;
      el.grid.hidden = true;
      el.timeline.hidden = true;
      el.titleSub.textContent = "0 item";
      updateCounts();
      return;
    }
    el.empty.hidden = true;

    if (isGrid) {
      const frag = document.createDocumentFragment();
      list.forEach((p, i) => frag.appendChild(makeTile(p, i)));
      el.grid.appendChild(frag);
    } else {
      const groups = new Map();
      list.forEach((p, i) => {
        const key = monthKey(p.date);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ p, i });
      });
      [...groups.entries()]
        .sort((a, b) => new Date(b[1][0].p.date) - new Date(a[1][0].p.date))
        .forEach(([key, items]) => {
          const section = document.createElement("section");
          section.className = "tl-section";
          const h = document.createElement("h3");
          h.textContent = key;
          const g = document.createElement("div");
          g.className = "tl-grid";
          items.forEach(({ p, i }) => g.appendChild(makeTile(p, i)));
          section.append(h, g);
          el.timeline.appendChild(section);
        });
    }

    el.titleSub.textContent = list.length + " item";
    updateCounts(list);
  }

  function updateCounts(list) {
    const all = state.photos.length;
    const fav = state.photos.filter((p) => p.fav).length;
    el.counts.all.textContent = all;
    el.counts.fav.textContent = fav;
    el.counts.total.textContent = all;

    const perAlbum = {};
    state.photos.forEach((p) => { perAlbum[p.album] = (perAlbum[p.album] || 0) + 1; });
    el.counts.albums.querySelectorAll("[data-album]").forEach((node) => {
      const name = node.dataset.album;
      node.querySelector(".side-count").textContent = perAlbum[name] || 0;
    });

    document.querySelectorAll(".side-item[data-filter]").forEach((node) => {
      node.classList.toggle("active", node.dataset.filter === state.filter);
    });
  }

  // ---------- Inspector ----------
  function showInspector(p) {
    state.selectedId = p ? p.id : null;
    if (!p) {
      el.inspBody.innerHTML = '<p class="insp-empty">Pilih item untuk melihat detail.</p>';
      return;
    }
    el.inspBody.innerHTML = "";
    const thumb = document.createElement("div");
    thumb.className = "insp-thumb";
    thumb.style.background = p.grad;
    el.inspBody.appendChild(thumb);

    const rows = [
      ["Nama", p.title],
      ["Berkas", p.name],
      ["Album", p.album],
      ["Fotografer", p.artist],
      ["Tanggal", formatDate(p.date)],
      ["Dimensi", `${p.width} × ${p.height}`],
      ["Ukuran", formatSize(p.size)],
      ["Jenis", p.video ? "Video" : "Foto"]
    ];
    rows.forEach(([k, v]) => {
      const row = document.createElement("div");
      row.className = "insp-row";
      const a = document.createElement("span");
      a.textContent = k;
      const b = document.createElement("span");
      b.textContent = v;
      row.append(a, b);
      el.inspBody.appendChild(row);
    });
  }

  // ---------- Lightbox ----------
  function openViewer(index) {
    const list = visiblePhotos();
    if (!list.length) return;
    state.viewerIndex = index;
    paintViewer(list);
    el.lightbox.hidden = false;
  }

  function paintViewer(list) {
    const p = list[state.viewerIndex];
    if (!p) return;
    el.lbImg.hidden = p.video;
    el.lbVideo.hidden = !p.video;
    el.lbImg.style.background = p.grad;
    el.lbImg.alt = p.title;
    el.lbName.textContent = p.title;
    el.lbMeta.textContent = `${p.album} · ${formatDate(p.date)} · ${p.width} × ${p.height}`;
    el.lbFav.classList.toggle("on", p.fav);
    el.lbPrev.disabled = state.viewerIndex === 0;
    el.lbNext.disabled = state.viewerIndex === list.length - 1;
    showInspector(p);
  }

  function closeViewer() {
    el.lightbox.hidden = true;
    state.viewerIndex = -1;
  }

  function step(delta) {
    const list = visiblePhotos();
    const next = state.viewerIndex + delta;
    if (next < 0 || next >= list.length) return;
    state.viewerIndex = next;
    paintViewer(list);
  }

  // ---------- Aksi ----------
  function toggleFav(id) {
    const p = state.photos.find((x) => x.id === id);
    if (!p) return;
    p.fav = !p.fav;
    toast(p.fav ? "Ditambahkan ke Favorit" : "Dihapus dari Favorit");
    render();
    if (state.viewerIndex >= 0) paintViewer(visiblePhotos());
    if (state.selectedId === id) showInspector(p);
  }

  function setFilter(filter) {
    state.filter = filter;
    render();
  }

  function setTheme(theme) {
    el.body.classList.toggle("theme-light", theme === "light");
    el.body.classList.toggle("theme-dark", theme !== "light");
    toast(theme === "light" ? "Mode terang" : "Mode gelap");
  }

  function savePrefs() {
    try {
      localStorage.setItem("galery.prefs", JSON.stringify({
        view: state.view, size: state.size, sort: state.sort, theme: el.body.classList.contains("theme-light") ? "light" : "dark"
      }));
    } catch (_) { /* localStorage bisa diblokir; abaikan */ }
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem("galery.prefs");
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.view) state.view = p.view;
      if (p.size) state.size = p.size;
      if (p.sort) state.sort = p.sort;
      if (p.theme) setThemeSilent(p.theme);
    } catch (_) { /* prefs rusak: pakai bawaan */ }
  }

  function setThemeSilent(theme) {
    el.body.classList.toggle("theme-light", theme === "light");
    el.body.classList.toggle("theme-dark", theme !== "light");
  }

  // ---------- Event ----------
  function bind() {
    document.querySelectorAll(".side-item[data-filter]").forEach((node) => {
      node.addEventListener("click", () => setFilter(node.dataset.filter));
    });
    el.counts.albums.querySelectorAll("[data-album]").forEach((node) => {
      node.addEventListener("click", () => setFilter("ALBUM:" + node.dataset.album));
    });

    document.querySelectorAll(".seg button[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.view = btn.dataset.view;
        document.querySelectorAll(".seg button[data-view]").forEach((b) => b.classList.toggle("active", b === btn));
        render();
        savePrefs();
      });
    });

    document.querySelectorAll(".seg button[data-size]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.size = btn.dataset.size;
        document.querySelectorAll(".seg button[data-size]").forEach((b) => b.classList.toggle("active", b === btn));
        render();
        savePrefs();
      });
    });

    el.sort.addEventListener("change", () => {
      state.sort = el.sort.value;
      render();
      savePrefs();
    });

    el.search.addEventListener("input", () => {
      state.query = el.search.value;
      el.searchWrap.classList.toggle("filled", state.query.length > 0);
      render();
    });
    el.searchClear.addEventListener("click", () => {
      el.search.value = "";
      state.query = "";
      el.searchWrap.classList.remove("filled");
      render();
      el.search.focus();
    });

    $("#themeBtn").addEventListener("click", () => {
      const light = el.body.classList.contains("theme-light");
      setTheme(light ? "dark" : "light");
      savePrefs();
    });

    $("#importBtn").addEventListener("click", () => {
      document.getElementById("fileInput").click();
    });

    document.getElementById("fileInput").addEventListener("change", (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      files.forEach((f, i) => {
        state.photos.unshift({
          id: "u" + Date.now() + i,
          name: f.name,
          title: f.name.replace(/\.[^.]+$/, ""),
          album: "Harian",
          artist: "Impor",
          date: new Date().toISOString(),
          width: 0, height: 0,
          size: f.size,
          fav: false,
          video: f.type.startsWith("video/"),
          duration: 0,
          grad: "linear-gradient(135deg, #4a5568, #2d3748)",
          url: URL.createObjectURL(f)
        });
      });
      toast(files.length + " berkas diimpor");
      render();
    });

    $("#lbBackdrop").addEventListener("click", closeViewer);
    el.lbClose.addEventListener("click", closeViewer);
    el.lbPrev.addEventListener("click", () => step(-1));
    el.lbNext.addEventListener("click", () => step(1));
    el.lbFav.addEventListener("click", () => {
      const list = visiblePhotos();
      const p = list[state.viewerIndex];
      if (p) toggleFav(p.id);
    });
    el.lbDownload.addEventListener("click", () => {
      const p = visiblePhotos()[state.viewerIndex];
      if (!p) return;
      if (p.url) {
        const a = document.createElement("a");
        a.href = p.url;
        a.download = p.name;
        a.click();
      } else {
        toast("Berkas contoh tidak tersedia untuk diunduh");
      }
    });

    // drag & drop
    let depth = 0;
    window.addEventListener("dragenter", (e) => {
      e.preventDefault();
      depth++;
      el.dropzone.classList.add("show");
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if (!depth) el.dropzone.classList.remove("show");
    });
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      depth = 0;
      el.dropzone.classList.remove("show");
    });

    // keyboard
    window.addEventListener("keydown", (e) => {
      const inViewer = !el.lightbox.hidden;
      if (e.key === "Escape") {
        if (inViewer) closeViewer();
        return;
      }
      if (inViewer) {
        if (e.key === "ArrowLeft") step(-1);
        if (e.key === "ArrowRight") step(1);
        if (e.key.toLowerCase() === "f") el.lbFav.click();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        el.search.focus();
        el.search.select();
      }
    });

    // tombol window (di Electron ditangani preload/main)
    document.querySelector(".light-close").addEventListener("click", () => {
      if (window.galery && window.galery.close) window.galery.close();
      else toast("Tutup jendela");
    });
    document.querySelector(".light-min").addEventListener("click", () => {
      if (window.galery && window.galery.minimize) window.galery.minimize();
      else toast("Perkecil jendela");
    });
    document.querySelector(".light-max").addEventListener("click", () => {
      if (window.galery && window.galery.toggleMaximize) window.galery.toggleMaximize();
      else toast("Perbesar jendela");
    });
  }

  // ---------- Start ----------
  state.photos = seedPhotos();
  loadPrefs();
  bind();
  render();
  showInspector(null);

  // sinkronkan kontrol dengan prefs tersimpan
  document.querySelectorAll(".seg button[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  document.querySelectorAll(".seg button[data-size]").forEach((b) => b.classList.toggle("active", b.dataset.size === state.size));
  el.sort.value = state.sort;
})();
