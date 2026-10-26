import type { ApiResult } from '../../api/result';
import type { ContentFailure } from './channel-types';
import type { EditorSnapshot } from './read-editor';
interface ReaderState {
  key: string;
  phase: 'loading' | 'ready' | 'failed';
  data: EditorSnapshot | null;
  error: ContentFailure | null;
}
class EditorReader {
  private state: ReaderState = { key: '', phase: 'loading', data: null, error: null };
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(value: ReaderState) {
    this.state = value;
    this.listeners.forEach((listener) => listener());
  }
  start(input: {
    key: string;
    revision: number;
    enabled: boolean;
    load: (signal: AbortSignal) => Promise<ApiResult<EditorSnapshot>>;
    report: (result: ApiResult<unknown>) => void;
  }) {
    const { key, enabled } = input;
    this.active?.abort();
    const data = this.state.key === key ? this.state.data : null;
    this.update({ key, phase: enabled ? 'loading' : 'failed', data, error: null });
    if (!enabled) return () => {};
    const controller = new AbortController();
    this.active = controller;
    void input.load(controller.signal).then((result) => {
      if (controller.signal.aborted || this.active !== controller) return result;
      input.report(result);
      this.update({
        key,
        phase: result.ok ? 'ready' : 'failed',
        data: result.ok ? result.data : data,
        error: result.ok ? null : result,
      });
      return result;
    });
    return () => controller.abort();
  }
}
export function createEditorReader() {
  return new EditorReader();
}
