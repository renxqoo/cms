import { createStore } from 'zustand/vanilla';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { folderListSchema } from '../../contracts/content';
import { flattenFolders } from './folder-directory';
import type { FolderOption } from './folder-directory';
import type { FolderExpectation } from './folder-intent';
import type { ContentFailure } from './channel-types';
interface RecoveryState {
  phase: 'idle' | 'reading' | 'ready' | 'failed';
  row: FolderOption | null;
  error: ContentFailure | null;
}
export interface FolderReaderInput {
  collection: string;
  canRead: boolean;
  report: (result: ApiResult<unknown>) => void;
}
const initial: RecoveryState = { phase: 'idle', row: null, error: null };
class FolderReader {
  private store = createStore<RecoveryState>(() => initial);
  private active: AbortController | null = null;
  constructor(private input: FolderReaderInput) {}
  getSnapshot = () => this.store.getState();
  subscribe = (listener: () => void) => this.store.subscribe(listener);
  configure(input: FolderReaderInput) {
    this.input = input;
    if (input.canRead) return;
    this.active?.abort();
    this.active = null;
    const state = this.getSnapshot();
    if (
      state.phase === 'idle' ||
      (state.phase === 'failed' && state.error?.error.code === 'forbidden')
    )
      return;
    this.store.setState({ phase: 'failed', row: null, error: failure('forbidden', 403) }, true);
  }
  async read(expected: FolderExpectation) {
    if (!this.input.canRead || this.active) return false;
    const controller = new AbortController();
    this.active = controller;
    this.store.setState({ phase: 'reading', row: null, error: null }, true);
    const result = await requestApi({
      operation: 'folders.list',
      query: { collection: this.input.collection },
      response: folderListSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted || this.active !== controller || !this.input.canRead)
      return false;
    this.active = null;
    this.input.report(result);
    if (!result.ok) {
      this.store.setState({ phase: 'failed', row: null, error: result }, true);
      return false;
    }
    const row =
      expected.kind === 'create'
        ? null
        : (flattenFolders(result.data.rows).find((folder) => folder.id === expected.id) ?? null);
    this.store.setState({ phase: 'ready', row, error: null }, true);
    return true;
  }
  reset() {
    if (!this.active) this.store.setState(initial, true);
  }
  dispose() {
    this.active?.abort();
    this.active = null;
  }
}
export function createFolderReader(input: FolderReaderInput) {
  return new FolderReader(input);
}
