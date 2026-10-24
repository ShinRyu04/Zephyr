const startedAt = Date.now();
let counter = 0;

const $ = (id) => document.getElementById(id);

/* ---------- Navigasi ---------- */

function pindahView(nama) {
	document.querySelectorAll(".view").forEach((v) => {
		v.classList.toggle("active", v.id === "view-" + nama);
	});
	document.querySelectorAll(".sidebar-item, .dock-item").forEach((b) => {
		b.classList.toggle("active", b.dataset.view === nama);
	});
	if (nama === "sistem") muatSistem();
}

document.querySelectorAll(".sidebar-item, .dock-item").forEach((btn) => {
	btn.addEventListener("click", () => pindahView(btn.dataset.view));
});

/* ---------- Jam + uptime ---------- */

function dua(n) {
	return String(n).padStart(2, "0");
}

function formatUptime(ms) {
	const s = Math.floor(ms / 1000);
	if (s < 60) return s + "s";
	const m = Math.floor(s / 60);
	if (m < 60) return m + "m " + (s % 60) + "s";
	return Math.floor(m / 60) + "j " + (m % 60) + "m";
}

function tick() {
	const now = new Date();
	$("clock").textContent =
		dua(now.getHours()) + ":" + dua(now.getMinutes()) + ":" + dua(now.getSeconds());
	$("date").textContent = now.toLocaleDateString("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	$("menu-clock").textContent = dua(now.getHours()) + ":" + dua(now.getMinutes());
	$("uptime").textContent = formatUptime(Date.now() - startedAt);
}

tick();
setInterval(tick, 1000);

/* ---------- Counter ---------- */

function renderCounter() {
	$("counter").textContent = String(counter);
}

$("btn-count").addEventListener("click", () => {
	counter += 1;
	renderCounter();
});

$("btn-reset").addEventListener("click", () => {
	counter = 0;
	renderCounter();
});

/* ---------- Mode gelap ---------- */

const darkToggle = $("dark-toggle");

function terapkanTema(gelap) {
	document.body.classList.toggle("dark", gelap);
	darkToggle.checked = gelap;
	try {
		localStorage.setItem("tz.theme", gelap ? "dark" : "light");
	} catch (e) {}
}

darkToggle.addEventListener("change", () => terapkanTema(darkToggle.checked));

try {
	terapkanTema(localStorage.getItem("tz.theme") === "dark");
} catch (e) {
	terapkanTema(false);
}

/* ---------- Catatan ---------- */

const note = $("note");
const noteStatus = $("note-status");

function simpanCatatan() {
	try {
		localStorage.setItem("tz.note", note.value);
	} catch (e) {}
	noteStatus.textContent = note.value.trim()
		? note.value.trim().split(/\s+/).length + " kata tersimpan"
		: "kosong";
}

try {
	note.value = localStorage.getItem("tz.note") || "";
} catch (e) {}

simpanCatatan();
note.addEventListener("input", simpanCatatan);

$("btn-clear-note").addEventListener("click", () => {
	note.value = "";
	simpanCatatan();
});

/* ---------- Informasi sistem ---------- */

let sudahMuatSistem = false;

async function muatSistem() {
	if (sudahMuatSistem) return;
	const body = $("sys-body");
	if (!window.zephyr) {
		body.innerHTML = "<tr><td>IPC</td><td>tidak tersedia (bukan Electron)</td></tr>";
		return;
	}
	try {
		const info = await window.zephyr.getSystemInfo();
		const baris = [
			["Platform", info.platform],
			["Arsitektur", info.arch],
			["Versi Electron", info.electron],
			["Versi Chromium", info.chrome],
			["Versi Node", info.node],
			["Versi aplikasi", info.app],
			["Direktori home", info.home],
		];
		body.innerHTML = baris
			.map(([k, v]) => {
				const key = document.createElement("td");
				key.textContent = k;
				const val = document.createElement("td");
				val.textContent = v || "-";
				const tr = document.createElement("tr");
				tr.append(key, val);
				return tr.outerHTML;
			})
			.join("");
		sudahMuatSistem = true;
	} catch (err) {
		body.innerHTML = "";
		const tr = document.createElement("tr");
		const td = document.createElement("td");
		td.colSpan = 2;
		td.textContent = "gagal memuat: " + err.message;
		tr.append(td);
		body.append(tr);
	}
}

/* ---------- Kontrol jendela ---------- */

$("btn-min").addEventListener("click", () => {
	if (window.zephyr) window.zephyr.minimize();
});

$("btn-max").addEventListener("click", () => {
	if (window.zephyr) window.zephyr.maximize();
});

$("btn-close").addEventListener("click", () => {
	if (window.zephyr) window.zephyr.close();
});

document.addEventListener("keydown", (e) => {
	if (e.key === "Escape" && window.zephyr) window.zephyr.close();
});
