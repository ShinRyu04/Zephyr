import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { createRequire } from "node:module";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
const require2 = createRequire(import.meta.url);
const React = require2("react");
const { renderToStaticMarkup } = require2("react-dom/server");
const { useState } = React;
const useAi = (sel) => {
  const s = { runInTerminal: () => {
  }, setToast: () => {
  } };
  return sel ? sel(s) : s;
};
const tx = (s) => s;
const tf = (s) => s;
const clipboardWrite = async () => {
};
const SHELL_LANGS = /* @__PURE__ */ new Set(["bash", "sh", "shell", "zsh", "pwsh", "powershell", "ps1", "cmd", "bat"]);
const barisDiff = () => [];
const bagiHunk = () => [];
const ringkasDiff = () => ({ tambah: 0, hapus: 0 });
const EditDiff = () => null;
const isDestructive = () => false;
const AiIkon = () => null;
const MdPre = ({ children }) => React.createElement(React.Fragment, null, children);
const MdTabel = ({ children }) => React.createElement("div", null, React.createElement("table", null, children));
const MdLink = ({ href, children }) => React.createElement("a", { href }, children);
const KODE_LANG = /language-([\w-]+)/;
const REF_RE = /^((?:\.{0,2}[\/\\])?[\w@.\/\\-]+(?:\.\w{1,8}))(?::(\d+))?$/;
function CodeBlock({ code, lang }) {
  const runInTerminal = useAi((s) => s.runInTerminal);
  const setToast = useAi((s) => s.setToast);
  const isShell = SHELL_LANGS.has(lang);
  const [pratinjau, setPratinjau] = useState(null);
  const terapkan = () => {
    void import("../../lib/store").then(({ useStore }) => {
      const s = useStore.getState();
      const id = s.activeTabId;
      if (!id) return setToast(tx("No active editor tab"));
      const tab = s.tabs.find((t) => t.id === id);
      const lama = tab?.content ?? "";
      if (lama === code) return setToast(tx("The file contents are already the same as this code"));
      setPratinjau(barisDiff(lama, code));
    });
  };
  const konfirmasiTerapkan = () => {
    setPratinjau(null);
    void import("../../lib/store").then(({ useStore }) => {
      const s = useStore.getState();
      const id = s.activeTabId;
      if (!id) return setToast(tx("No active editor tab"));
      s.updateTabContent(id, code);
      setToast(tx("Tab contents replaced - Ctrl+S to save"));
    });
  };
  const terapkanSebagian = (teks, diterima) => {
    const total = pratinjau ? bagiHunk(pratinjau).length : 0;
    setPratinjau(null);
    void import("../../lib/store").then(({ useStore }) => {
      const s = useStore.getState();
      const id = s.activeTabId;
      if (!id) return setToast(tx("No active editor tab"));
      s.updateTabContent(id, teks);
      setToast(tf("{a} of {b} changes applied - Ctrl+S to save", { a: String(diterima), b: String(total) }));
    });
  };
  const sisipkan = () => {
    void import("../../lib/mcpStore").then(({ runAction }) => {
      void runAction("editor_insert", { text: code }).then((r) => {
        const rr = r;
        setToast(rr?.tabId ? tx("Code inserted at the cursor") : tx("No active tab to insert into"));
      });
    });
  };
  return /* @__PURE__ */ jsxs("div", { className: "ai-code", "data-lang": lang || "text", children: [
    /* @__PURE__ */ jsxs("div", { className: "ai-code-head", children: [
      /* @__PURE__ */ jsx("span", { className: "ai-code-lang", children: lang || "text" }),
      !isShell && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "ai-code-btn",
            "data-testid": "ai-apply-code",
            title: tx("Replace the active editor tab contents with this code"),
            onClick: terapkan,
            children: "Apply"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "ai-code-btn",
            "data-testid": "ai-insert-code",
            title: tx("Insert the code at the cursor position"),
            onClick: sisipkan,
            children: "Insert"
          }
        )
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "ai-code-btn",
          "data-testid": "ai-copy-code",
          onClick: () => {
            void clipboardWrite(code).then(() => setToast(tx("Code copied")));
          },
          children: "Copy"
        }
      ),
      isShell && /* @__PURE__ */ jsx(
        "button",
        {
          className: "ai-code-btn is-run",
          "data-testid": "ai-run-code",
          title: isDestructive(code) ? tx("Risky command - will ask for confirmation") : tx("Send to the active terminal pane"),
          onClick: () => void runInTerminal(code),
          children: tx("Run in Terminal")
        }
      )
    ] }),
    /* @__PURE__ */ jsx("pre", { className: "ai-pre", children: /* @__PURE__ */ jsx("code", { children: code }) }),
    pratinjau && /*
     * The apply-preview, drawn with the SAME diff grid as every other
     * change in the app.
     *
     * This block had its own `ai-diff-*` markup — a second, slightly
     * different numbered-gutter table that had to be kept in step with the
     * CLI tab's `cli-diff` by hand. It now runs through the shared
     * `EditDiff`, so an edit previewed here and the same edit reported by
     * the hosted CLI are pixel-identical; only the header differs, because
     * only this one has anything to apply.
     */
    /* @__PURE__ */ jsxs("div", { className: "ai-diff", "data-testid": "ai-diff", children: [
      /* @__PURE__ */ jsxs("div", { className: "ai-diff-head", children: [
        /* @__PURE__ */ jsxs("span", { className: "ai-diff-sum", children: [
          ringkasDiff(pratinjau).tambah,
          " lines added \xB7",
          " ",
          ringkasDiff(pratinjau).hapus,
          " lines removed"
        ] }),
        /* @__PURE__ */ jsx("button", { className: "ai-code-btn is-run", "data-testid": "ai-diff-ok", onClick: konfirmasiTerapkan, children: "Apply" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "ai-code-btn",
            "data-testid": "ai-diff-cancel",
            onClick: () => setPratinjau(null),
            children: "Cancel"
          }
        )
      ] }),
      /* @__PURE__ */ jsx(EditDiff, { rows: pratinjau, testidPrefix: "ai", onPickHunks: terapkanSebagian })
    ] })
  ] });
}
const MD_NARASI = {
  pre: MdPre,
  table: MdTabel,
  code: ({ className, children }) => {
    const text = String(children ?? "").replace(/\n$/, "");
    const m = KODE_LANG.exec(className ?? "");
    if (m || text.includes("\n")) {
      return /* @__PURE__ */ jsx(CodeBlock, { code: text, lang: (m?.[1] ?? "").toLowerCase() });
    }
    if (text.length > 80) return /* @__PURE__ */ jsx(Fragment, { children: text });
    return /* @__PURE__ */ jsx("code", { className: "ai-inline", children: text });
  },
  a: MdLink
};
const MD_JAWABAN = {
  pre: MdPre,
  table: MdTabel,
  code: ({ className, children }) => {
    const text = String(children ?? "").replace(/\n$/, "");
    const m = KODE_LANG.exec(className ?? "");
    if (!m && !text.includes("\n")) {
      if (text.length > 80) return /* @__PURE__ */ jsx(Fragment, { children: text });
      const ref = REF_RE.exec(text);
      if (ref) {
        return /* @__PURE__ */ jsx(
          "button",
          {
            className: "ai-file-ref",
            "data-testid": "ai-file-ref",
            title: `Open ${ref[1]}${ref[2] ? `:${ref[2]}` : ""}`,
            onClick: () => {
              void import("../../lib/store").then(({ useStore }) => {
                const line = ref[2] ? Number(ref[2]) : 1;
                const berkasRef = ref[1];
                if (berkasRef) void useStore.getState().openPathAt(berkasRef, line);
              });
            },
            children: text
          }
        );
      }
      return /* @__PURE__ */ jsx("code", { className: "ai-inline", children: text });
    }
    return /* @__PURE__ */ jsx(CodeBlock, { code: text, lang: (m?.[1] ?? "").toLowerCase() });
  },
  a: MdLink
};
function render(md, komp) {
  return renderToStaticMarkup(
    React.createElement(Markdown, { remarkPlugins: [remarkGfm], components: komp }, md)
  );
}
export {
  MD_JAWABAN,
  MD_NARASI,
  render
};
