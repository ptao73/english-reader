import { useState, useEffect } from 'react';
import { tts } from '../utils/tts.js';
import './VoiceSettings.css';

/**
 * 语音设置组件
 * 允许用户调整TTS参数
 */
export default function VoiceSettings({ isOpen, onClose }) {
  const [rate, setRate] = useState(0.85);
  const [pitch, setPitch] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');

  useEffect(() => {
    loadVoices();
  }, []);

  function loadVoices() {
    const availableVoices = tts.getAllVoices();
    const englishVoices = availableVoices.filter(v => v.lang.startsWith('en-'));
    setVoices(englishVoices);
    
    const defaultVoice = tts.getEnglishVoices();
    if (defaultVoice) {
      setSelectedVoice(defaultVoice.name);
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

  return (
    <div className="voice-settings-overlay" onClick={onClose}>
      <div className="voice-settings-panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h3>🔊 语音设置</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
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
            🎵 测试发音
          </button>

          {/* 说明 */}
          <div className="info">
            <p>💡 提示:</p>
            <ul>
              <li>语速建议设为 0.7-0.9 方便学习</li>
              <li>某些浏览器语音质量更好(Safari/Chrome)</li>
              <li>iOS需要首次点击后才能启用语音</li>
            </ul>
          </div>
        </div>

        <div className="panel-footer">
          <button className="btn-save" onClick={onClose}>
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
