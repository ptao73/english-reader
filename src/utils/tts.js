/**
 * 文本转语音(TTS)工具 - 支持浏览器语音 + OpenAI TTS
 * Bridge Pattern: 可在两种引擎间无缝切换
 * OpenAI 引擎走后端代理 /api/tts，自带 IndexedDB 缓存
 */

import { db } from '../db/schema.js';

// TTS设置的存储键名
const TTS_SETTINGS_KEY = 'tts_settings';

// OpenAI 可选声音列表
export const OPENAI_VOICES = [
  { id: 'nova',    label: 'Nova',    desc: '温暖女声，最自然', tag: '推荐' },
  { id: 'alloy',   label: 'Alloy',   desc: '中性平衡，通用', tag: '' },
  { id: 'shimmer', label: 'Shimmer', desc: '轻柔女声，故事朗读', tag: '' },
  { id: 'echo',    label: 'Echo',    desc: '低沉男声，新闻风格', tag: '' },
  { id: 'fable',   label: 'Fable',   desc: '温和男声，叙事', tag: '' },
  { id: 'onyx',    label: 'Onyx',    desc: '深沉男声，正式场合', tag: '' },
];

// 默认TTS设置
const DEFAULT_TTS_SETTINGS = {
  engineType: 'browser',   // 'browser' | 'openai'
  rate: 0.85,
  pitch: 1.0,
  volume: 1.0,
  selectedVoice: '',       // 浏览器语音名称
  openaiVoice: 'nova',    // OpenAI 声音 ID
};

/**
 * 从IndexedDB加载TTS设置
 */
export async function loadTTSSettings() {
  try {
    const record = await db.settings.get(TTS_SETTINGS_KEY);
    if (record && record.value) {
      return { ...DEFAULT_TTS_SETTINGS, ...record.value };
    }
    return { ...DEFAULT_TTS_SETTINGS };
  } catch (err) {
    console.error('加载TTS设置失败:', err);
    return { ...DEFAULT_TTS_SETTINGS };
  }
}

/**
 * 保存TTS设置到IndexedDB
 */
export async function saveTTSSettings(settings) {
  try {
    await db.settings.put({
      key: TTS_SETTINGS_KEY,
      value: settings
    });
    console.log('TTS设置已保存:', settings);
  } catch (err) {
    console.error('保存TTS设置失败:', err);
    throw err;
  }
}

// ============================================================
// 缓存工具：为"文本+声音"生成唯一 key
// ============================================================
async function ttsCacheKey(text, voice) {
  const raw = `${voice}:${text}`;
  // 使用 SubtleCrypto 生成 SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// TTS 引擎基类 (Bridge Pattern)
// ============================================================
class TTSEngine {
  async speak(text, options) {
    throw new Error('子类必须实现 speak 方法');
  }
  stop() {
    throw new Error('子类必须实现 stop 方法');
  }
  pause() {
    throw new Error('子类必须实现 pause 方法');
  }
  resume() {
    throw new Error('子类必须实现 resume 方法');
  }
  static isSupported() {
    throw new Error('子类必须实现 isSupported 静态方法');
  }
}

// ============================================================
// iOS 检测 & 语音列表就绪 Promise
// ============================================================
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let _voicesReady = false;
let _voicesReadyPromise = null;

function ensureVoicesReady() {
  if (_voicesReady) return Promise.resolve();
  if (_voicesReadyPromise) return _voicesReadyPromise;

  _voicesReadyPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) { resolve(); return; }

    const voices = synth.getVoices();
    if (voices && voices.length > 0) {
      _voicesReady = true;
      resolve();
      return;
    }

    // iOS/Safari 异步加载语音列表
    const onReady = () => {
      _voicesReady = true;
      resolve();
    };
    synth.onvoiceschanged = onReady;

    // 超时兜底：iOS 某些情况下 onvoiceschanged 不触发
    setTimeout(onReady, 2000);
  });

  return _voicesReadyPromise;
}

