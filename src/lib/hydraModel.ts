/*
 * HydraFusion as a MODEL, not as a hidden switch.
 *
 * The reference product (GitHub Copilot) puts HydraFusion in the model picker
 * like any other model: "you select HydraFusion like any other model, and it
 * chooses a workflow" (Project HydraFusion announcement). The reader picks it
 * once and stays on it until they pick something else.
 *
 * This module is the single place that answers "is this turn HydraFusion's to
 * route?" — so the picker, the composer chip and both send paths cannot drift
 * apart on the answer. It deliberately does NOT read
 * `settings.hydrafusion.enabled`: that flag used to be the switch, and it is
 * exactly what made HydraFusion engage on its own for readers who never asked
 * for it. The setting stays as availability/configuration; SELECTING the entry
 * is what routes a turn.
 */

/** The sentinel model id the picker stores when the reader picks HydraFusion. */
export const HYDRA_MODEL_ID = 'hydrafusion';

/**
 * True when the stored model selection means "HydraFusion routes this turn".
 *
 * The model can be stored either bare (`hydrafusion`) or provider-qualified
 * (`hydra/hydrafusion`) depending on which surface wrote it, so both forms are
 * accepted. Everything else — including an empty model — is a normal model.
 */
export function pilihHydra(modelId: string | null | undefined): boolean {
  const id = String(modelId ?? '').trim().toLowerCase();
  if (!id) return false;
  return id === HYDRA_MODEL_ID || id.endsWith(`/${HYDRA_MODEL_ID}`);
}

/**
 * What the composer chip shows for the current selection.
 *
 * `label` is what the reader sees; `sub` explains what will happen, because a
 * reader who picks HydraFusion deserves to know the app is choosing models for
 * them rather than being surprised by a different model name in the transcript.
 */
export function labelHydra(): { label: string; sub: string } {
  return {
    label: 'HydraFusion',
    sub: 'picks the model and the workflow for each task',
  };
}
