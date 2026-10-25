import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal('ResizeObserver', TestResizeObserver);
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
}));

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {};

const pointerCaptures = new WeakMap<Element, Set<number>>();

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function (this: Element, pointerId: number) {
    const captured = pointerCaptures.get(this) ?? new Set<number>();
    captured.add(pointerId);
    pointerCaptures.set(this, captured);
  };
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = function (this: Element, pointerId: number) {
    pointerCaptures.get(this)?.delete(pointerId);
  };
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function (this: Element, pointerId: number) {
    return pointerCaptures.get(this)?.has(pointerId) ?? false;
  };
}

afterEach(cleanup);
