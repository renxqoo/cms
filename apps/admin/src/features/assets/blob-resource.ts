export function createBlobResource(blob: Blob | null) {
  let url: string | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => url,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      if (blob && !url) {
        url = URL.createObjectURL(blob);
        for (const notify of listeners) notify();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && url) {
          URL.revokeObjectURL(url);
          url = null;
        }
      };
    },
  };
}
