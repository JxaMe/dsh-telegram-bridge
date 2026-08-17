import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { PluginConfig } from './types.js';

export function defaultDataDir(): string {
  return path.join(homedir(), '.dsh', 'dsh-telegram-bridge');
}

function existsSync(file: string): boolean {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

export function ensureDataDir(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
}

export function writeExampleConfig(dataDir: string): void {
  ensureDataDir(dataDir);
  const configPath = path.join(dataDir, 'config.json');
  if (existsSync(configPath)) return;
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        botToken: 'PASTE_BOT_TOKEN',
        ownerId: 0,
        projectRoot: process.cwd(),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

export function loadConfig(dataDir: string): PluginConfig {
  const configPath = path.join(dataDir, 'config.json');
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch {
    throw new Error(`config file not found: ${configPath}`);
  }

  let parsed: Partial<PluginConfig>;
  try {
    parsed = JSON.parse(raw) as Partial<PluginConfig>;
  } catch (error) {
    throw new Error(`config file is not valid JSON: ${configPath}`);
  }

  if (!parsed.botToken || typeof parsed.botToken !== 'string') {
    throw new Error('config.json must contain a string botToken');
  }
  if (typeof parsed.ownerId !== 'number') {
    throw new Error('config.json must contain a numeric ownerId');
  }

  return {
    botToken: parsed.botToken,
    ownerId: parsed.ownerId,
    projectRoot: parsed.projectRoot ?? process.cwd(),
    dataDir,
    proxyEnabled: parsed.proxyEnabled,
    proxyUrl: parsed.proxyUrl ?? 'http://127.0.0.1:7890',
    defaultProvider: parsed.defaultProvider ?? '',
    defaultModel: parsed.defaultModel ?? '',
    defaultReasoningEffort: parsed.defaultReasoningEffort ?? '',
    defaultAgentPreset: parsed.defaultAgentPreset ?? '',
    errorDisplayMode: parsed.errorDisplayMode ?? 'raw',
    htmlFormatting: parsed.htmlFormatting ?? true,
    typingIndicator: parsed.typingIndicator ?? true,
    queueLimit: parsed.queueLimit ?? 20,
    debugLogging: parsed.debugLogging ?? false,
    statusLine: parsed.statusLine ?? true,
    maxSessionsPerChat: parsed.maxSessionsPerChat ?? 5,
  };
}
