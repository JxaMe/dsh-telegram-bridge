import type { PluginConfig } from './types.js';
export declare function defaultDataDir(): string;
export declare function ensureDataDir(dataDir: string): void;
export declare function writeExampleConfig(dataDir: string): void;
export declare function loadConfig(dataDir: string): PluginConfig;
