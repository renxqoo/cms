import 'server-only';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { collectionOGPolicy as policy } from './collection-og-policy';
export interface OGRenderInput {
  title: string;
  description: string;
  brand: string;
  signal: AbortSignal;
}
function unavailable() {
  return new Response(null, { status: 503 });
}
export function renderCollectionOG(input: OGRenderInput): Promise<Response> {
  if (input.signal.aborted) return Promise.resolve(unavailable());
  return new Promise((resolve) => {
    const worker = imageWorker(input);
    let settled = false;
    function finish(response: Response) {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener('abort', cancel);
      void worker.terminate().then(
        () => {
          worker.removeAllListeners();
          return resolve(response);
        },
        () => {
          worker.removeAllListeners();
          return resolve(unavailable());
        },
      );
    }
    function cancel() {
      finish(unavailable());
    }
    worker.once('error', cancel);
    worker.once('exit', cancel);
    worker.once('message', (value: unknown) => {
      if (
        !(value instanceof ArrayBuffer) ||
        value.byteLength === 0 ||
        value.byteLength > policy.maxImageBytes
      )
        finish(unavailable());
      else
        finish(
          new Response(value, {
            headers: { 'Content-Type': 'image/png', 'Content-Length': String(value.byteLength) },
          }),
        );
    });
    input.signal.addEventListener('abort', cancel, { once: true });
    if (input.signal.aborted) cancel();
  });
}

function imageWorker(input: OGRenderInput): Worker {
  return new Worker(new URL('../../.generated/og-worker.mjs', import.meta.url), {
    execArgv: [],
    env: { NODE_ENV: process.env.NODE_ENV ?? 'production' },
    resourceLimits: { maxOldGenerationSizeMb: policy.workerMemoryMiB },
    workerData: {
      title: input.title,
      description: input.description,
      brand: input.brand,
      fontFile: join(process.cwd(), policy.fontFile),
      width: policy.width,
      height: policy.height,
      maxImageBytes: policy.maxImageBytes,
    },
  });
}
