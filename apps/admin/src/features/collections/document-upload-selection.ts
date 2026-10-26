import { readReadyUpload } from './read-editor';
import type { ApiResult } from '../../api/result';
import type { DocumentChannelState } from './channel-types';
interface SelectionContext {
  id: string;
  acquire: () => AbortController | null;
  state: () => DocumentChannelState;
  live: (controller: AbortController) => boolean;
  update: (change: (state: DocumentChannelState) => DocumentChannelState) => void;
  report: (result: ApiResult<unknown>) => void;
  release: (controller: AbortController) => void;
}
export async function selectDocumentUpload(context: SelectionContext) {
  if (context.state().snapshot.document) return;
  const controller = context.acquire();
  if (!controller) return;
  const result = await readReadyUpload({
    collection: context.state().snapshot.collection,
    uploadId: context.id,
    signal: controller.signal,
  });
  if (!context.live(controller)) return;
  context.report(result);
  context.release(controller);
  context.update((state) => ({
    ...state,
    phase: 'idle',
    error: result.ok ? null : result,
    snapshot: result.ok ? { ...state.snapshot, upload: result.data } : state.snapshot,
    success: false,
  }));
}
