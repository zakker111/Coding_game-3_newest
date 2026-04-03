import '@testing-library/jest-dom/vitest'

// jsdom doesn’t provide ResizeObserver.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
}

// jsdom doesn’t implement canvas; calling getContext throws unless an optional native
// canvas dependency is installed. Our tests don’t assert on rendering, so a null context
// is sufficient.
if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => null,
  })
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'devicePixelRatio', {
    value: 1,
    writable: true,
  })
}
