export function friendlyError(error: unknown, context?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  // Network / proxy errors
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('econnrefused') || lower.includes('proxy') || lower.includes('timeout')) {
    return '网络异常，请检查代理设置或稍后重试。';
  }
  // Model not found / unavailable
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('unavailable') || lower.includes('invalid'))) {
    return '模型不可用，请换一个模型。';
  }
  // Session not found - should be auto-recovered
  if (lower.includes('session-not-found') || lower.includes('session not found')) {
    return '会话已失效，正在自动重建...';
  }
  // Preset locked
  if (lower.includes('agent-preset-locked')) {
    return '当前会话已有历史，请先使用 /new 开始新对话后再切换 preset。';
  }
  // Token / auth errors
  if (lower.includes('unauthorized') || lower.includes('token') || lower.includes('402')) {
    return '认证失败，请检查 botToken 是否有效。';
  }
  // Fallback: show original for debugging, add context
  const prefix = context ? `[${context}] ` : '';
  return `${prefix}${message}`;
}

export function redactToken(value: unknown, token: string): string {
  const text = toText(value);
  if (!token) return text;
  return text.split(token).join('[REDACTED]');
}

export function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
