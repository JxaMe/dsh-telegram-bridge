import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
export class Logger {
    debugEnabled;
    filePath;
    constructor(dataDir, debugEnabled = false) {
        this.debugEnabled = debugEnabled;
        const logsDir = path.join(dataDir, 'logs');
        mkdirSync(logsDir, { recursive: true });
        this.filePath = path.join(logsDir, 'dsh-telegram-bridge.log');
    }
    info(message) {
        this.write('info', message);
        if (this.debugEnabled)
            console.log(`[dsh-telegram-bridge] ${message}`);
    }
    warn(message) {
        this.write('warn', message);
    }
    error(message) {
        this.write('error', message);
        console.error(`[dsh-telegram-bridge] ${message}`);
    }
    debug(message) {
        if (!this.debugEnabled)
            return;
        this.write('debug', message);
    }
    redact(value, token) {
        const text = toText(value);
        if (!token)
            return text;
        return text.split(token).join('[REDACTED]');
    }
    write(level, message) {
        const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}\n`;
        try {
            appendFileSync(this.filePath, line, 'utf8');
        }
        catch {
            // Logging must never break the plugin.
        }
    }
}
function toText(value) {
    if (typeof value === 'string')
        return value;
    if (value instanceof Error)
        return value.message;
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
