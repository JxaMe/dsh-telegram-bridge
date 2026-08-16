import { InlineKeyboard } from 'grammy';
import type { DshPresetEntry, DshSessionModels } from './dsh-types.js';
import type { ChatSettings } from './types.js';
export declare function mainMenuKeyboard(): InlineKeyboard;
export declare function settingsKeyboard(): InlineKeyboard;
export declare function commandMenuKeyboard(): InlineKeyboard;
export interface ModelsPage {
    text: string;
    keyboard: InlineKeyboard;
}
export declare function modelsPageKeyboard(models: DshSessionModels, current: ChatSettings, page: number): ModelsPage;
export declare function effortsKeyboard(provider: string, model: string, efforts: Array<{
    id: string;
    name?: string;
}>, currentEffort?: string): {
    text: string;
    keyboard: InlineKeyboard;
};
export declare function presetsKeyboard(presets: DshPresetEntry[], currentPreset?: string): {
    text: string;
    keyboard: InlineKeyboard;
};
