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

    const sectionStyle = {
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 10,
      padding: '12px 14px',
      marginBottom: 12,
    };
    const h3Style = { margin: '0 0 10px', fontSize: 14, fontWeight: 700 };
    const rowStyle = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 };
    const labelStyle = { fontSize: 12, opacity: 0.75 };
    const inputStyle = {
      width: '100%',
      boxSizing: 'border-box',
      background: 'rgba(0,0,0,0.2)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 6,
      padding: '6px 8px',
      color: 'inherit',
      fontSize: 13,
    };
    const checkStyle = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 };
    const btnStyle = {
      background: 'rgba(255,255,255,0.12)',
      color: 'inherit',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: 6,
      padding: '6px 14px',
      cursor: 'pointer',
      fontSize: 13,
    };
    const msgStyle = { marginTop: 8, fontSize: 12, opacity: 0.85 };

    function Field({ label, children }) {
      return React.createElement(
        'div',
        { style: rowStyle },
        React.createElement('div', { style: labelStyle }, label),
        children,
      );
    }

    function Checkbox({ label, checked, onChange }) {
      return React.createElement(
        'label',
        { style: checkStyle },
        React.createElement('input', { type: 'checkbox', checked, onChange }),
        label,
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
        return React.createElement('div', { style: { fontSize: 12, opacity: 0.6 } }, '加载中…');
      }

      return React.createElement(
        'div',
        null,
        React.createElement(
          'section',
          { style: sectionStyle },
          React.createElement('h3', { style: h3Style }, 'Telegram 连接'),
          React.createElement(Field, { label: 'Bot Token（留空表示保留当前值）' },
            React.createElement('input', {
              style: inputStyle,
              type: 'password',
              placeholder: form.botTokenSet ? '已设置，输入以替换' : '未设置',
              value: form.botToken,
              onChange: update('botToken'),
            }),
          ),
          React.createElement(Field, { label: 'Owner ID' },
            React.createElement('input', {
              style: inputStyle,
              type: 'number',
              value: form.ownerId,
              onChange: update('ownerId'),
            }),
          ),
          React.createElement(Field, { label: 'Project Root' },
            React.createElement('input', {
              style: inputStyle,
              type: 'text',
              value: form.projectRoot,
              onChange: update('projectRoot'),
            }),
          ),
          React.createElement(Checkbox, { label: '启用代理', checked: form.proxyEnabled, onChange: update('proxyEnabled') }),
          React.createElement(Field, { label: '代理地址' },
            React.createElement('input', {
              style: inputStyle,
              type: 'text',
              value: form.proxyUrl,
              onChange: update('proxyUrl'),
            }),
          ),
        ),
        React.createElement(
          'section',
          { style: sectionStyle },
          React.createElement('h3', { style: h3Style }, '默认会话设置'),
          modelError ? React.createElement('div', { style: { ...msgStyle, color: '#e07070', marginBottom: 8 } }, `模型读取失败：${modelError}`) : null,
          React.createElement(Field, { label: '默认模型' },
            React.createElement('select', {
              style: inputStyle,
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
          React.createElement(Field, { label: '默认思考强度' },
            React.createElement('select', {
              style: inputStyle,
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
              style: inputStyle,
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
        React.createElement(
          'section',
          { style: sectionStyle },
          React.createElement('h3', { style: h3Style }, '行为选项'),
          React.createElement(Field, { label: '错误显示模式' },
            React.createElement('select', {
              style: inputStyle,
              value: form.errorDisplayMode,
              onChange: update('errorDisplayMode'),
            },
              React.createElement('option', { value: 'raw' }, '原始错误'),
              React.createElement('option', { value: 'friendly' }, '友好提示'),
            ),
          ),
          React.createElement(Checkbox, { label: 'Telegram HTML 格式化', checked: form.htmlFormatting, onChange: update('htmlFormatting') }),
          React.createElement(Checkbox, { label: 'Typing 指示器', checked: form.typingIndicator, onChange: update('typingIndicator') }),
          React.createElement(Field, { label: '队列上限' },
            React.createElement('input', {
              style: inputStyle,
              type: 'number',
              min: 1,
              value: form.queueLimit,
              onChange: update('queueLimit'),
            }),
          ),
          React.createElement(Checkbox, { label: 'Debug 日志', checked: form.debugLogging, onChange: update('debugLogging') }),
        ),
        React.createElement('button', { style: { ...btnStyle, marginTop: 4 }, onClick: save, disabled: saving }, saving ? '保存中…' : '保存设置'),
        message ? React.createElement('div', { style: { ...msgStyle, color: '#7fd07f' } }, message) : null,
        error ? React.createElement('div', { style: { ...msgStyle, color: '#e07070' } }, error) : null,
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
