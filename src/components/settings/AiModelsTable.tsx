import { useMemo } from 'react';
import { useT } from '../../lib/i18n';
import { PROVIDERS, type ProviderModel } from '../../lib/modelCatalog';
import { HYDRA_MODEL_ID } from '../../lib/hydraModel';

/*
 * The model list, in the shape the reference product uses: a table with
 * Name / Context Size / Capabilities.
 *
 * WHY a table and not another dropdown: the picker answers "which one answers
 * this turn", and it must stay short. This is the other question — "what can
 * these models actually do, and how big is their window" — which a dropdown
 * cannot answer at all. The reader asked for this view by pointing at the
 * product's Language Models editor.
 *
 * Capabilities are DERIVED from the catalogue's own `note`, not invented: a
 * model whose note says multimodal/gambar/vision gets Vision, and one whose note
 * mentions agent/tool/coding gets Tools. Anything the catalogue does not claim is
 * left blank rather than guessed, because a wrong capability chip is worse than
 * an empty cell — the reader would pick a model for something it cannot do.
 */

interface Baris {
  id: string;
  label: string;
  provider: string;
  ctx?: number;
  tools: boolean;
  vision: boolean;
  note?: string;
  hydra?: boolean;
}

const POLA_VISION = /multimodal|vision|gambar|image|lihat/i;
const POLA_TOOLS = /agent|agentik|tool|coding|code|penalaran|reason/i;

/**
 * Window size for the table.
 *
 * NOT `fmtCtx`: that one appends "ctx" (redundant under a column headed
 * "Context Size") and prints `1048576` as `1.048576M`, which reads as a
 * precision claim nobody made. One decimal is the most a catalogue figure can
 * honestly support.
 */
function ukuranKonteks(ctx?: number): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) {
    const jt = ctx / 1_000_000;
    return `${Number.isInteger(jt) ? jt : jt.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}M`;
  }
  return `${Math.round(ctx / 1000)}K`;
}

function barisDari(p: string, m: ProviderModel): Baris {
  const note = m.note ?? '';
  return {
    id: m.id,
    label: m.label || m.id,
    provider: p,
    ctx: m.ctx,
    tools: POLA_TOOLS.test(note),
    vision: POLA_VISION.test(note),
    note: note || undefined,
  };
}

export default function AiModelsTable() {
  const tr = useT();

  const baris = useMemo(() => {
    const daftar: Baris[] = PROVIDERS.flatMap((p) =>
      (p.models ?? [])
        /* Placeholder rows ("type a name") are prompts, not models. */
        .filter((m) => m.id && m.id !== 'custom-model' && m.id !== 'local-default')
        .map((m) => barisDari(p.id, m)),
    );
    /*
     * HydraFusion is a model in the picker, so it is a row here too — with the
     * capabilities it actually has. It routes to models that carry tools and it
     * can pass images to a vision model, but it is NOT itself a model with a
     * context window, so the ctx cell stays blank instead of borrowing one.
     */
    daftar.unshift({
      id: HYDRA_MODEL_ID,
      label: 'HydraFusion',
      provider: 'hydra',
      tools: true,
      vision: true,
      note: tr('Research preview'),
      hydra: true,
    });
    return daftar;
  }, [tr]);

  return (
    <div className="aim-table-wrap" data-testid="aim-table">
      <table className="aim-table">
        <thead>
          <tr>
            <th>{tr('Name')}</th>
            <th>{tr('Context Size')}</th>
            <th>{tr('Capabilities')}</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => (
            <tr
              key={`${b.provider}/${b.id}`}
              data-testid="aim-table-row"
              data-model={b.id}
              data-provider={b.provider}
              className={b.hydra ? 'is-hydra' : undefined}
            >
              <td>
                <span className="aim-td-name">{b.label}</span>
                <span className="aim-td-sub">
                  {b.hydra ? tr('the app picks the model and the workflow per task') : b.provider}
                </span>
              </td>
              <td className="aim-td-ctx">{ukuranKonteks(b.ctx)}</td>
              <td>
                <span className="aim-caps">
                  {b.tools && <span className="aim-cap">{tr('Tools')}</span>}
                  {b.vision && <span className="aim-cap">{tr('Vision')}</span>}
                  {!b.tools && !b.vision && <span className="aim-td-sub">—</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
