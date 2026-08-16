import { ProxyAgent, fetch as undiciFetch } from 'undici';

/**
 * Create a fetch function that routes through the local HTTP(S) proxy and
 * normalizes grammY's AbortSignal polyfill to a native AbortSignal so undici
 * accepts it.
 */
export function createProxiedFetch(proxyUrl: string): typeof fetch {
  const dispatcher = new ProxyAgent(proxyUrl);

  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const signal = normalizeSignal(init?.signal);
    return undiciFetch(input as Parameters<typeof undiciFetch>[0], { ...init, signal, dispatcher } as Parameters<typeof undiciFetch>[1]);
  }) as unknown as typeof fetch;
}

function normalizeSignal(signal: AbortSignal | null | undefined): AbortSignal | undefined {
  if (!signal) return undefined;
  if (typeof AbortSignal !== 'undefined' && signal instanceof AbortSignal) {
    return signal;
  }

  const controller = new AbortController();
  if (signal.aborted) {
    controller.abort(signal.reason);
  } else {
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}
