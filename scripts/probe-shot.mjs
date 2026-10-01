import { Cdp } from "./lib-cdp.mjs";
import fs from "node:fs";
const { cdp } = await Cdp.attach("9223");
await cdp.runAsync(`
  S.getState().setSettingsOpen(false); TS().setVisible(false);
  S.setState({ sidebarVisible: true }); S.getState().setActivity("devenv");
  for (let i=0;i<60;i++){ await wait(100); if(document.querySelector('[data-testid="dv-row-path"]')) break; }
  await wait(1200);
  return "ok";
`, 60000);
const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
fs.mkdirSync("screenshots", { recursive: true });
fs.writeFileSync("screenshots/devenv-icons.png", Buffer.from(shot.result.data, "base64"));
console.log("saved screenshots/devenv-icons.png");
await cdp.close();
