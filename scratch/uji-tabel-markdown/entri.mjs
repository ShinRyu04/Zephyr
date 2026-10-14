import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export function render(md) {
  return renderToStaticMarkup(React.createElement(Markdown, { remarkPlugins: [remarkGfm] }, md));
}