// ============================================================
// 浏览器原生 TTS 引擎（修复 iOS 兼容性）
// ============================================================
class BrowserTTSEngine extends TTSEngine {
  constructor() {
    super();
    this.synthesis = window.speechSynthesis;
    this.currentUtterance = null;
    this.isSpeaking = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    this._iosActivated = false;  // iOS 首次激活标记
    this._iosKeepAliveTimer = null;
  }

  getEnglishVoices() {
    const voices = this.synthesis.getVoices();
    const preferredVoices = [
      { name: 'Ava (Premium)', score: 100 },
      { name: 'Zoe (Premium)', score: 98 },
      { name: 'Evan (Premium)', score: 96 },
      { name: 'Samantha (Enhanced)', score: 94 },
      { name: 'Tom (Enhanced)', score: 92 },
      { name: 'Samantha', score: 85 },
      { name: 'Alex', score: 83 },
      { name: 'Ava', score: 80 },
      { name: 'Nicky', score: 78 },
      { name: 'Google US English', score: 70 },
      { name: 'Google UK English Female', score: 68 },
      { name: 'Google UK English Male', score: 66 },
      { name: 'Microsoft Zira', score: 60 },
      { name: 'Microsoft David', score: 58 },
      { name: 'Daniel', score: 50 },
      { name: 'Karen', score: 48 },
      { name: 'Moira', score: 46 },
      { name: 'Tessa', score: 44 }
    ];

    for (const { name } of preferredVoices) {
      const voice = voices.find(v => v.name.includes(name));
      if (voice) return voice;
    }

    const localEnglishVoice = voices.find(v =>
      v.lang.startsWith('en-') && v.localService
    );
    if (localEnglishVoice) return localEnglishVoice;

    return voices.find(v => v.lang.startsWith('en-')) || null;
  }

  /**
   * iOS warm-up: 用空 utterance 激活语音引擎
   * 必须在用户手势的同步调用栈中执行
   */
  _iosWarmUp() {
    if (this._iosActivated || !isIOS) return;
    const warm = new SpeechSynthesisUtterance('');
    warm.volume = 0;
    warm.rate = 1;
    this.synthesis.speak(warm);
    this._iosActivated = true;
    console.log('iOS TTS warm-up 完成');
  }

  /**
   * iOS 防冻结: 定期 pause/resume 防止引擎超时静默
   */
  _startKeepAlive() {
    this._stopKeepAlive();
    if (!isIOS) return;
    this._iosKeepAliveTimer = setInterval(() => {
      if (this.synthesis.speaking && !this.synthesis.paused) {
        this.synthesis.pause();
        this.synthesis.resume();
      }
    }, 10000);
  }

  _stopKeepAlive() {
    if (this._iosKeepAliveTimer) {
      clearInterval(this._iosKeepAliveTimer);
      this._iosKeepAliveTimer = null;
    }
  }

