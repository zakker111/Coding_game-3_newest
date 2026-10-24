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

// Node 25+ exposes a `localStorage` global that is undefined unless --localstorage-file is
// passed, and it shadows jsdom's implementation. Install a minimal in-memory Storage so tests
// behave the same on every Node version.
function hasWorkingStorage(value: unknown): boolean {
  return (
    value != null &&
    typeof (value as Storage).getItem === 'function' &&
    typeof (value as Storage).setItem === 'function' &&
    typeof (value as Storage).clear === 'function'
  )
}

if (!hasWorkingStorage(globalThis.localStorage)) {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage,
    })
  }
}
