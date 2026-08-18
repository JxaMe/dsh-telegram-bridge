import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CSRF_WINDOW_MS = 5 * 60 * 1000; // token 有效期 5 分钟
// 进程级随机密钥：token 无法被无此密钥的一方伪造，远程/本地跨站 POST 拿不到。
const csrfSecret = randomBytes(32);

export function csrfTokenFor(botToken: string, windowStart: number): string {
  return createHmac('sha256', csrfSecret).update(`${botToken}:${windowStart}`).digest('hex');
}

export function csrfWindows(now = Date.now()): number[] {
  const window = Math.floor(now / CSRF_WINDOW_MS);
  return [window, window - 1]; // 当前 + 前一窗口，容忍毫秒级边界
}

export function verifyCsrfToken(token: unknown, botToken: string, now = Date.now()): boolean {
  if (typeof token !== 'string' || token.length === 0) return false;
  const given = Buffer.from(token);
  return csrfWindows(now).some((w) => {
    const expected = Buffer.from(csrfTokenFor(botToken, w));
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