  /**
   * 朗读文本 — 全同步路径，不含任何 await
   * iOS 要求从用户手势 (click) 到 speechSynthesis.speak() 的整条调用链
   * 必须是同步的，任何 await/Promise 都会打断手势链导致静默失败
   */
  speak(text, options = {}) {
    // iOS warm-up（同步，在用户手势栈中）
    this._iosWarmUp();

    // 无条件 cancel — 修复 iOS speaking 属性不准确导致的冻结
    this.synthesis.cancel();
    this.isSpeaking = false;
    this.currentUtterance = null;

    // 注意：不在这里 await ensureVoicesReady()
    // 语音列表在模块加载时已预加载，这里同步获取即可
    // 如果还没加载完，getVoices() 会返回空数组，utterance.lang 会兜底

    return new Promise((resolve, reject) => {
      const attemptSpeak = (retryNum = 0) => {
        try {
          // 重试前也要 cancel，防止队列堆积
          if (retryNum > 0) {
            this.synthesis.cancel();
          }

          const utterance = new SpeechSynthesisUtterance(text);

          let voice = null;
          if (options.preferredVoice) {
            const allVoices = this.synthesis.getVoices();
            voice = allVoices.find(v => v.name === options.preferredVoice);
          }
          if (!voice) {
            voice = this.getEnglishVoices();
          }
          if (voice) {
            utterance.voice = voice;
          }

          utterance.rate = options.rate || 0.85;
          utterance.pitch = options.pitch || 1.0;
          utterance.volume = options.volume || 1.0;
          utterance.lang = options.lang || 'en-US';

          utterance.onstart = () => {
            this.isSpeaking = true;
            this.retryCount = 0;
            this._startKeepAlive();
            if (options.onStart) options.onStart();
          };

          utterance.onend = () => {
            this.isSpeaking = false;
            this.currentUtterance = null;
            this._stopKeepAlive();
            if (options.onEnd) options.onEnd();
            resolve();
          };

          utterance.onerror = (event) => {
            this._stopKeepAlive();
            if (retryNum < this.maxRetries && event.error !== 'canceled') {
              this.synthesis.cancel();
              setTimeout(() => attemptSpeak(retryNum + 1), 300);
              return;
            }
            this.isSpeaking = false;
            this.currentUtterance = null;
            if (options.onError) options.onError(event.error);
            reject(new Error(`朗读失败: ${event.error}`));
          };

          this.currentUtterance = utterance;
          this.synthesis.speak(utterance);

          // iOS 兜底: onstart 可能不触发，超时后手动标记
          if (isIOS) {
            setTimeout(() => {
              if (this.synthesis.speaking && !this.isSpeaking) {
                this.isSpeaking = true;
                if (options.onStart) options.onStart();
              }
            }, 300);
          }
        } catch (error) {
          this.isSpeaking = false;
          this.currentUtterance = null;
          this._stopKeepAlive();
          if (options.onError) options.onError(error.message);
          reject(error);
        }
      };
      attemptSpeak();
    });
  }

  stop() {
    // 无条件 cancel，不依赖 speaking 属性
    this.synthesis.cancel();
    this.isSpeaking = false;
    this.currentUtterance = null;
    this._stopKeepAlive();
  }

  pause() {
    if (this.synthesis.speaking && !this.synthesis.paused) {
      this.synthesis.pause();
    }
  }

  resume() {
    if (this.synthesis.paused) {
      this.synthesis.resume();
    }
  }

  static isSupported() {
    return 'speechSynthesis' in window;
  }

  getAllVoices() {
    return this.synthesis.getVoices();
  }
}

// ============================================================
// OpenAI TTS 引擎 — 通过后端代理 + IndexedDB 缓存
// ============================================================
class OpenAITTSEngine extends TTSEngine {
  constructor() {
    super();
    this.currentAudio = null;
    this.isSpeaking = false;
    this.voice = 'nova';       // 默认声音
  }

  /**
   * 检查后端是否配置了 OpenAI API Key
   */
  static async checkAvailability() {
    try {
      const res = await fetch('/api/tts?action=status');
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.available;
    } catch {
      return false;
    }
  }

  static isSupported() {
    return true;
  }

  async speak(text, options = {}) {
    if (this.isSpeaking) {
      this.stop();
    }

    const voice = options.openaiVoice || this.voice;
    const speed = options.rate || 1.0;
    const volume = options.volume ?? 1.0;

    try {
      // 1. 先查 IndexedDB 缓存
      const key = await ttsCacheKey(text, voice);
      let audioBlob = null;

      try {
        const cached = await db.ttsCache.get(key);
        if (cached && cached.blob) {
          audioBlob = cached.blob;
          console.log('从缓存播放 TTS');
        }
      } catch (e) {
        // 缓存读取失败不影响流程
      }

      // 2. 没缓存 → 调后端代理
      if (!audioBlob) {
        console.log('调用 OpenAI TTS API...');
        if (options.onStart) options.onStart();

        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice, speed }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `TTS 请求失败 (${res.status})`);
        }

