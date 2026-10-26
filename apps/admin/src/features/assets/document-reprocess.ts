import { failure } from '../../api/result';
import type { AssetJob } from '../../contracts/assets';
import { createPolling } from '../jobs/polling';
import { assetWorkPolicy } from '../jobs/policy';
import { browserVisibility } from '../jobs/visibility';
import type { AssetWorkRuntime } from './document-work-types';
import {
  blockAssetWork,
  finishAssetWork,
  terminalPhase,
  sessionMatchesWork,
  rejectedAssetWork,
} from './document-work-results';

function receivedJob(runtime: AssetWorkRuntime, job: AssetJob) {
  if (runtime.disposed || runtime.finished) return;
  if (
    job.id !== runtime.receipt?.jobId ||
    job.collection !== runtime.input.collection ||
    job.uploadId !== runtime.receipt.uploadId ||
    job.action !== 'reprocess'
  ) {
    blockAssetWork(runtime, failure('invalid_response', 502, { uncertain: true }));
    runtime.poller?.dispose();
    return;
  }
  runtime.store.setState({ job, error: null });
  if (!['queued', 'running'].includes(job.status)) void confirmJobTerminal(runtime, job);
}

async function confirmJobTerminal(runtime: AssetWorkRuntime, job: AssetJob) {
  if (runtime.active || !runtime.receipt) return;
  runtime.active = true;
  runtime.poller?.dispose();
  runtime.store.setState({ phase: 'refreshing' });
  try {
    const result = await runtime.services.uploads.read({
      collection: runtime.input.collection,
      uploadId: runtime.receipt.uploadId,
      signal: runtime.signal,
    });
    if (runtime.disposed || runtime.signal.aborted) return;
    if (!result.ok) {
      blockAssetWork(runtime, result);
      return;
    }
    const expected = terminalUploadStatuses(job.status);
    if (
      result.data.id !== runtime.receipt.uploadId ||
      !sessionMatchesWork(runtime, result.data) ||
      !expected.includes(result.data.status)
    ) {
      blockAssetWork(runtime, failure('invalid_response', 502, { uncertain: true }));
      return;
    }
    runtime.session = result.data;
  } catch {
    blockAssetWork(runtime, failure('request_failed', 0));
    return;
  } finally {
    runtime.active = false;
  }
  await finishAssetWork(runtime, terminalPhase(job.status));
}

export function observeReprocessing(runtime: AssetWorkRuntime) {
  if (!runtime.receipt || runtime.disposed || runtime.finished) return;
  runtime.poller?.dispose();
  runtime.stopPolling?.();
  const { receipt } = runtime;
  const poller = createPolling({
    read: (signal) =>
      runtime.services.job({
        collection: runtime.input.collection,
        id: receipt.jobId,
        signal: AbortSignal.any([signal, runtime.signal]),
      }),
    terminal: (job) => !['queued', 'running'].includes(job.status),
    onResult: (result) => {
      if (!result.ok) blockAssetWork(runtime, result);
    },
    intervalMs: assetWorkPolicy.detailPollMs,
    budgetMs: assetWorkPolicy.automaticWaitMs,
    visibility: browserVisibility,
  });
  runtime.poller = poller;
  runtime.stopPolling = poller.store.subscribe((state) => {
    if (state.phase === 'ready' && state.data) receivedJob(runtime, state.data);
    if (state.paused) {
      runtime.store.setState({ paused: state.paused, retryAt: state.retryAt });
      if (state.paused === 'deadline' && !runtime.blocked) {
        runtime.blocked = true;
        runtime.store.setState({ phase: 'blocked' });
        runtime.input.lease.finish('blocked');
      }
    }
  });
  poller.start();
}

export async function startReprocessing(runtime: AssetWorkRuntime) {
  if (runtime.input.kind !== 'reprocess' || runtime.disposed || runtime.finished || runtime.active)
    return;
  runtime.active = true;
  runtime.store.setState({ phase: 'processing', error: null, paused: null });
  try {
    const result = await runtime.services.reprocess({
      collection: runtime.input.collection,
      id: runtime.input.documentId,
      revision: runtime.input.lease.revision,
      recipe: runtime.input.recipe,
      key: runtime.key,
      signal: runtime.signal,
    });
    runtime.active = false;
    if (runtime.disposed || runtime.signal.aborted) return;
    runtime.input.report(result);
    if (!result.ok) {
      if (result.uncertain || result.status === 429) {
        if (!result.uncertain) runtime.rejected = result;
        blockAssetWork(runtime, result);
      } else rejectedAssetWork(runtime, result);
      return;
    }
    runtime.receipt = result.data;
    observeReprocessing(runtime);
  } catch {
    runtime.active = false;
    blockAssetWork(runtime, failure('request_failed', 0, { uncertain: true }));
  }
}

function terminalUploadStatuses(status: string) {
  if (status === 'succeeded') return ['consumed'];
  return status === 'failed' ? ['failed'] : ['cancelled', 'expired'];
}
