import { readFile, rename, mkdir, writeFile } from 'node:fs/promises';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
const CONFIG_FILE_NAME = 'config.json';
const LOOPBACKS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const CSRF_WINDOW_MS = 5 * 60 * 1000; // token 有效期 5 分钟
// 进程级随机密钥：token 无法被无此密钥的一方伪造，远程/本地跨站 POST 拿不到。
const csrfSecret = randomBytes(32);
function csrfTokenFor(botToken, windowStart) {
    return createHmac('sha256', csrfSecret).update(`${botToken}:${windowStart}`).digest('hex');
}
function csrfWindows(now = Date.now()) {
    const window = Math.floor(now / CSRF_WINDOW_MS);
    return [window, window - 1]; // 当前 + 前一窗口，容忍毫秒级边界
}
function verifyCsrfToken(token, botToken, now = Date.now()) {
    if (typeof token !== 'string' || token.length === 0)
        return false;
    const given = Buffer.from(token);
    return csrfWindows(now).some((w) => {
        const expected = Buffer.from(csrfTokenFor(botToken, w));
        return given.length === expected.length && timingSafeEqual(given, expected);
    });
}
export function registerWebSettings(ctx, dataDir) {
    const webServer = ctx.webServer;
    if (!webServer)
        return;
    ctx.effect(() => {
        webServer.register({
            kind: 'prefix',
            path: '/dsh-telegram-bridge',
            handler: async (req, res) => {
                const remote = req.socket.remoteAddress ?? '';
                if (!LOOPBACKS.has(remote)) {
                    sendJson(res, 403, { error: 'loopback only' });
                    return;
                }
                const url = new URL(req.url ?? '/', 'http://x');
                const suffix = url.pathname.replace(/^\/dsh-telegram-bridge/, '') || '/';
                try {
                    if (req.method === 'GET' && suffix === '/settings') {
                        const config = await readConfig(dataDir);
                        const modelCatalog = await listModels(ctx);
                        sendJson(res, 200, {
                            config: toPublicConfig(config),
                            csrfToken: csrfTokenFor(config.botToken || '', csrfWindows()[0]),
                            csrfExpiresIn: CSRF_WINDOW_MS / 1000,
                            presets: await listPresets(ctx),
                            models: modelCatalog.groups,
                            modelError: modelCatalog.error,
                        });
                        return;
                    }
                    if (req.method === 'POST' && suffix === '/settings') {
                        const body = JSON.parse((await readBody(req)) || '{}');
                        // 校验 CSRF token：必须由一次 GET /settings 在 5 分钟内签发，且匹配当前 botToken。
                        const headerToken = req.headers['x-csrf-token'];
                        const config = await readConfig(dataDir);
                        if (!verifyCsrfToken(body.csrfToken || headerToken, config.botToken || '')) {
                            sendJson(res, 403, { error: 'invalid or expired CSRF token: refresh the settings page and retry' });
                            return;
                        }
                        const saved = await saveConfig(dataDir, body);
                        sendJson(res, 200, {
                            ok: true,
                            config: toPublicConfig(saved),
                            warning: '配置已保存，但需要重启 dsh-telegram-bridge 插件才能生效。',
                        });
                        return;
                    }
                    sendJson(res, 404, { error: 'no such endpoint' });
                }
                catch (error) {
                    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        });
    }, 'dsh-telegram-bridge: web settings routes');
}
function toPublicConfig(config) {
    return {
        botTokenSet: Boolean(config.botToken && config.botToken !== 'PASTE_BOT_TOKEN'),
        ownerId: config.ownerId,
        projectRoot: config.projectRoot ?? '',
        proxyEnabled: config.proxyEnabled ?? false,
        proxyUrl: config.proxyUrl ?? 'http://127.0.0.1:7890',
        defaultProvider: config.defaultProvider ?? '',
        defaultModel: config.defaultModel ?? '',
        defaultReasoningEffort: config.defaultReasoningEffort ?? '',
        defaultAgentPreset: config.defaultAgentPreset ?? '',
        errorDisplayMode: config.errorDisplayMode ?? 'raw',
        htmlFormatting: config.htmlFormatting ?? true,
        typingIndicator: config.typingIndicator ?? true,
        queueLimit: config.queueLimit ?? 20,
        debugLogging: config.debugLogging ?? false,
        statusLine: config.statusLine ?? true,
        maxSessionsPerChat: config.maxSessionsPerChat ?? 5,
    };
}
async function listModels(ctx) {
    try {
        const res = await ctx.apiProxy.llm.models({ rpcId: crypto.randomUUID(), payload: {} });
        if (!res.result.ok) {
            return { groups: [], error: `llm.models failed: ${JSON.stringify(res.result.error)}` };
        }
        return { groups: res.result.value.groups };
    }
    catch (error) {
        return { groups: [], error: `llm.models threw: ${error instanceof Error ? error.message : String(error)}` };
    }
}
async function listPresets(ctx) {
    try {
        const res = await ctx.apiProxy.agentPresets.list({ rpcId: crypto.randomUUID(), payload: {} });
        if (res.result.ok) {
            return res.result.value.presets.map((preset) => ({ id: preset.id, name: preset.name }));
        }
        return [];
    }
    catch {
        return [];
    }
}
async function readConfig(dataDir) {
    const configPath = path.join(dataDir, CONFIG_FILE_NAME);
    let raw;
    try {
        raw = await readFile(configPath, 'utf8');
    }
    catch {
        raw = '{}';
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        parsed = {};
    }
    return {
        botToken: typeof parsed.botToken === 'string' ? parsed.botToken : '',
        ownerId: typeof parsed.ownerId === 'number' ? parsed.ownerId : 0,
        projectRoot: typeof parsed.projectRoot === 'string' ? parsed.projectRoot : '',
        dataDir,
        proxyEnabled: parsed.proxyEnabled,
        proxyUrl: typeof parsed.proxyUrl === 'string' ? parsed.proxyUrl : 'http://127.0.0.1:7890',
        defaultProvider: typeof parsed.defaultProvider === 'string' ? parsed.defaultProvider : '',
        defaultModel: typeof parsed.defaultModel === 'string' ? parsed.defaultModel : '',
        defaultReasoningEffort: typeof parsed.defaultReasoningEffort === 'string' ? parsed.defaultReasoningEffort : '',
        defaultAgentPreset: typeof parsed.defaultAgentPreset === 'string' ? parsed.defaultAgentPreset : '',
        errorDisplayMode: parsed.errorDisplayMode === 'friendly' ? 'friendly' : 'raw',
        htmlFormatting: typeof parsed.htmlFormatting === 'boolean' ? parsed.htmlFormatting : true,
        typingIndicator: typeof parsed.typingIndicator === 'boolean' ? parsed.typingIndicator : true,
        queueLimit: typeof parsed.queueLimit === 'number' && parsed.queueLimit > 0 ? parsed.queueLimit : 20,
        debugLogging: typeof parsed.debugLogging === 'boolean' ? parsed.debugLogging : false,
        statusLine: typeof parsed.statusLine === 'boolean' ? parsed.statusLine : true,
        maxSessionsPerChat: typeof parsed.maxSessionsPerChat === 'number' && parsed.maxSessionsPerChat > 0 ? Math.floor(parsed.maxSessionsPerChat) : 5,
    };
}
async function saveConfig(dataDir, body) {
    const current = await readConfig(dataDir);
    const next = { ...current };
    if (typeof body.botToken === 'string' && body.botToken.trim().length > 0) {
        next.botToken = body.botToken.trim();
    }
    if (typeof body.ownerId === 'number' && Number.isFinite(body.ownerId)) {
        next.ownerId = body.ownerId;
    }
    if (typeof body.projectRoot === 'string') {
        next.projectRoot = body.projectRoot;
    }
    if (typeof body.proxyEnabled === 'boolean') {
        next.proxyEnabled = body.proxyEnabled;
    }
    if (typeof body.proxyUrl === 'string') {
        next.proxyUrl = body.proxyUrl;
    }
    if (typeof body.defaultProvider === 'string') {
        next.defaultProvider = body.defaultProvider;
    }
    if (typeof body.defaultModel === 'string') {
        next.defaultModel = body.defaultModel;
    }
    if (typeof body.defaultReasoningEffort === 'string') {
        next.defaultReasoningEffort = body.defaultReasoningEffort;
    }
    if (typeof body.defaultAgentPreset === 'string') {
        next.defaultAgentPreset = body.defaultAgentPreset;
    }
    if (body.errorDisplayMode === 'raw' || body.errorDisplayMode === 'friendly') {
        next.errorDisplayMode = body.errorDisplayMode;
    }
    if (typeof body.htmlFormatting === 'boolean') {
        next.htmlFormatting = body.htmlFormatting;
    }
    if (typeof body.typingIndicator === 'boolean') {
        next.typingIndicator = body.typingIndicator;
    }
    if (typeof body.queueLimit === 'number' && body.queueLimit > 0) {
        next.queueLimit = Math.floor(body.queueLimit);
    }
    if (typeof body.debugLogging === 'boolean') {
        next.debugLogging = body.debugLogging;
    }
    if (typeof body.statusLine === 'boolean') {
        next.statusLine = body.statusLine;
    }
    if (typeof body.maxSessionsPerChat === 'number' && body.maxSessionsPerChat > 0) {
        next.maxSessionsPerChat = Math.floor(body.maxSessionsPerChat);
    }
    await mkdir(dataDir, { recursive: true });
    const configPath = path.join(dataDir, CONFIG_FILE_NAME);
    const tmpPath = `${configPath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    await rename(tmpPath, configPath);
    return next;
}
function sendJson(res, status, value) {
    const body = JSON.stringify(value);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 131072) {
                reject(new Error('body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}
