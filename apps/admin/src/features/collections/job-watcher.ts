import { requestApi } from '../../api/client';
import { contentJobSchema } from '../../contracts/assets';
import type { ContentFailure } from './channel-types';
import type { ApiResult } from '../../api/result';
import { contentPolicy } from './content-policy';
import type { z } from 'zod';
type ContentJob = z.infer<typeof contentJobSchema>;
export interface JobWatchState {
  data: ContentJob | null;
  error: ContentFailure | null;
  busy: boolean;
  paused: boolean;
}
interface WatchContext {
  collection: string;
  jobId: string;
  report: (result: ApiResult<unknown>) => void;
  changed: (state: JobWatchState) => void;
  terminal: () => void;
}
class JobWatcher {
  private state: JobWatchState = { data: null, error: null, busy: false, paused: false };
  private deadline = Date.now() + contentPolicy.maximumJobWaitMs;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private visible = true;
  constructor(private input: WatchContext) {}
  snapshot = () => this.state;
  private update(next: Partial<JobWatchState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...next };
    this.input.changed(this.state);
  }
  private schedule() {
    clearTimeout(this.timer);
    if (this.disposed || !this.visible || this.state.error || terminal(this.state.data)) return;
    if (Date.now() >= this.deadline) {
      this.update({ paused: true });
      return;
    }
    this.timer = setTimeout(
      () => void this.read(),
      Math.min(contentPolicy.jobIntervalMs, this.deadline - Date.now()),
    );
  }
  private async read() {
    if (this.disposed || this.controller || !this.visible) return;
    if (Date.now() >= this.deadline) {
      this.update({ paused: true });
      return;
    }
    const active = new AbortController();
    this.controller = active;
    this.update({ busy: true, paused: false, error: null });
    const result = await requestApi({
      operation: 'content.getJob',
      params: { collection: this.input.collection, jobId: this.input.jobId },
      response: contentJobSchema,
      signal: active.signal,
    });
    if (this.disposed || active.signal.aborted || this.controller !== active) return;
    this.controller = null;
    this.input.report(result);
    this.update({
      busy: false,
      error: result.ok ? null : result,
      ...(result.ok ? { data: result.data } : {}),
    });
    if (result.ok && terminal(result.data)) this.input.terminal();
    else this.schedule();
  }
  start() {
    this.disposed = false;
    void this.read();
  }
  continue() {
    this.deadline = Date.now() + contentPolicy.maximumJobWaitMs;
    this.update({ paused: false, error: null });
    void this.read();
  }
  visibility(value: boolean) {
    this.visible = value;
    clearTimeout(this.timer);
    if (!value) {
      this.controller?.abort();
      this.controller = null;
      this.update({ busy: false });
    } else if (!this.state.error && !this.state.paused) this.schedule();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.controller = null;
  }
}
export function createJobWatcher(input: WatchContext) {
  return new JobWatcher(input);
}
function terminal(job: ContentJob | null) {
  return job !== null && !['queued', 'running'].includes(job.status);
}
