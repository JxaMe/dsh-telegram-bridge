import { createProxiedFetch } from './proxy-fetch.js';
import { currentVersion } from './version.js';
export async function checkLatestVersion(proxyUrl) {
    const current = currentVersion();
    const fetchFn = proxyUrl ? createProxiedFetch(proxyUrl) : fetch;
    try {
        const res = await fetchFn('https://api.github.com/repos/JxaMe/dsh-telegram-bridge/releases/latest', {
            headers: { 'User-Agent': 'dsh-telegram-bridge' },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
            return { latest: current, hasUpdate: false };
        }
        const data = await res.json();
        const latest = String(data.tag_name ?? '').replace(/^v/, '') || current;
        return {
            latest,
            hasUpdate: compareVersions(latest, current) > 0,
            url: data.html_url,
        };
    }
    catch {
        return { latest: current, hasUpdate: false };
    }
}
function compareVersions(a, b) {
    const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
    const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
        const na = pa[i] ?? 0;
        const nb = pb[i] ?? 0;
        if (na > nb)
            return 1;
        if (na < nb)
            return -1;
    }
    return 0;
}
