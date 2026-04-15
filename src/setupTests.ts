// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

type MockWorkerRequest = {
  id?: string;
  type?: string;
};

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: MockWorkerRequest): void {
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          id: message.id,
          type: 'success',
          payload: message.type === 'initialize' ? undefined : null,
        },
      } as MessageEvent);
    });
  }

  terminate(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }
}

if (!globalThis.Worker) {
  Object.defineProperty(globalThis, 'Worker', {
    writable: true,
    value: MockWorker,
  });
}

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
}
