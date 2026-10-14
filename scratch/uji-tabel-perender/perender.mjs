import { jsx } from "react/jsx-runtime";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderToStaticMarkup } from "react-dom/server";
const MdTabel = ({ children }) => /* @__PURE__ */ jsx("div", { className: "ai-tabel-bungkus", "data-testid": "ai-tabel-bungkus", style: { overflowX: "auto" }, children: /* @__PURE__ */ jsx("table", { children }) });
const MD_UJI = { table: MdTabel };
function render(md) {
  return renderToStaticMarkup(/* @__PURE__ */ jsx(Markdown, { remarkPlugins: [remarkGfm], components: MD_UJI, children: md }));
}
export {
  render
};
