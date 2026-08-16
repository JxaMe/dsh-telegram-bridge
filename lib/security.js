export function redactToken(value, token) {
    const text = toText(value);
    if (!token)
        return text;
    return text.split(token).join('[REDACTED]');
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
