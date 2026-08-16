import { InlineKeyboard } from 'grammy';
import type { DshPresetEntry, DshSessionModels } from './dsh-types.js';
import type { ChatSettings } from './types.js';

const MODEL_PAGE_SIZE = 8;
const BACK_CALLBACK = 'back';

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('新对话', 'new')
    .text('取消', 'cancel')
    .text('状态', 'status')
    .row()
    .text('设置', 'menu')
    .text('命令菜单', 'command_menu');
}

export function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('模型', 'models')
    .text('思考强度', 'efforts')
    .text('Agent preset', 'presets')
    .row()
    .text('返回', 'back');
}

export function commandMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('新对话', 'cmd_new')
    .text('取消', 'cmd_cancel')
    .text('状态', 'cmd_status')
    .row()
    .text('设置', 'cmd_menu')
    .text('压缩', 'cmd_compact')
    .text('帮助', 'cmd_help')
    .row()
    .text('返回', 'back');
}

export interface ModelsPage {
  text: string;
  keyboard: InlineKeyboard;
}

export function modelsPageKeyboard(
  models: DshSessionModels,
  current: ChatSettings,
  page: number,
): ModelsPage {
  const all = models.groups.flatMap((group) =>
    group.models.map((model) => ({
      provider: group.id,
      model: model.id,
      label: `${group.id}/${model.id}`,
    })),
  );
  const totalPages = Math.max(1, Math.ceil(all.length / MODEL_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * MODEL_PAGE_SIZE;
  const visible = all.slice(start, start + MODEL_PAGE_SIZE);

  const keyboard = new InlineKeyboard();
  for (const item of visible) {
    const selected = item.provider === current.provider && item.model === current.model;
    keyboard.text(`${selected ? '✅ ' : ''}${item.label}`, encodeData(['model', item.provider, item.model])).row();
  }

  const nav = new InlineKeyboard();
  if (safePage > 0) {
    nav.text('⬅️ 上一页', encodeData(['models_page', String(safePage - 1)]));
  }
  if (safePage < totalPages - 1) {
    nav.text('下一页 ➡️', encodeData(['models_page', String(safePage + 1)]));
  }
  if (nav.inline_keyboard.length > 0) {
    keyboard.append(nav);
  }
  keyboard.append(new InlineKeyboard().text('返回', BACK_CALLBACK));

  const currentLabel = current.provider && current.model ? `，当前：${current.provider}/${current.model}` : '';
  return {
    text: `选择模型（第 ${safePage + 1}/${totalPages} 页${currentLabel}）`,
    keyboard,
  };
}

export function effortsKeyboard(
  provider: string,
  model: string,
  efforts: Array<{ id: string; name?: string }>,
  currentEffort?: string,
): { text: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard();
  for (const effort of efforts) {
    const selected = effort.id === currentEffort;
    keyboard.text(`${selected ? '✅ ' : ''}${effort.name ?? effort.id}`, encodeData(['effort', provider, model, effort.id])).row();
  }
  keyboard.append(new InlineKeyboard().text('返回', BACK_CALLBACK));
  return {
    text: `选择思考强度（${provider}/${model}${currentEffort ? `，当前：${currentEffort}` : ''}）`,
    keyboard,
  };
}

export function presetsKeyboard(
  presets: DshPresetEntry[],
  currentPreset?: string,
): { text: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard();
  for (const preset of presets) {
    const selected = preset.id === currentPreset;
    keyboard.text(`${selected ? '✅ ' : ''}${preset.name ?? preset.id}`, encodeData(['preset', preset.id])).row();
  }
  keyboard.append(new InlineKeyboard().text('返回', BACK_CALLBACK));
  return {
    text: `选择 Agent preset${currentPreset ? `（当前：${currentPreset}）` : ''}`,
    keyboard,
  };
}

function encodeData(parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join('|');
}
