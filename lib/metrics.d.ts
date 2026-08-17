export interface RuntimeMetrics {
    startedAt: number;
    uptimeSeconds: number;
    messagesReceived: number;
    repliesSent: number;
    errors: number;
}
export declare function incrMessageReceived(): void;
export declare function incrReplySent(): void;
export declare function incrError(): void;
export declare function getMetrics(): RuntimeMetrics;
