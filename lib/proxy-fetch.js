import { ProxyAgent, fetch as undiciFetch } from 'undici';
/**
 * Create a fetch function that routes through the local HTTP(S) proxy and
 * normalizes grammY's AbortSignal polyfill to a native AbortSignal so undici
 * accepts it.
 */
export function createProxiedFetch(proxyUrl) {
    const dispatcher = new ProxyAgent(proxyUrl);
    return (async (input, init) => {
        const signal = normalizeSignal(init?.signal);
        return undiciFetch(input, { ...init, signal, dispatcher });
    });
}
function normalizeSignal(signal) {
    if (!signal)
        return undefined;
    if (typeof AbortSignal !== 'undefined' && signal instanceof AbortSignal) {
        return signal;
    }
    const controller = new AbortController();
    if (signal.aborted) {
        controller.abort(signal.reason);
    }
    else {
        signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
}
