import { readFile, rename, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const CONFIG_FILE_NAME = 'config.json';
const LOOPBACKS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
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
                        sendJson(res, 200, {
                            config: toPublicConfig(config),
                            presets: await listPresets(ctx),
                        });
                        return;
                    }
                    if (req.method === 'POST' && suffix === '/settings') {
                        const body = JSON.parse((await readBody(req)) || '{}');
                        const saved = await saveConfig(dataDir, body);
                        sendJson(res, 200, { ok: true, config: toPublicConfig(saved) });
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
    };
}
async function listModels(ctx, dataDir) {
    try {
        let sessionId = await findAnySessionId(dataDir);
        if (!sessionId) {
            const res = await ctx.apiProxy.sessions.create({
                rpcId: crypto.randomUUID(),
                payload: { cwd: (await readConfig(dataDir)).projectRoot || process.cwd() },
            });
            if (res.result.ok) {
                sessionId = res.result.value.sessionId;
            }
        }
        if (!sessionId)
            return [];
        const res = await ctx.apiProxy.sessions.models({
            rpcId: crypto.randomUUID(),
            payload: { sessionId },
        });
        if (!res.result.ok)
            return [];
        return res.result.value.groups;
    }
    catch {
        return [];
    }
}
async function findAnySessionId(dataDir) {
    try {
        const raw = await readFile(path.join(dataDir, 'state.json'), 'utf8');
        const state = JSON.parse(raw);
        for (const chat of Object.values(state.chats ?? {})) {
            if (chat?.sessionId)
                return chat.sessionId;
        }
    }
    catch {
        // No state file yet.
    }
    return undefined;
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
    const parsed = JSON.parse(raw);
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
