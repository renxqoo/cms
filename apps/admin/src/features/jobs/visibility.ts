export const browserVisibility: Pick<
  Document,
  'visibilityState' | 'addEventListener' | 'removeEventListener'
> = {
  get visibilityState() {
    return typeof document === 'undefined' ? 'hidden' : document.visibilityState;
  },
  addEventListener: (...args: Parameters<Document['addEventListener']>) =>
    document.addEventListener(...args),
  removeEventListener: (...args: Parameters<Document['removeEventListener']>) =>
    document.removeEventListener(...args),
};
