import { useCallback, useRef, useState } from 'react';
import AgentsTitleBar from './AgentsTitleBar';
import AgentsSidebar from './AgentsSidebar';
import AgentsKontrolSudut from './AgentsKontrolSudut';
import AgentsComposer from './AgentsComposer';
import AgentsPanelKanan from './AgentsPanelKanan';
/* Gaya jendela ini (`.agx-*`). Ia halaman sendiri (`#agents`), bukan bagian
   panel editor, jadi berkasnya dimuat di sini — `App.tsx` tidak mengimpornya. */
import '../../styles/agents2.css';

/*
 * Kerangka jendela Agents.
 *
 * Jendela ini frameless (`decorations: false`), jadi seluruh chrome-nya digambar
 * sendiri. Isinya: title bar di atas, sidebar di kiri, kotak besar di tengah
 * yang memuat kontrol sudut (`IDE ↗` + toggle panel kanan) dan composer, lalu
 * panel kanan yang bisa dibuka-tutup lewat tombol panel di kontrol sudut.
 *
 * PANEL KANAN BISA DI-DRAG (splitter seperti VS Code/TRAE): garis tipis
 * antara canvas dan panel kanan yang mengubah lebar panel. Persen disimpan di
 * state supaya kembali ke lebar terakhir saat panel dibuka lagi.
 */
const LEBAR_MIN = 24;
const LEBAR_MAX = 78;
/* Sidebar kiri dalam piksel, dengan batas seperti sidebar TRAE. */
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 360;

export default function AgentsApp() {
  const [sidebarTerbuka, setSidebarTerbuka] = useState(true);
  const [panelKanan, setPanelKanan] = useState(false);
  const [lebarKanan, setLebarKanan] = useState(45);
  const [lebarSidebar, setLebarSidebar] = useState(248);
  const dragRef = useRef(false);
  /* Titik nol drag disimpan supaya lebar dihitung dari DELTA kursor, bukan
     posisi absolut — tanpa ini panel melompat ke bawah kursor di frame
     pertama dan terasa "ikut semua". */
  const awalRef = useRef({ x: 0, lebar: 45 });
  const dragSideRef = useRef(false);
  const awalSideRef = useRef({ x: 0, lebar: 248 });

  const onPointerMoveSidebar = useCallback((e: React.PointerEvent) => {
    if (!dragSideRef.current) return;
    const lebar = awalSideRef.current.lebar + (e.clientX - awalSideRef.current.x);
    setLebarSidebar(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, lebar)));
  }, []);

  /* Hitung persen dari LEBAR PANEL (`.agx-body`), BUKAN dari rect splitter
     (lebarnya cuma beberapa px). */
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const body = e.currentTarget.parentElement;
    if (!body) return;
    const r = body.getBoundingClientRect();
    if (!r.width) return;
    const deltaPersen = ((awalRef.current.x - e.clientX) / r.width) * 100;
    const persen = awalRef.current.lebar + deltaPersen;
    setLebarKanan(Math.min(LEBAR_MAX, Math.max(LEBAR_MIN, persen)));
  }, []);

  return (
    <div className="agx" data-testid="agx-root">
      <AgentsTitleBar
        sidebarTerbuka={sidebarTerbuka}
        onToggleSidebar={() => setSidebarTerbuka((v) => !v)}
      />
      <div className="agx-body">
        {sidebarTerbuka && (
          <>
            <AgentsSidebar lebar={lebarSidebar} />
            {/* Splitter sidebar: tarik untuk mengubah lebar, sama seperti
                splitter panel kanan. */}
            <div
              className="agx-splitter"
              data-testid="agx-splitter-sidebar"
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                dragSideRef.current = true;
                awalSideRef.current = { x: e.clientX, lebar: lebarSidebar };
                e.currentTarget.setPointerCapture(e.pointerId);
                document.body.classList.add('agx-dragging-kolom');
                e.preventDefault();
              }}
              onPointerMove={onPointerMoveSidebar}
              onPointerUp={(e) => {
                dragSideRef.current = false;
                document.body.classList.remove('agx-dragging-kolom');
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                dragSideRef.current = false;
                document.body.classList.remove('agx-dragging-kolom');
              }}
            />
          </>
        )}
        <main className="agx-canvas" data-testid="agx-canvas">
          <AgentsKontrolSudut
            panelTerbuka={panelKanan}
            onTogglePanel={() => setPanelKanan((v) => !v)}
          />
          <AgentsComposer />
        </main>

        {panelKanan && (
          <>
            {/* Splitter: garis tipis antara canvas dan panel kanan. Kursor
                berubah jadi col-resize; tarik = ubah lebar panel. */}
            <div
              className="agx-splitter"
              data-testid="agx-splitter"
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                dragRef.current = true;
                awalRef.current = { x: e.clientX, lebar: lebarKanan };
                e.currentTarget.setPointerCapture(e.pointerId);
                /* Seleksi teks di seluruh halaman selama drag membuat
                   canvas ikut "tersorot"; kelas ini mematikannya, dan
                   kursor tetap col-resize walau pointer keluar splitter. */
                document.body.classList.add('agx-dragging-kolom');
                e.preventDefault();
              }}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => {
                dragRef.current = false;
                document.body.classList.remove('agx-dragging-kolom');
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                dragRef.current = false;
                document.body.classList.remove('agx-dragging-kolom');
              }}
            />
            <AgentsPanelKanan
              lebar={lebarKanan}
              onTogglePanel={() => setPanelKanan((v) => !v)}
            />
          </>
        )}
      </div>
    </div>
  );
}
