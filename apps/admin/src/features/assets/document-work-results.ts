import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import type { UploadSession } from '../../contracts/assets';
import type { QueueUpload } from './upload-queue-types';
import { permitsAssetWork } from './document-work-services';
import type { AssetWorkRuntime, AssetWorkState } from './document-work-types';

export function blockAssetWork(runtime: AssetWorkRuntime, result: ApiResult<unknown>) {
  if (runtime.disposed || runtime.finished || result.ok) return;
  runtime.input.report(result);
  runtime.store.setState({
    phase: 'blocked',
    error: result,
    retryAt:
      result.retryAfterSeconds === null ? null : Date.now() + result.retryAfterSeconds * 1000,
  });
  if (!runtime.blocked) {
    runtime.blocked = true;
    runtime.input.lease.finish('blocked');
  }
}

export async function finishAssetWork(runtime: AssetWorkRuntime, phase: AssetWorkState['phase']) {
  if (runtime.disposed || runtime.finished || runtime.active) return;
  runtime.active = true;
  runtime.poller?.dispose();
  runtime.store.setState({ phase: 'refreshing' });
  let result: ApiResult<unknown>;
  try {
    result = await runtime.input.lease.refresh(runtime.signal);
  } catch {
    result = failure('request_failed', 0);
  } finally {
    runtime.active = false;
  }
  if (runtime.disposed || runtime.signal.aborted) return;
  runtime.input.report(result);
  if (!result.ok) {
    blockAssetWork(runtime, result);
    return;
  }
  runtime.finished = true;
  runtime.store.setState({
    phase,
    error: phase === 'failed' ? (runtime.rejected ?? runtime.store.getState().error) : null,
    paused: null,
    retryAt: null,
  });
  runtime.input.lease.finish('confirmed');
}

async function consumeReady(runtime: AssetWorkRuntime, session: UploadSession) {
  runtime.active = true;
  runtime.store.setState({ phase: 'consuming', error: null });
  try {
    if (!permitsAssetWork(runtime.input, 'documents.update')) {
      blockAssetWork(runtime, failure('forbidden', 403, { uncertain: true }));
      return false;
    }
    const result = await runtime.input.lease.consumeUpload(session.id, runtime.signal);
    if (runtime.disposed || runtime.signal.aborted) return false;
    runtime.input.report(result);
    if (!result.ok) {
      blockAssetWork(runtime, result);
      return false;
    }
    const consumed = await runtime.services.uploads.read({
      collection: runtime.input.collection,
      uploadId: session.id,
      signal: runtime.signal,
    });
    if (runtime.disposed || runtime.signal.aborted) return false;
    if (!consumed.ok) {
      blockAssetWork(runtime, consumed);
      return false;
    }
    if (
      consumed.data.id !== session.id ||
      consumed.data.status !== 'consumed' ||
      !sessionMatchesWork(runtime, consumed.data)
    ) {
      blockAssetWork(runtime, failure('invalid_response', 502, { uncertain: true }));
      return false;
    }
    runtime.session = consumed.data;
    runtime.queue?.store.setState((state) => ({
      items: state.items.map<QueueUpload>((item) =>
        item.session?.id === consumed.data.id
          ? { ...item, session: consumed.data, stage: 'consumed' }
          : item,
      ),
    }));
    return true;
  } catch {
    blockAssetWork(runtime, failure('request_failed', 0, { uncertain: true }));
    return false;
  } finally {
    runtime.active = false;
  }
}

export async function settleSession(runtime: AssetWorkRuntime, session: UploadSession) {
  if (runtime.disposed || runtime.finished || runtime.active) return;
  runtime.session = session;
  if (session.status === 'consumed') {
    await finishAssetWork(runtime, 'succeeded');
    return;
  }
  if (['cancelled', 'expired', 'failed'].includes(session.status)) {
    await finishAssetWork(runtime, session.status === 'failed' ? 'failed' : 'cancelled');
    return;
  }
  if (session.status === 'ready' && (await consumeReady(runtime, session)))
    await finishAssetWork(runtime, 'succeeded');
}

export function terminalPhase(status: string): AssetWorkState['phase'] {
  if (status === 'succeeded') return 'succeeded';
  return status === 'failed' ? 'failed' : 'cancelled';
}

export function rejectedAssetWork(runtime: AssetWorkRuntime, result: ApiResult<unknown>) {
  if (result.ok) return;
  runtime.rejected = result;
  runtime.store.setState({ error: result });
  void finishAssetWork(runtime, 'failed');
}

export function sessionMatchesWork(runtime: AssetWorkRuntime, session: UploadSession) {
  return (
    session.collection === runtime.input.collection &&
    session.purpose === 'replace' &&
    session.documentId === runtime.input.documentId &&
    session.revision === runtime.input.lease.revision
  );
}
