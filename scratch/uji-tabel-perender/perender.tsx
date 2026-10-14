import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';

const MdTabel: NonNullable<Components['table']> = ({ children }) => (
  <div className="ai-tabel-bungkus" data-testid="ai-tabel-bungkus" style={{ overflowX: 'auto' }}>
    <table>{children}</table>
  </div>
);

const MD_UJI: Components = { table: MdTabel };
export function render(md: string) {
  return renderToStaticMarkup(<Markdown remarkPlugins={[remarkGfm]} components={MD_UJI}>{md}</Markdown>);
}
