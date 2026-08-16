export function redactToken(value: unknown, token: string): string {
  const text = toText(value);
  if (!token) return text;
  return text.split(token).join('[REDACTED]');
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
