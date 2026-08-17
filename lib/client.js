/* Client-side settings panel for dsh-telegram-bridge.
 * This file is copied to lib/client.js by scripts/copy-client.mjs.
 */
window.__ModuleLoader__.load({
  id: 'dsh-telegram-bridge',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require('react');
    const { useState, useEffect, useCallback } = React;

    const name = 'dsh-telegram-bridge';
    const inject = ['slots'];

    const css = `
.dsh-tg-wrap{max-width:780px;margin:0 auto;padding:2px 2px 24px}
.dsh-tg-section{background:var(--dsw-specific-card, rgba(255,255,255,0.055));border:1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));border-radius:14px;padding:18px 20px;margin-bottom:16px;box-shadow:var(--dsw-shadow-lv1, none)}
.dsh-tg-section-title{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:15px;font-weight:700;letter-spacing:.2px}
.dsh-tg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px 16px}
.dsh-tg-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.dsh-tg-label{font-size:12px;font-weight:500;opacity:.78;letter-spacing:.2px}
.dsh-tg-input{width:100%;box-sizing:border-box;background:transparent;border:1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.14));border-radius:8px;padding:8px 10px;color:inherit;font-size:13px;line-height:1.4;transition:border-color .15s, box-shadow .15s;outline:none}
.dsh-tg-input:hover{border-color:var(--dsw-alias-border-l3, rgba(255,255,255,0.24))}
.dsh-tg-input:focus{border-color:var(--dsw-alias-interactive-bg, #4a9eff);box-shadow:0 0 0 3px rgba(74,158,255,.18)}
.dsh-tg-input:disabled{opacity:.5;cursor:not-allowed}
.dsh-tg-check{display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer;font-size:13px;user-select:none}
.dsh-tg-check input{width:16px;height:16px;accent-color:var(--dsw-alias-interactive-bg, #4a9eff)}
.dsh-tg-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--dsw-alias-interactive-bg, rgba(255,255,255,.14));color:inherit;border:1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.18));border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s,transform .05s}
.dsh-tg-btn:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.2));border-color:var(--dsw-alias-border-l3, rgba(255,255,255,.28))}
.dsh-tg-btn:active{transform:translateY(1px)}
.dsh-tg-btn:disabled{opacity:.55;cursor:not-allowed}
.dsh-tg-msg{margin-top:10px;font-size:12px;line-height:1.5;opacity:.9}
.dsh-tg-msg-error{color:var(--dsw-alias-state-error-primary, #e07070)}
.dsh-tg-msg-success{color:var(--dsw-alias-state-success-primary, #7fd07f)}
.dsh-tg-muted{opacity:.55;font-size:11px}
.dsh-tg-divider{height:1px;background:var(--dsw-alias-border-l1, rgba(255,255,255,.08));margin:14px 0}
`;

    function Field({ label, hint, children }) {
      return React.createElement(
        'div',
        { className: 'dsh-tg-field' },
        React.createElement('div', { className: 'dsh-tg-label' }, label),
        children,
        hint ? React.createElement('div', { className: 'dsh-tg-muted' }, hint) : null,
      );
    }

    function Checkbox({ label, checked, onChange }) {
      return React.createElement(
        'label',
        { className: 'dsh-tg-check' },
        React.createElement('input', { type: 'checkbox', checked, onChange }),
        React.createElement('span', null, label),
      );
    }

    function SettingsPanel() {
      const [form, setForm] = useState(null);
      const [presets, setPresets] = useState([]);
      const [models, setModels] = useState([]);
      const [modelError, setModelError] = useState('');
      const [saving, setSaving] = useState(false);
      const [message, setMessage] = useState('');
      const [error, setError] = useState('');

      const refresh = useCallback(async () => {
        try {
          const res = await fetch('/dsh-telegram-bridge/settings', { cache: 'no-store' });
          if (!res.ok) throw new Error(`http ${res.status}`);
          const data = await res.json();
          const c = data.config;
          setForm({
            botToken: '',
            ownerId: c.ownerId,
            projectRoot: c.projectRoot,
            proxyEnabled: c.proxyEnabled,
            proxyUrl: c.proxyUrl,
            defaultProvider: c.defaultProvider,
            defaultModel: c.defaultModel,
            defaultReasoningEffort: c.defaultReasoningEffort,
            defaultAgentPreset: c.defaultAgentPreset,
            errorDisplayMode: c.errorDisplayMode,
            htmlFormatting: c.htmlFormatting,
            typingIndicator: c.typingIndicator,
            queueLimit: c.queueLimit,
            debugLogging: c.debugLogging,
            statusLine: c.statusLine,
            maxSessionsPerChat: c.maxSessionsPerChat,
          });
          setPresets(data.presets || []);
          setModels(data.models || []);
          setModelError(data.modelError || '');
          setError('');
        } catch (err) {
          setError(String(err.message ?? err));
        }
      }, []);

      useEffect(() => { refresh(); }, [refresh]);

      const update = (key) => (event) => {
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        setForm((prev) => ({ ...prev, [key]: value }));
      };

      const modelOptions = (models || []).flatMap((group) =>
        (group.models || []).map((model) => ({
          provider: group.id,
          model: model.id,
          label: `${group.id}/${model.id}`,
          reasoning: model.reasoning,
        })),
      );
      const selectedModel = modelOptions.find(
        (item) => item.provider === form.defaultProvider && item.model === form.defaultModel,
      );
      const effortOptions = selectedModel?.reasoning?.efforts || [];

      const save = async () => {
        if (!form) return;
        setSaving(true);
        setMessage('');
        setError('');
        try {
          const res = await fetch('/dsh-telegram-bridge/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(form),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `http ${res.status}`);
          }
          const data = await res.json();
          const c = data.config;
          setForm((prev) => ({ ...prev, ...c, botToken: '' }));
          setMessage('已保存。部分设置需要重启 dsh web 后生效。');
        } catch (err) {
          setError(String(err.message ?? err));
        } finally {
          setSaving(false);
        }
      };

      if (!form) {
        return React.createElement('div', { style: { fontSize: 13, opacity: 0.6, padding: '20px 4px' } }, '加载中…');
      }

      return React.createElement(
        'div',
        { className: 'dsh-tg-wrap' },
        React.createElement('style', null, css),
        React.createElement(
          'section',
          { className: 'dsh-tg-section' },
          React.createElement('h3', { className: 'dsh-tg-section-title' }, '🔌 Telegram 连接'),
          React.createElement(
            'div',
            { className: 'dsh-tg-grid' },
            React.createElement(Field, { label: 'Bot Token', hint: '留空表示保留当前值' },
              React.createElement('input', {
                className: 'dsh-tg-input',
                type: 'password',
                placeholder: form.botTokenSet ? '已设置，输入以替换' : '未设置',
                value: form.botToken,
                onChange: update('botToken'),
              }),
            ),
            React.createElement(Field, { label: 'Owner ID', hint: '允许使用 bot 的 Telegram 用户 ID' },
              React.createElement('input', {
                className: 'dsh-tg-input',
                type: 'number',
                value: form.ownerId,
                onChange: update('ownerId'),
              }),
            ),
            React.createElement(Field, { label: 'Project Root', hint: '新会话的默认工作目录' },
              React.createElement('input', {
                className: 'dsh-tg-input',
                type: 'text',
                value: form.projectRoot,
                onChange: update('projectRoot'),
              }),
            ),
            React.createElement(Field, { label: '代理地址' },
              React.createElement('input', {
                className: 'dsh-tg-input',
                type: 'text',
                value: form.proxyUrl,
                onChange: update('proxyUrl'),
              }),
            ),
          ),
          React.createElement(Checkbox, { label: '启用代理', checked: form.proxyEnabled, onChange: update('proxyEnabled') }),
        ),
        React.createElement(
          'section',
          { className: 'dsh-tg-section' },
          React.createElement('h3', { className: 'dsh-tg-section-title' }, '⚙️ 默认会话设置'),
          modelError ? React.createElement('div', { className: 'dsh-tg-msg dsh-tg-msg-error', style: { marginBottom: 8 } }, `模型读取失败：${modelError}`) : null,
          React.createElement(
            'div',
            { className: 'dsh-tg-grid' },
            React.createElement(Field, { label: '默认模型', hint: '从 dsh 已添加的模型中动态读取' },
              React.createElement('select', {
                className: 'dsh-tg-input',
                value: form.defaultProvider && form.defaultModel ? `${form.defaultProvider}|${form.defaultModel}` : '',
                onChange: (event) => {
                  const value = event.target.value;
                  if (!value) {
                    setForm((prev) => ({ ...prev, defaultProvider: '', defaultModel: '', defaultReasoningEffort: '' }));
                    return;
                  }
                  const [provider, model] = value.split('|');
                  setForm((prev) => ({ ...prev, defaultProvider: provider, defaultModel: model, defaultReasoningEffort: '' }));
                },
              },
                React.createElement('option', { value: '' }, '（dsh 默认）'),
                modelOptions.map((item) =>
                  React.createElement('option', {
                    key: `${item.provider}|${item.model}`,
                    value: `${item.provider}|${item.model}`,
                  }, item.label),
                ),
              ),
            ),
            React.createElement(Field, { label: '默认思考强度', hint: effortOptions.length === 0 ? '该模型无推理强度' : '随所选模型动态更新' },
              React.createElement('select', {
                className: 'dsh-tg-input',
                value: form.defaultReasoningEffort,
                onChange: update('defaultReasoningEffort'),
                disabled: effortOptions.length === 0,
              },
                React.createElement('option', { value: '' }, effortOptions.length === 0 ? '（该模型无推理强度）' : '（dsh 默认）'),
                effortOptions.map((effort) =>
                  React.createElement('option', { key: effort.id, value: effort.id }, effort.name || effort.id),
                ),
              ),
            ),
            React.createElement(Field, { label: '默认 Agent Preset' },
              React.createElement('select', {
                className: 'dsh-tg-input',
                value: form.defaultAgentPreset,
                onChange: update('defaultAgentPreset'),
              },
                React.createElement('option', { value: '' }, '（dsh 默认）'),
                presets.map((preset) =>
                  React.createElement('option', { key: preset.id, value: preset.id }, preset.name || preset.id),
                ),
              ),
            ),
          ),
        ),
        React.createElement(
          'section',
          { className: 'dsh-tg-section' },
          React.createElement('h3', { className: 'dsh-tg-section-title' }, '🎛️ 行为选项'),
          React.createElement(
            'div',
            { className: 'dsh-tg-grid' },
            React.createElement(Field, { label: '错误显示模式' },
              React.createElement('select', {
                className: 'dsh-tg-input',
                value: form.errorDisplayMode,
                onChange: update('errorDisplayMode'),
              },
                React.createElement('option', { value: 'raw' }, '原始错误'),
                React.createElement('option', { value: 'friendly' }, '友好提示'),
              ),
            ),
            React.createElement(Field, { label: '队列上限', hint: '每个聊天最多排队消息数' },
              React.createElement('input', {
                className: 'dsh-tg-input',
                type: 'number',
                min: 1,
                value: form.queueLimit,
                onChange: update('queueLimit'),
              }),
            ),
            React.createElement(Field, { label: '最大保留会话数', hint: '每个聊天保留的最近会话数量' },
              React.createElement('input', {
                className: 'dsh-tg-input',
                type: 'number',
                min: 1,
                value: form.maxSessionsPerChat,
                onChange: update('maxSessionsPerChat'),
              }),
            ),
          ),
          React.createElement('div', { className: 'dsh-tg-divider' }),
          React.createElement(Checkbox, { label: 'Telegram HTML 格式化', checked: form.htmlFormatting, onChange: update('htmlFormatting') }),
          React.createElement(Checkbox, { label: 'Typing 指示器', checked: form.typingIndicator, onChange: update('typingIndicator') }),
          React.createElement(Checkbox, { label: '实时状态行', checked: form.statusLine, onChange: update('statusLine') }),
          React.createElement(Checkbox, { label: 'Debug 日志', checked: form.debugLogging, onChange: update('debugLogging') }),
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
          React.createElement('button', { className: 'dsh-tg-btn', onClick: save, disabled: saving }, saving ? '保存中…' : '💾 保存设置'),
          message ? React.createElement('div', { className: 'dsh-tg-msg dsh-tg-msg-success' }, message) : null,
          error ? React.createElement('div', { className: 'dsh-tg-msg dsh-tg-msg-error' }, error) : null,
        ),
      );
    }

    function apply(ctx) {
      const slots = ctx.slots;
      if (slots === undefined) return;
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'dsh-telegram-bridge', order: 10, label: 'Telegram Bridge' },
        () => React.createElement(SettingsPanel),
      ));
    }

    module.exports = { name, inject, apply };
    return module.exports;
  },
});
