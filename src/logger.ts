import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

export class Logger {
  private filePath: string;

  constructor(
    dataDir: string,
    private debugEnabled = false,
  ) {
    const logsDir = path.join(dataDir, 'logs');
    mkdirSync(logsDir, { recursive: true });
    this.filePath = path.join(logsDir, 'dsh-telegram-bridge.log');
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  info(message: string): void {
    this.write('info', message);
    if (this.debugEnabled) console.log(`[dsh-telegram-bridge] ${message}`);
  }

  warn(message: string): void {
    this.write('warn', message);
  }

  error(message: string): void {
    this.write('error', message);
    console.error(`[dsh-telegram-bridge] ${message}`);
  }

  debug(message: string): void {
    if (!this.debugEnabled) return;
    this.write('debug', message);
  }

  redact(value: unknown, token: string): string {
    const text = toText(value);
    if (!token) return text;
    return text.split(token).join('[REDACTED]');
  }

  private write(level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}\n`;
    try {
      this.rotateIfNeeded();
      appendFileSync(this.filePath, line, 'utf8');
    } catch {
      // Logging must never break the plugin.
    }
  }

  private rotateIfNeeded(): void {
    try {
      const stat = statSync(this.filePath);
      if (stat.size > 5 * 1024 * 1024) {
        renameSync(this.filePath, `${this.filePath}.1`);
      }
    } catch {
      // No file yet or rotation failed; ignore.
    }
  }
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
