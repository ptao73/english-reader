import { useState, useEffect } from 'react';
import { tts, loadTTSSettings, saveTTSSettings } from '../utils/tts.js';
import Icon from './Icon.jsx';
import './VoiceSettings.css';

/**
 * 语音设置组件
 * 允许用户调整TTS参数，支持设置持久化
 */
export default function VoiceSettings({ isOpen, onClose }) {
  const [rate, setRate] = useState(0.85);
  const [pitch, setPitch] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadVoicesAndSettings();
  }, []);

  async function loadVoicesAndSettings() {
    setLoading(true);
    try {
      // 加载可用语音
      const availableVoices = tts.getAllVoices();
      const englishVoices = availableVoices.filter(v => v.lang.startsWith('en-'));
      setVoices(englishVoices);

      // 从IndexedDB加载保存的设置
      const savedSettings = await loadTTSSettings();
      setRate(savedSettings.rate);
      setPitch(savedSettings.pitch);
      setVolume(savedSettings.volume);

      // 优先使用保存的语音，否则用默认语音
      if (savedSettings.selectedVoice && englishVoices.some(v => v.name === savedSettings.selectedVoice)) {
        setSelectedVoice(savedSettings.selectedVoice);
      } else {
        const defaultVoice = tts.getEnglishVoices();
        if (defaultVoice) {
          setSelectedVoice(defaultVoice.name);
        }
      }
    } catch (err) {
      console.error('加载设置失败:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveTTSSettings({
        rate,
        pitch,
        volume,
        selectedVoice
      });
      onClose();
    } catch (err) {
      console.error('保存设置失败:', err);
      alert('保存失败: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function testVoice() {
    tts.speak('This is a test sentence for learning English.', {
      rate,
      pitch,
      volume
    });
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

          {/* 音调 */}
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

          {/* 语音选择 */}
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

          {/* 测试按钮 */}
          <button className="btn-test" onClick={testVoice}>
            测试发音
          </button>

          {/* 说明 */}
          <div className="info">
            <p>提示:</p>
            <ul>
              <li>语速建议设为 0.7-0.9 方便学习</li>
              <li>某些浏览器语音质量更好(Safari/Chrome)</li>
              <li>iOS需要首次点击后才能启用语音</li>
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
