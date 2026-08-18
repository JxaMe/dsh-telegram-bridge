export declare const CSRF_WINDOW_MS: number;
export declare function csrfTokenFor(botToken: string, windowStart: number): string;
export declare function csrfWindows(now?: number): number[];
export declare function verifyCsrfToken(token: unknown, botToken: string, now?: number): boolean;
