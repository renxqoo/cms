import { managementReadPolicy } from './policy';

export function readBudget(parent: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  function abort() {
    controller.abort(parent.reason);
  }
  if (parent.aborted) abort();
  else parent.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, managementReadPolicy.deadlineMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    close() {
      clearTimeout(timer);
      parent.removeEventListener('abort', abort);
    },
  };
}
