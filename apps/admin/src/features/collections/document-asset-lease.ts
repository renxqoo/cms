import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { documentSchema } from '../../contracts/content';
import type { Document } from '../../contracts/content';
import { writablePatch } from '../fields/writable-data';
import type { AssetWriteKind, AssetWriteLease } from '../assets/document-asset-types';
import { mergeEditorPatch } from './channel-data';
import type { DocumentChannelState } from './channel-types';
import type { EditorSnapshot } from './read-editor';
interface AssetLeaseContext {
  kind: AssetWriteKind;
  acquire: () => AbortController | null;
  current: () => DocumentChannelState;
  update: (change: (state: DocumentChannelState) => DocumentChannelState) => void;
  load: (id: string | undefined, signal: AbortSignal) => Promise<ApiResult<EditorSnapshot>>;
  report: (result: ApiResult<unknown>) => void;
  release: (controller: AbortController, outcome: 'confirmed' | 'blocked') => void;
  disposed: () => boolean;
  allowed: () => boolean;
  readable: () => boolean;
}
class DocumentAssetLease implements AssetWriteLease {
  readonly revision: number;
  readonly signal: AbortSignal;
  private refreshed = false;
  private finished = false;
  constructor(
    private context: AssetLeaseContext,
    private controller: AbortController,
    private initial: DocumentChannelState & { snapshot: EditorSnapshot & { document: Document } },
  ) {
    this.revision = initial.snapshot.document.revision;
    this.signal = controller.signal;
  }
  private live(signal: AbortSignal) {
    return (
      !this.finished &&
      !signal.aborted &&
      !this.controller.signal.aborted &&
      !this.context.disposed()
    );
  }
  private denied() {
    const result = failure('forbidden', 403);
    this.context.update((state) => ({ ...state, phase: 'blocked', error: result }));
    return result;
  }
  async consumeUpload(uploadId: string, signal: AbortSignal) {
    if (!this.live(signal) || this.context.kind !== 'replace')
      return failure('request_cancelled', 0);
    if (!this.context.allowed()) return this.denied();
    const result = await requestApi({
      operation: 'documents.update',
      params: {
        collection: this.initial.snapshot.document.collection,
        id: this.initial.snapshot.document.id,
      },
      body: { revision: this.revision, uploadId },
      response: documentSchema,
      signal: AbortSignal.any([signal, this.signal]),
    });
    if (this.live(signal)) {
      this.context.report(result);
      if (!result.ok) this.context.update((state) => ({ ...state, error: result }));
    }
    return result;
  }
  async refresh(signal: AbortSignal) {
    if (!this.live(signal)) return failure('request_cancelled', 0);
    if (!this.context.readable()) return this.denied();
    const result = await this.context.load(
      this.initial.snapshot.document.id,
      AbortSignal.any([signal, this.signal]),
    );
    if (!this.live(signal)) return failure('request_cancelled', 0);
    this.context.report(result);
    this.refreshed = result.ok;
    if (result.ok)
      this.context.update((state) => {
        const patch = writablePatch(
          this.initial.snapshot.editor.layout,
          this.initial.snapshot.document?.data ?? {},
          state.draft,
        );
        return {
          ...state,
          snapshot: result.data,
          draft: mergeEditorPatch(
            result.data.editor.layout,
            result.data.document?.data ?? {},
            patch,
          ),
          error: null,
          inspectionError: null,
          success: true,
        };
      });
    else this.context.update((state) => ({ ...state, inspectionError: result }));
    return result;
  }
  finish(outcome: 'confirmed' | 'blocked') {
    if (this.finished || this.context.disposed()) return;
    this.finished = outcome === 'confirmed' && this.refreshed;
    this.context.release(
      this.controller,
      outcome === 'confirmed' && this.refreshed ? 'confirmed' : 'blocked',
    );
  }
}
export function beginAssetWrite(context: AssetLeaseContext): AssetWriteLease | null {
  const initial = context.current();
  const { document } = initial.snapshot;
  if (!document) return null;
  const controller = context.acquire();
  return controller
    ? new DocumentAssetLease(context, controller, {
        ...initial,
        snapshot: { ...initial.snapshot, document },
      })
    : null;
}