        audioBlob = await res.blob();

        // 3. 存入缓存
        try {
          await db.ttsCache.put({
            key,
            blob: audioBlob,
            voice,
            textPreview: text.substring(0, 100),
            createdAt: new Date().toISOString(),
          });
          console.log('TTS 音频已缓存');
        } catch (e) {
          console.warn('缓存写入失败:', e);
        }
      }

      // 4. 播放音频
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.volume = volume;
      this.currentAudio = audio;

      return new Promise((resolve, reject) => {
        audio.onplay = () => {
          this.isSpeaking = true;
          if (options.onStart) options.onStart();
        };

        audio.onended = () => {
          this.isSpeaking = false;
          this.currentAudio = null;
          URL.revokeObjectURL(audioUrl);
          if (options.onEnd) options.onEnd();
          resolve();
        };

        audio.onerror = () => {
          this.isSpeaking = false;
          this.currentAudio = null;
          URL.revokeObjectURL(audioUrl);
          if (options.onError) options.onError('播放失败');
          reject(new Error('音频播放失败'));
        };

        audio.play().catch(err => {
          this.isSpeaking = false;
          this.currentAudio = null;
          URL.revokeObjectURL(audioUrl);
          if (options.onError) options.onError(err.message);
          reject(err);
        });
      });
    } catch (error) {
      this.isSpeaking = false;
      if (options.onError) options.onError(error.message);
      throw error;
    }
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.isSpeaking = false;
      this.currentAudio = null;
    }
  }

  pause() {
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
    }
  }

  resume() {
    if (this.currentAudio && this.currentAudio.paused) {
      this.currentAudio.play();
    }
  }
}

// ============================================================
// TTS 管理器 (Bridge Pattern)
// ============================================================
class TextToSpeech {
  constructor(engineType = 'browser') {
    this.engineType = engineType;
    this.engine = this._createEngine(engineType);
  }

  _createEngine(type) {
    switch (type) {
      case 'openai':
        return new OpenAITTSEngine();
      case 'browser':
      default:
        return new BrowserTTSEngine();
    }
  }

  /**
   * 切换引擎（同时持久化到 IndexedDB）
   */
  async switchEngine(engineType) {
    if (engineType === this.engineType) return;
    console.log(`切换 TTS 引擎: ${this.engineType} -> ${engineType}`);
    this.stop();
    this.engineType = engineType;
    this.engine = this._createEngine(engineType);

    // 持久化引擎选择
    try {
      const settings = await loadTTSSettings();
      settings.engineType = engineType;
      await saveTTSSettings(settings);
    } catch (e) {
      console.warn('保存引擎选择失败:', e);
    }
  }

  /**
   * 朗读文本 — 自动合并已保存的设置
   * 注意：设置合并全部同步完成，不在用户手势和 speak() 之间插入异步操作
   */
  speak(text, options = {}) {
    const saved = this.currentSettings || {};
    const merged = {
      rate: saved.rate || 0.85,
      pitch: saved.pitch || 1.0,
      volume: saved.volume || 1.0,
      ...options,
    };

    // 浏览器引擎：传 preferredVoice
    if (this.engine instanceof BrowserTTSEngine && saved.selectedVoice) {
      merged.preferredVoice = saved.selectedVoice;
    }

    // OpenAI 引擎：传 openaiVoice
    if (this.engine instanceof OpenAITTSEngine) {
      merged.openaiVoice = merged.openaiVoice || saved.openaiVoice || 'nova';
    }

    // 直接返回 engine.speak() 的 Promise，不用 async/await
    // 保证 BrowserTTSEngine 中的 iOS warm-up 和 cancel() 在用户手势同步栈中执行
    return this.engine.speak(text, merged);
  }

  stop() {
    this.engine.stop();
  }

