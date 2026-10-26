import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { z } from 'zod';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { assetJobSchema } from '../../contracts/assets';
import type { AssetJob, ImageRecipe } from '../../contracts/assets';
import type { ApiFailure } from '../management-shared/read-all-pages';
import { assetUiPolicy } from './policy';

interface ProcessingState {
  phase: 'idle' | 'running' | 'paused' | 'finished';
  job: AssetJob | null;
  error: ApiFailure | null;
}
interface ProcessingOptions {
  collection: string;
  id: string;
  onChanged: () => void | Promise<void>;
  onBusyChange: (busy: boolean) => void;
  reportResult: (result: ApiResult<unknown>) => void;
}
interface Intent {
  key: string;
  recipe: ImageRecipe;
  revision: number;
  jobId: string | null;
}
interface Runtime {
  options: ProcessingOptions;
  store: StoreApi<ProcessingState>;
  intent: Intent | null;
  active: AbortController | null;
  timer: ReturnType<typeof setTimeout> | null;
  deadline: number;
  disposed: boolean;
  visible: boolean;
}
const receiptSchema = z.object({ jobId: z.uuid(), uploadId: z.uuid() });

function stop(runtime: Runtime) {
  runtime.active?.abort();
  runtime.active = null;
  clearTimeout(runtime.timer ?? undefined);
  runtime.timer = null;
}
function pause(runtime: Runtime, error: ApiFailure | null = null) {
  stop(runtime);
  if (!runtime.disposed) runtime.store.setState({ phase: 'paused', error });
}
function live(runtime: Runtime, controller: AbortController) {
  return !runtime.disposed && runtime.active === controller && !controller.signal.aborted;
}
function failed(runtime: Runtime, error: ApiFailure, writing: boolean) {
  runtime.options.reportResult(error);
  if (!writing || error.uncertain || error.status === 429) pause(runtime, error);
  else {
    stop(runtime);
    runtime.store.setState({ phase: 'finished', error });
    runtime.options.onBusyChange(false);
  }
}
async function ensureJob(runtime: Runtime, controller: AbortController): Promise<string | null> {
  const { intent, options } = runtime;
  if (!intent) return null;
  if (intent.jobId) return intent.jobId;
  const receipt = await requestApi({
    operation: 'assets.reprocess',
    params: { collection: options.collection, id: options.id },
    body: { revision: intent.revision, recipe: intent.recipe },
    response: receiptSchema,
    signal: controller.signal,
    idempotencyKey: intent.key,
  });
  if (!live(runtime, controller)) return null;
  if (!receipt.ok) {
    failed(runtime, receipt, true);
    return null;
  }
  intent.jobId = receipt.data.jobId;
  return intent.jobId;
}
async function terminal(runtime: Runtime, controller: AbortController, job: AssetJob) {
  runtime.store.setState({ job });
  if (job.status === 'succeeded') {
    try {
      await runtime.options.onChanged();
    } catch {
      if (live(runtime, controller)) pause(runtime, failure('request_failed', 0));
      return;
    }
  }
  if (live(runtime, controller)) {
    stop(runtime);
    runtime.store.setState({ phase: 'finished', error: null });
    runtime.options.onBusyChange(false);
  }
}
async function read(runtime: Runtime, controller: AbortController) {
  const jobId = await ensureJob(runtime, controller);
  if (!jobId || !live(runtime, controller)) return;
  const result = await requestApi({
    operation: 'content.getJob',
    params: { collection: runtime.options.collection, jobId },
    response: assetJobSchema,
    signal: controller.signal,
  });
  if (!live(runtime, controller)) return;
  if (!result.ok) {
    failed(runtime, result, false);
    return;
  }
  if (!['queued', 'running'].includes(result.data.status)) {
    await terminal(runtime, controller, result.data);
    return;
  }
  runtime.store.setState({ job: result.data, error: null });
  if (Date.now() >= runtime.deadline || !runtime.visible) pause(runtime);
  else
    runtime.timer = setTimeout(() => {
      void read(runtime, controller);
    }, assetUiPolicy.pollIntervalMs);
}
function resume(runtime: Runtime) {
  if (!runtime.intent || runtime.disposed || !runtime.visible) return;
  stop(runtime);
  const controller = new AbortController();
  runtime.active = controller;
  runtime.deadline = Date.now() + assetUiPolicy.maximumWaitMs;
  runtime.store.setState({ phase: 'running', error: null });
  void read(runtime, controller);
}

export function createProcessingController(options: ProcessingOptions) {
  const runtime: Runtime = {
    options,
    store: createStore<ProcessingState>(() => ({ phase: 'idle', job: null, error: null })),
    intent: null,
    active: null,
    timer: null,
    deadline: 0,
    disposed: false,
    visible: true,
  };
  return {
    store: runtime.store,
    activate() {
      runtime.disposed = false;
    },
    start(input: { revision: number; recipe: ImageRecipe }) {
      if (runtime.disposed || ['running', 'paused'].includes(runtime.store.getState().phase))
        return;
      runtime.intent = { ...input, key: crypto.randomUUID(), jobId: null };
      options.onBusyChange(true);
      resume(runtime);
    },
    resume: () => resume(runtime),
    setVisible(next: boolean) {
      runtime.visible = next;
      if (!next && runtime.active) pause(runtime);
    },
    dispose() {
      runtime.disposed = true;
      stop(runtime);
    },
  };
}
