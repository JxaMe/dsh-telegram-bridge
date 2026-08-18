import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
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
    setDebugEnabled(enabled) {
        this.debugEnabled = enabled;
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
    write(level, message) {
        const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}\n`;
        try {
            this.rotateIfNeeded();
            appendFileSync(this.filePath, line, 'utf8');
        }
        catch {
            // Logging must never break the plugin.
        }
    }
    rotateIfNeeded() {
        try {
            const stat = statSync(this.filePath);
            if (stat.size > 5 * 1024 * 1024) {
                renameSync(this.filePath, `${this.filePath}.1`);
            }
        }
        catch {
            // No file yet or rotation failed; ignore.
        }
    }
}
