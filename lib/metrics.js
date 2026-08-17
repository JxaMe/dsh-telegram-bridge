const state = {
    startedAt: Date.now(),
    messagesReceived: 0,
    repliesSent: 0,
    errors: 0,
};
export function incrMessageReceived() {
    state.messagesReceived += 1;
}
export function incrReplySent() {
    state.repliesSent += 1;
}
export function incrError() {
    state.errors += 1;
}
export function getMetrics() {
    return {
        startedAt: state.startedAt,
        uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000),
        messagesReceived: state.messagesReceived,
        repliesSent: state.repliesSent,
        errors: state.errors,
    };
}
