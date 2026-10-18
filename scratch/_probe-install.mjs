import { Cdp } from "./scripts/lib-cdp.mjs";
const { cdp } = await Cdp.attach(9223, "Zephyr");
const out = await cdp.json(`return JSON.stringify(await (async () => {
  const EX = window.__ZEPHYR_EXT19__;
  const { KATALOG_BUNDLED } = await import("/src/lib/extCatalog.ts");
  const item = KATALOG_BUNDLED.find((k) => k.id === "zephyr.tema-samudra");
  const ok = await EX.installKatalog({ ...item, bundled: true, url: "" });
  const s = EX.state?.() ?? null;
  return { itemAda: !!item, ok, err: s?.err ?? null, info: s?.info ?? null, manifests: (s?.manifests ?? []).map(m => ({id: m.manifest?.id, enabled: m.enabled, error: m.error})) };
})().catch((e) => ({ fatal: String(e) })))`, 60000);
console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
process.exit(0);
