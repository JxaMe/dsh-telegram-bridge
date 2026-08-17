import { copyFileSync, mkdirSync } from 'node:fs';
const src = new URL('../client/index.js', import.meta.url);
const dest = new URL('../lib/client.js', import.meta.url);
mkdirSync(new URL('../lib/', import.meta.url), { recursive: true });
copyFileSync(src, dest);
console.log('copied client/index.js -> lib/client.js');