  pause() {
    this.engine.pause();
  }

  resume() {
    this.engine.resume();
  }

  isSupported() {
    return this.engine.constructor.isSupported();
  }

  getStatus() {
    return {
      engineType: this.engineType,
      isSpeaking: this.engine.isSpeaking,
      isSupported: this.isSupported(),
    };
  }

  getAllVoices() {
    if (this.engine instanceof BrowserTTSEngine) {
      return this.engine.getAllVoices();
    }
    return [];
  }

  getEnglishVoices() {
    if (this.engine instanceof BrowserTTSEngine) {
      return this.engine.getEnglishVoices();
    }
    return null;
  }

  applySettings(settings) {
    this.currentSettings = settings;
  }

  getCurrentSettings() {
    return this.currentSettings || { ...DEFAULT_TTS_SETTINGS };
  }
}

// 导出 OpenAI 可用性检查（供 VoiceSettings 使用）
export const checkOpenAIAvailability = OpenAITTSEngine.checkAvailability;

// 创建单例（默认浏览器引擎，稍后自动恢复上次选择）
export const tts = new TextToSpeech('browser');

// 初始化：从 IndexedDB 恢复上次的引擎选择
(async () => {
  try {
    const settings = await loadTTSSettings();
    tts.applySettings(settings);
    if (settings.engineType === 'openai') {
      const available = await OpenAITTSEngine.checkAvailability();
      if (available) {
        tts.engineType = 'openai';
        tts.engine = tts._createEngine('openai');
        console.log('已恢复 OpenAI TTS 引擎');
      }
    }
  } catch (e) {
    // 静默失败，使用浏览器引擎
  }
})();

// 预加载语音列表 + 诊断输出
if (window.speechSynthesis) {
  ensureVoicesReady().then(() => {
    const voices = tts.getAllVoices();
    const englishVoices = voices.filter(v => v.lang.startsWith('en-'));
    console.log(`语音列表已加载: 共 ${voices.length} 个，英文 ${englishVoices.length} 个`);

    // ===== TTS 诊断：打印所有可用语音 =====
    console.group('🔍 TTS 诊断 — 全部可用语音列表');
    console.table(voices.map((v, i) => ({
      '#': i,
      name: v.name,
      voiceURI: v.voiceURI,
      lang: v.lang,
      localService: v.localService,
      default: v.default,
    })));
    console.groupEnd();

    console.group('🔍 TTS 诊断 — 英文语音');
    englishVoices.forEach(v => {
      console.log(`  [${v.lang}] ${v.name} | URI: ${v.voiceURI} | local: ${v.localService} | default: ${v.default}`);
    });
    console.groupEnd();

    // 检查 Ava 是否存在
    const avaVoices = voices.filter(v => v.name.toLowerCase().includes('ava'));
    if (avaVoices.length > 0) {
      console.log('✅ 找到 Ava 语音:', avaVoices.map(v => `${v.name} (${v.voiceURI})`));
    } else {
      console.warn('⚠️ 未找到 Ava 语音。偏好列表中的声音可能不可用。');
      // 打印实际会选中的语音
      const selected = tts.getEnglishVoices();
      if (selected) {
        console.log('📢 当前自动选择的英文语音:', selected.name, '|', selected.voiceURI, '|', selected.lang);
      } else {
        console.error('❌ 没有找到任何英文语音！将使用系统默认语音（可能是中文）');
      }
    }

    // 测试: 用选中的语音尝试一次静默 speak，检查是否报错
    const testVoice = tts.getEnglishVoices();
    console.log('🎯 最终选定语音:', testVoice ? `${testVoice.name} (${testVoice.voiceURI})` : '无 — 将依赖 lang 属性兜底');
    console.log('📱 iOS 设备:', isIOS ? '是' : '否');
    console.log('🌐 User Agent:', navigator.userAgent);
    // ===== 诊断结束 =====
  });
}

export default TextToSpeech;
