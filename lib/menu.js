import { InlineKeyboard } from 'grammy';
export function mainMenuKeyboard() {
    return new InlineKeyboard()
        .text('新对话', 'new')
        .text('取消', 'cancel')
        .text('状态', 'status')
        .row()
        .text('设置', 'menu');
}
export function settingsKeyboard() {
    return new InlineKeyboard()
        .text('模型', 'models')
        .text('思考强度', 'efforts')
        .text('Agent preset', 'presets')
        .row()
        .text('返回', 'back');
}
