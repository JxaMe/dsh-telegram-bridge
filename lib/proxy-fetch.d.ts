/**
 * Create a fetch function that routes through the local HTTP(S) proxy and
 * normalizes grammY's AbortSignal polyfill to a native AbortSignal so undici
 * accepts it.
 */
export declare function createProxiedFetch(proxyUrl: string): typeof fetch;
