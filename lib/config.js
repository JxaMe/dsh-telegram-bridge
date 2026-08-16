import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
export function defaultDataDir() {
    return path.join(homedir(), '.dsh', 'dsh-telegram-bridge');
}
function existsSync(file) {
    try {
        readFileSync(file);
        return true;
    }
    catch {
        return false;
    }
}
export function ensureDataDir(dataDir) {
    mkdirSync(dataDir, { recursive: true });
}
export function writeExampleConfig(dataDir) {
    ensureDataDir(dataDir);
    const configPath = path.join(dataDir, 'config.json');
    if (existsSync(configPath))
        return;
    writeFileSync(configPath, JSON.stringify({
        botToken: 'PASTE_BOT_TOKEN',
        ownerId: 0,
        projectRoot: process.cwd(),
    }, null, 2) + '\n', 'utf8');
}
export function loadConfig(dataDir) {
    const configPath = path.join(dataDir, 'config.json');
    let raw;
    try {
        raw = readFileSync(configPath, 'utf8');
    }
    catch {
        throw new Error(`config file not found: ${configPath}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
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
    };
}
