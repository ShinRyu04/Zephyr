import type { ProviderModel } from './modelCatalog';

export type SubagentTaskCategory =
  | 'read-only-exploration'
  | 'planning-review'
  | 'code-worker'
  | 'visual-image'
  | 'fast-simple'
  | 'general';

export type SubagentModelSource = 'auto' | 'manual-task' | 'manual-worker' | 'manual-batch' | 'chat-fallback';

export interface SubagentModelCandidate extends ProviderModel {
  provider: string;
  /** The provider has a usable configured credential and endpoint. */
  available?: boolean;
}

export interface RouteSubagentModelInput {
  task: string;
  candidates: SubagentModelCandidate[];
  chatFallback: { provider: string; model: string };
  manualTask?: { provider?: string; model: string };
  manualWorker?: { provider?: string; model: string };
  manualBatch?: { provider?: string; model: string };
}

export interface RoutedSubagentModel {
  provider: string;
  model: string;
  source: SubagentModelSource;
  reason: string;
}

const words = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function classifySubagentTask(text: string): SubagentTaskCategory {
  const t = text.toLowerCase();
  if (/\b(image|visual|visualize|screenshot|mockup|png|jpeg|jpg|diagram|picture|gambar)\b/.test(t)) return 'visual-image';
  if (/\b(plan|planning|roadmap|design|architecture|review|audit|trade[- ]?off|risks?|risiko|analys[ei]s|why|kenapa)\b/.test(t)) return 'planning-review';
  if (/\b(implement|write|edit|modify|fix|add|remove|refactor|code|coding|implementasi|perbaiki|ubah|buat|tulis|hapus)\b/.test(t)) return 'code-worker';
  if (/\b(search|find|explore|exploration|inspect|read|map|locate|usage|usages|cari|jelajah|temukan|baca|peta|pemakaian)\b/.test(t)) return 'read-only-exploration';
  if (words(t).length <= 12 || /\b(simple|quick|small|terjemah|summarize|format|rename|cek)\b/.test(t)) return 'fast-simple';
  return 'general';
}

function capabilityScore(candidate: SubagentModelCandidate, category: SubagentTaskCategory): number {
  const text = `${candidate.id} ${candidate.label} ${candidate.note ?? ''}`.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(text);
  if (category === 'visual-image') return has(/multi.?modal|image|vision|gambar|visual/) ? 100 : 0;
  if (category === 'planning-review') return has(/reason|reasoning|penalar|thinking|opus|pro/) ? 100 : has(/agent|coding/) ? 20 : 0;
  if (category === 'code-worker') return has(/coding|code|agentik|agent|coder|multi.?agent/) ? 100 : 0;
  if (category === 'read-only-exploration' || category === 'fast-simple') return has(/fast|cheap|lite|mini|nano|hemat|efficient|flash/) ? 100 : 0;
  return has(/agent|coding|reason|pro|flagship/) ? 50 : 10;
}

export function routeSubagentModel(input: RouteSubagentModelInput): RoutedSubagentModel {
  const override = input.manualWorker ?? input.manualTask ?? input.manualBatch;
  if (override) {
    const source: SubagentModelSource = input.manualWorker
      ? 'manual-worker'
      : input.manualTask
        ? 'manual-task'
        : 'manual-batch';
    return {
      provider: override.provider ?? input.chatFallback.provider,
      model: override.model,
      source,
      reason: source === 'manual-worker' ? 'Custom worker model override.' : source === 'manual-task' ? 'Explicit task model tag.' : 'Subagent batch model setting.',
    };
  }
  const category = classifySubagentTask(input.task);
  const available = input.candidates.filter((candidate) => candidate.available !== false && candidate.provider && candidate.id);
  const ranked = available
    .map((candidate, index) => ({ candidate, score: capabilityScore(candidate, category), index }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen = ranked[0]?.candidate;
  if (!chosen) {
    return {
      provider: input.chatFallback.provider,
      model: input.chatFallback.model,
      source: 'chat-fallback',
      reason: `No available ${category} model; using the configured chat model.`,
    };
  }
  return {
    provider: chosen.provider,
    model: chosen.id,
    source: 'auto',
    reason: `${category}: selected ${chosen.label || chosen.id} from its ${chosen.note ? 'capability note' : 'model metadata'}.`,
  };
}
