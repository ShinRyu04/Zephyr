import { createRequire } from 'node:module';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
export function render(md) {
  return renderToStaticMarkup(React.createElement(Markdown, { remarkPlugins: [remarkGfm] }, md));
}
