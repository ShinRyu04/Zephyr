const fs = require("fs");
let c = fs.readFileSync("src/styles/modal-popup.css", "utf8");
c += `

/*
 * A panel in its OWN window (#panel=settings|extensions|tools).
 *
 * The OS window supplies the frame, so this root only has to fill it and let
 * the page scroll. No scrim, no radius, no shadow: the page IS the window.
 */
.panel-win {
  position: fixed;
  inset: 0;
  display: flex;
  min-height: 0;
  background: var(--bg1);
  color: var(--fg);
  overflow: hidden;
}

/* Settings keeps its two columns here, same as in the popup. */
.panel-win-dua {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.panel-win > .xv,
.panel-win > .tools-root {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.panel-win > .xv {
  overflow: auto;
}

.panel-win-kosong {
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--fg2);
  font-size: 13px;
}
`;
fs.writeFileSync("src/styles/modal-popup.css", c);
console.log("css panel-win ok");
