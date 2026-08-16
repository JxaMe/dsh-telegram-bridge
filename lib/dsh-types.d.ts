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
    cancel(cause: {
        kind: 'user';
    }, options?: {
        keepInbox?: boolean;
    }): void;
}
export interface DshApi {
    sessions: {
        create(req: {
            cwd?: string;
            agentPreset?: string;
        }): Promise<DshResult<{
            sessionId: string;
        }>>;
        prompt(req: {
            sessionId: string;
            mode: 'queue' | 'steer';
            content: DshTextContent[];
        }): Promise<DshResult<{
            accepted: true;
            command?: {
                kind: 'success';
                text?: string;
            };
        }>>;
        models(req: {
            sessionId: string;
        }): Promise<DshResult<DshSessionModels>>;
        selectModel(req: {
            sessionId: string;
            provider: string;
            model: string;
            reasoningEffort?: string;
        }): Promise<DshResult<{
            selected: unknown;
        }>>;
    };
    agentPresets: {
        list(req: {}): Promise<DshResult<{
            presets: DshPresetEntry[];
        }>>;
        select(req: {
            sessionId: string;
            agentPreset: string;
        }): Promise<DshResult<{
            agentPreset: string;
        }>>;
    };
}
export interface DshContext {
    apiProxy: DshApi;
    agents: {
        get(sessionId: string): DshAgentLike | undefined;
    };
    logger: {
        warn(message: string): void;
        info?(message: string): void;
    };
    on(event: string, listener: (...args: any[]) => void): void;
    get<T = unknown>(name: string): T | undefined;
    effect(fn: () => void | (() => void)): void;
}
