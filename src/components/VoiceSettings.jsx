import { useState, useEffect } from 'react';
import {
  tts,
  loadTTSSettings,
  saveTTSSettings,
  checkOpenAIAvailability,
  OPENAI_VOICES,
} from '../utils/tts.js';
import Icon from './Icon.jsx';
import './VoiceSettings.css';

/**
 * 语音设置组件
 * 支持 浏览器语音(免费) / OpenAI 语音(更自然) 两种引擎切换
 */
export default function VoiceSettings({ isOpen, onClose }) {
  // 通用设置
  const [engineType, setEngineType] = useState('browser');
  const [rate, setRate] = useState(0.85);
  const [pitch, setPitch] = useState(1.0);
  const [volume, setVolume] = useState(1.0);

  // 浏览器语音
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');

  // OpenAI 语音
  const [openaiVoice, setOpenaiVoice] = useState('nova');
  const [openaiAvailable, setOpenaiAvailable] = useState(false);
  const [checkingOpenai, setCheckingOpenai] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) loadAll();
  }, [isOpen]);

  async function loadAll() {
    setLoading(true);
    setCheckingOpenai(true);
    try {
      // 并行：加载浏览器语音 + 已保存设置 + 检查 OpenAI 可用性
      const [savedSettings, available] = await Promise.all([
        loadTTSSettings(),
        checkOpenAIAvailability(),
      ]);

      // 浏览器语音列表
      const availableVoices = tts.getAllVoices();
      const englishVoices = availableVoices.filter(v => v.lang.startsWith('en-'));
      setVoices(englishVoices);

      // 恢复设置
      setEngineType(savedSettings.engineType || 'browser');
      setRate(savedSettings.rate);
      setPitch(savedSettings.pitch);
      setVolume(savedSettings.volume);
      setOpenaiVoice(savedSettings.openaiVoice || 'nova');

      if (savedSettings.selectedVoice && englishVoices.some(v => v.name === savedSettings.selectedVoice)) {
        setSelectedVoice(savedSettings.selectedVoice);
      } else {
        const defaultVoice = tts.getEnglishVoices();
        if (defaultVoice) setSelectedVoice(defaultVoice.name);
      }

      setOpenaiAvailable(available);
    } catch (err) {
      console.error('加载设置失败:', err);
    } finally {
      setLoading(false);
      setCheckingOpenai(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const settings = {
        engineType,
        rate,
        pitch,
        volume,
        selectedVoice,
        openaiVoice,
      };

      await saveTTSSettings(settings);
      tts.applySettings(settings);

      // 同步切换引擎
      await tts.switchEngine(engineType);

      onClose();
    } catch (err) {
      console.error('保存设置失败:', err);
      alert('保存失败: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function testVoice() {
    const testText = 'This is a test sentence for learning English.';
    if (engineType === 'openai') {
      tts.speak(testText, { rate, volume, openaiVoice });
    } else {
      tts.speak(testText, { rate, pitch, volume, preferredVoice: selectedVoice });
    }
  }

  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="voice-settings-overlay">
        <div className="voice-settings-panel">
          <div className="panel-content" style={{ textAlign: 'center', padding: '40px' }}>
            <div className="spinner"></div>
            <p>加载设置...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="voice-settings-overlay" onClick={onClose}>
      <div className="voice-settings-panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h3>语音设置</h3>
          <button className="btn-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="panel-content">
          {/* 引擎切换 */}
          <div className="engine-switch">
            <button
              className={`engine-btn ${engineType === 'browser' ? 'active' : ''}`}
              onClick={() => setEngineType('browser')}
            >
              浏览器语音（免费）
            </button>
            <button
              className={`engine-btn ${engineType === 'openai' ? 'active' : ''}`}
              disabled={!openaiAvailable}
              onClick={() => openaiAvailable && setEngineType('openai')}
            >
              OpenAI 语音（更自然）
            </button>
          </div>

          {/* OpenAI 未配置提示 */}
          {!openaiAvailable && !checkingOpenai && (
            <div className="openai-unavailable">
              未配置 API Key，请在 .env 中设置 OPENAI_API_KEY
            </div>
          )}

          {/* OpenAI 声音选择 */}
          {engineType === 'openai' && openaiAvailable && (
            <div className="setting-group">
              <label>选择声音:</label>
              <div className="openai-voice-grid">
                {OPENAI_VOICES.map(v => (
                  <button
                    key={v.id}
                    className={`voice-card ${openaiVoice === v.id ? 'selected' : ''}`}
                    onClick={() => setOpenaiVoice(v.id)}
                  >
                    <span className="voice-name">
                      {v.label}
                      {v.tag && <span className="voice-tag">{v.tag}</span>}
                    </span>
                    <span className="voice-desc">{v.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 浏览器语音选择（仅浏览器模式） */}
          {engineType === 'browser' && (
            <div className="setting-group">
              <label>语音引擎:</label>
              <select
                value={selectedVoice}
                onChange={e => setSelectedVoice(e.target.value)}
              >
                {voices.map(voice => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 语速 */}
          <div className="setting-group">
            <label>
              语速: {rate.toFixed(2)}x
              <span className="hint">建议: 0.7-1.0 (慢速学习)</span>
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={rate}
              onChange={e => setRate(parseFloat(e.target.value))}
            />
          </div>

          {/* 音调（仅浏览器模式） */}
          {engineType === 'browser' && (
            <div className="setting-group">
              <label>
                音调: {pitch.toFixed(2)}
                <span className="hint">建议: 1.0 (标准)</span>
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={pitch}
                onChange={e => setPitch(parseFloat(e.target.value))}
              />
            </div>
          )}

          {/* 音量 */}
          <div className="setting-group">
            <label>
              音量: {Math.round(volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
            />
          </div>

          {/* 测试按钮 */}
          <button className="btn-test" onClick={testVoice}>
            测试发音
          </button>

          {/* 说明 */}
          <div className="info">
            <p>提示:</p>
            <ul>
              {engineType === 'openai' ? (
                <>
                  <li>OpenAI 语音非常自然，推荐用于英语学习</li>
                  <li>首次播放需联网，之后同一句话走本地缓存（不再花钱）</li>
                  <li>推荐声音: Nova（温暖女声，最适合学习）</li>
                </>
              ) : (
                <>
                  <li>语速建议设为 0.7-0.9 方便学习</li>
                  <li>某些浏览器语音质量更好(Safari/Chrome)</li>
                  <li>iOS需要首次点击后才能启用语音</li>
                </>
              )}
            </ul>
          </div>
        </div>

        <div className="panel-footer">
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
