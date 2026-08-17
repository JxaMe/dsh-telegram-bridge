export declare class Logger {
    private debugEnabled;
    private filePath;
    constructor(dataDir: string, debugEnabled?: boolean);
    setDebugEnabled(enabled: boolean): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug(message: string): void;
    redact(value: unknown, token: string): string;
    private write;
}
