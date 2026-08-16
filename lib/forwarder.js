export class EventForwarder {
    ctx;
    bot;
    state;
    constructor(ctx, bot, state) {
        this.ctx = ctx;
        this.bot = bot;
        this.state = state;
    }
    start() {
        this.ctx.on('session/event', (session, event) => {
            if (event?.type !== 'assistant/message')
                return;
            const sessionId = session?.id;
            if (!sessionId)
                return;
            const chatId = this.findChatId(sessionId);
            if (chatId === undefined)
                return;
            const text = extractText(event.data?.content);
            if (!text)
                return;
            void this.sendToTelegram(chatId, text);
        });
    }
    findChatId(sessionId) {
        const state = this.state.loadState();
        for (const [chatId, chat] of Object.entries(state.chats)) {
            if (chat.sessionId === sessionId)
                return Number(chatId);
        }
        return undefined;
    }
    async sendToTelegram(chatId, text) {
        const chunks = splitMessage(text);
        for (const chunk of chunks) {
            try {
                await this.bot.api.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
            }
            catch {
                await this.bot.api.sendMessage(chatId, chunk);
            }
        }
    }
}
function extractText(content) {
    if (!Array.isArray(content))
        return '';
    return content
        .map((block) => (block?.type === 'text' ? String(block.text ?? '') : ''))
        .join('\n')
        .trim();
}
function splitMessage(text, limit = 4096) {
    const chunks = [];
    for (let i = 0; i < text.length; i += limit) {
        chunks.push(text.slice(i, i + limit));
    }
    return chunks.length > 0 ? chunks : [''];
}
