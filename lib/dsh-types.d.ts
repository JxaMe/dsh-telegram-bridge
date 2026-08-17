/**
 * Minimal local declarations for the dsh host APIs used by this plugin.
 * The real implementations are provided by the dsh runtime; these types only
 * keep the plugin self-contained for TypeScript compilation.
 */
export interface DshResultOk<T> {
    ok: true;
    value: T;
}
export interface DshResultErr {
    ok: false;
    error: {
        code?: string;
        message?: string;
        [key: string]: unknown;
    };
}
export type DshResult<T> = DshResultOk<T> | DshResultErr;
export interface DshRpcResponse<T> {
    rpcId?: string;
    result: DshResult<T>;
}
export interface DshTextContent {
    type: 'text';
    text: string;
}
export interface DshSessionModels {
    current: {
        provider?: string;
        model?: string;
        reasoningEffort?: string;
    };
    groups: Array<{
        id: string;
        models: Array<{
            id: string;
            name?: string;
            reasoning?: {
                efforts?: Array<{
                    id: string;
                    name?: string;
                }>;
                defaultEffort?: string;
            };
        }>;
    }>;
}
export interface DshPresetEntry {
    id: string;
    name?: string;
    description?: string;
    trust?: 'system' | 'user';
    isDefault?: boolean;
    broken?: string;
}
export interface DshAgentLike {
    readonly status?: 'idle' | 'running';
    readonly options?: {
        provider?: string;
        model?: string;
        maxTokens?: number;
    };
    readonly session?: {
        readonly events?: ReadonlyArray<unknown>;
    };
    cancel(cause: {
        kind: 'user';
    }, options?: {
        keepInbox?: boolean;
    }): void;
}
export interface DshApi {
    sessions: {
        create(req: {
            rpcId: string;
            payload: {
                cwd?: string;
                agentPreset?: string;
            };
        }): Promise<DshRpcResponse<{
            sessionId: string;
        }>>;
        prompt(req: {
            rpcId: string;
            payload: {
                sessionId: string;
                mode: 'queue' | 'steer';
                content: DshTextContent[];
            };
        }): Promise<DshRpcResponse<{
            accepted: true;
            command?: {
                kind: 'success';
                text?: string;
            };
        }>>;
        models(req: {
            rpcId: string;
            payload: {
                sessionId: string;
            };
        }): Promise<DshRpcResponse<DshSessionModels>>;
        selectModel(req: {
            rpcId: string;
            payload: {
                sessionId: string;
                provider: string;
                model: string;
                reasoningEffort?: string;
            };
        }): Promise<DshRpcResponse<{
            selected: unknown;
        }>>;
    };
    llm: {
        models(req: {
            rpcId: string;
            payload: {};
        }): Promise<DshRpcResponse<{
            groups: DshSessionModels['groups'];
        }>>;
    };
    agentPresets: {
        list(req: {
            rpcId: string;
            payload: {};
        }): Promise<DshRpcResponse<{
            presets: DshPresetEntry[];
        }>>;
        select(req: {
            rpcId: string;
            payload: {
                sessionId: string;
                agentPreset: string;
            };
        }): Promise<DshRpcResponse<{
            agentPreset: string;
        }>>;
    };
}
export interface DshContext {
    apiProxy: DshApi;
    agents: {
        get(sessionId: string): DshAgentLike | undefined;
    };
    commands?: {
        execute(agent: unknown, line: string, signal: AbortSignal): Promise<{
            result: {
                kind: string;
                text?: string;
            };
        } | undefined>;
    };
    logger: {
        warn(message: string): void;
        info?(message: string): void;
    };
    on(event: string, listener: (session: unknown, event: unknown) => void): void;
    get<T = unknown>(name: string): T | undefined;
    effect(fn: () => void | (() => void), label?: string): void;
    webServer?: {
        register(options: {
            kind: 'prefix';
            path: string;
            handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void | Promise<void>;
        }): unknown;
    };
}
