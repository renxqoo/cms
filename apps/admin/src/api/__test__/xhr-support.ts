export class TrackedTarget extends EventTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(...args: Parameters<EventTarget['addEventListener']>) {
    const [type, listener] = args;
    if (listener) {
      const existing = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      existing.add(listener);
      this.listeners.set(type, existing);
    }
    super.addEventListener(...args);
  }
  override removeEventListener(...args: Parameters<EventTarget['removeEventListener']>) {
    const [type, listener] = args;
    if (listener) this.listeners.get(type)?.delete(listener);
    super.removeEventListener(...args);
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}
