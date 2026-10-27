import { initialSnapshot, readInitialSnapshot } from '../editor/initial-snapshot.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';
import type { PresetAction } from './preset-access-contracts.ts';

interface SnapshotScope {
  action: PresetAction;
  constraint: string;
  id?: string | undefined;
}
function scoped(state: ContentState, input: SnapshotScope): ContentState {
  return {
    ...state,
    collection: {
      ...state.collection,
      key: `${state.collection.key}:query-preset:${input.id ?? 'create'}:${input.action}:${input.constraint}`,
    },
  };
}
export function presetInitialData(
  state: ContentState,
  runtime: ContentRuntime,
  input: SnapshotScope & { token: string },
): DocumentData {
  return readInitialSnapshot(scoped(state, input), runtime, input.token);
}
export function presetInitialSnapshot(
  state: ContentState,
  runtime: ContentRuntime,
  input: SnapshotScope & { data: DocumentData },
): string {
  return initialSnapshot(scoped(state, input), runtime, input.data);
}
