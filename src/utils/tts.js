/**
 * 文本转语音(TTS)工具 - 优化版
 * 使用浏览器原生Web Speech API
 * 支持: 语速调整、音调优化、Bridge Pattern、异常处理
 */

/**
 * TTS 引擎接口 (Bridge Pattern)
 * 方便未来切换到 OpenAI TTS / Azure TTS 等云端服务
 */
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

/**
 * 浏览器原生 TTS 引擎
 */
class BrowserTTSEngine extends TTSEngine {
  constructor() {
    super();
    this.synthesis = window.speechSynthesis;
    this.currentUtterance = null;
    this.isSpeaking = false;
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  /**
   * 获取可用的英文语音 - 优化版
   * 优先选择高质量、接近真人的语音
   */
  getEnglishVoices() {
    const voices = this.synthesis.getVoices();
    
    // 优先级列表 (按音质从高到低)
    const preferredVoices = [
      // iOS/macOS - Apple 系统音质最佳
      { name: 'Samantha', score: 100 },       // macOS 美音女声
      { name: 'Alex', score: 95 },            // macOS 美音男声  
      { name: 'Ava', score: 90 },             // iOS Premium
      { name: 'Nicky', score: 85 },           // iOS Premium
      
      // Google - Chrome 内置
      { name: 'Google US English', score: 80 },
      { name: 'Google UK English Female', score: 75 },
      { name: 'Google UK English Male', score: 70 },
      
      // Microsoft - Edge/Windows
      { name: 'Microsoft Zira', score: 65 },
      { name: 'Microsoft David', score: 60 },
      
      // iOS 标准音
      { name: 'Daniel', score: 55 },
      { name: 'Karen', score: 50 },
      { name: 'Moira', score: 45 },
      { name: 'Tessa', score: 40 }
    ];

    // 按优先级查找
    for (const { name, score } of preferredVoices) {
      const voice = voices.find(v => v.name.includes(name));
      if (voice) {
        console.log(`✅ 选中语音: ${voice.name} (质量分: ${score})`);
        return voice;
      }
    }

    // 找任何本地英文语音 (优先本地服务,音质更好)
    const localEnglishVoice = voices.find(v => 
      v.lang.startsWith('en-') && v.localService
    );
    if (localEnglishVoice) {
      console.log(`✅ 选中本地语音: ${localEnglishVoice.name}`);
      return localEnglishVoice;
    }

    // 降级到任何英文语音
    const anyEnglishVoice = voices.find(v => v.lang.startsWith('en-'));
    if (anyEnglishVoice) {
      console.log(`⚠️ 降级语音: ${anyEnglishVoice.name}`);
      return anyEnglishVoice;
    }

    console.warn('❌ 未找到合适的英文语音');
    return null;
  }

  /**
   * 朗读文本 - 优化版
   * @param {string} text - 要朗读的文本
   * @param {Object} options - 配置选项
   * @param {Function} options.onStart - 开始回调
   * @param {Function} options.onEnd - 结束回调
   * @param {Function} options.onError - 错误回调
   * @returns {Promise<void>}
   */
  async speak(text, options = {}) {
    // 如果正在朗读,先停止
    if (this.isSpeaking) {
      this.stop();
    }

    return new Promise((resolve, reject) => {
      const attemptSpeak = (retryNum = 0) => {
        try {
          // 创建utterance
          const utterance = new SpeechSynthesisUtterance(text);
          
          // 选择语音
          const voice = this.getEnglishVoices();
          if (voice) {
            utterance.voice = voice;
          }

          // ⭐ 优化后的参数配置
          utterance.rate = options.rate || 0.85;      // 语速(0.85 更适合学习)
          utterance.pitch = options.pitch || 1.0;     // 音调(1.0 标准)
          utterance.volume = options.volume || 1.0;   // 音量(1.0 最大)
          utterance.lang = options.lang || 'en-US';   // 语言

          // 事件监听
          utterance.onstart = () => {
            this.isSpeaking = true;
            this.retryCount = 0;
            console.log('🔊 开始朗读:', text.substring(0, 50) + '...');
            
            if (options.onStart) {
              options.onStart();
            }
          };

          utterance.onend = () => {
            this.isSpeaking = false;
            this.currentUtterance = null;
            console.log('✅ 朗读完成');
            
            if (options.onEnd) {
              options.onEnd();
            }
            
            resolve();
          };

          utterance.onerror = (event) => {
            console.error('❌ 朗读错误:', event.error);

            // ⭐ 异常处理: 自动重试
            if (retryNum < this.maxRetries && event.error !== 'canceled') {
              console.log(`🔄 重试朗读 (${retryNum + 1}/${this.maxRetries})...`);
              this.stop();
              
              setTimeout(() => {
                attemptSpeak(retryNum + 1);
              }, 500);
              
              return;
            }

            // 重试失败后清理状态
            this.isSpeaking = false;
            this.currentUtterance = null;
            
            if (options.onError) {
              options.onError(event.error);
            }
            
            reject(new Error(`朗读失败: ${event.error}`));
          };

          // 保存引用
          this.currentUtterance = utterance;

          // 开始朗读
          this.synthesis.speak(utterance);
          
        } catch (error) {
          console.error('❌ 创建朗读任务失败:', error);
          this.isSpeaking = false;
          this.currentUtterance = null;
          
          if (options.onError) {
            options.onError(error.message);
          }
          
          reject(error);
        }
      };

      attemptSpeak();
    });
  }

  /**
   * 停止朗读
   */
  stop() {
    if (this.synthesis.speaking) {
      this.synthesis.cancel();
      this.isSpeaking = false;
      this.currentUtterance = null;
      console.log('⏹ 停止朗读');
    }
  }

  /**
   * 暂停朗读
   */
  pause() {
    if (this.synthesis.speaking && !this.synthesis.paused) {
      this.synthesis.pause();
      console.log('⏸ 暂停朗读');
    }
  }

  /**
   * 恢复朗读
   */
  resume() {
    if (this.synthesis.paused) {
      this.synthesis.resume();
      console.log('▶️ 恢复朗读');
    }
  }

  /**
   * 检查是否支持TTS
   */
  static isSupported() {
    return 'speechSynthesis' in window;
  }

  /**
   * 获取所有可用语音列表
   */
  getAllVoices() {
    return this.synthesis.getVoices();
  }
}

/**
 * OpenAI TTS 引擎 (预留接口)
 * 未来可切换到 OpenAI 的云端 TTS 服务
 */
class OpenAITTSEngine extends TTSEngine {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.currentAudio = null;
    this.isSpeaking = false;
  }

  async speak(text, options = {}) {
    // TODO: 实现 OpenAI TTS API 调用
    console.log('🔄 调用 OpenAI TTS API...');
    
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        voice: 'alloy',
        input: text,
        speed: options.rate || 1.0
      })
    });

    if (!response.ok) {
      throw new Error('OpenAI TTS 调用失败');
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    
    const audio = new Audio(audioUrl);
    this.currentAudio = audio;
    
    return new Promise((resolve, reject) => {
      audio.onplay = () => {
        this.isSpeaking = true;
        if (options.onStart) options.onStart();
      };
      
      audio.onended = () => {
        this.isSpeaking = false;
        if (options.onEnd) options.onEnd();
        resolve();
      };
      
      audio.onerror = () => {
        this.isSpeaking = false;
        if (options.onError) options.onError('播放失败');
        reject(new Error('音频播放失败'));
      };
      
      audio.play();
    });
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.isSpeaking = false;
    }
  }

  pause() {
    if (this.currentAudio) {
      this.currentAudio.pause();
    }
  }

  resume() {
    if (this.currentAudio) {
      this.currentAudio.play();
    }
  }

  static isSupported() {
    return true; // 需要 API Key
  }
}

/**
 * Azure TTS 引擎 (预留接口)
 */
class AzureTTSEngine extends TTSEngine {
  constructor(apiKey, region) {
    super();
    this.apiKey = apiKey;
    this.region = region;
  }

  async speak(text, options = {}) {
    // TODO: 实现 Azure TTS API 调用
    console.log('🔄 调用 Azure TTS API...');
    throw new Error('Azure TTS 尚未实现');
  }

  stop() {}
  pause() {}
  resume() {}

  static isSupported() {
    return true;
  }
}

/**
 * TTS 管理器 (使用 Bridge Pattern)
 */
class TextToSpeech {
  constructor(engineType = 'browser', config = {}) {
    this.engineType = engineType;
    this.config = config;
    this.engine = this.createEngine();
  }

  /**
   * 创建 TTS 引擎
   */
  createEngine() {
    switch (this.engineType) {
      case 'browser':
        return new BrowserTTSEngine();
      
      case 'openai':
        if (!this.config.apiKey) {
          throw new Error('OpenAI TTS 需要 API Key');
        }
        return new OpenAITTSEngine(this.config.apiKey);
      
      case 'azure':
        if (!this.config.apiKey || !this.config.region) {
          throw new Error('Azure TTS 需要 API Key 和 Region');
        }
        return new AzureTTSEngine(this.config.apiKey, this.config.region);
      
      default:
        throw new Error(`不支持的引擎类型: ${this.engineType}`);
    }
  }

  /**
   * ⭐ 一键切换引擎
   * @param {string} engineType - 'browser' | 'openai' | 'azure'
   * @param {Object} config - 引擎配置
   */
  switchEngine(engineType, config = {}) {
    console.log(`🔄 切换 TTS 引擎: ${this.engineType} → ${engineType}`);
    
    // 停止当前引擎
    this.stop();
    
    // 创建新引擎
    this.engineType = engineType;
    this.config = config;
    this.engine = this.createEngine();
    
    console.log('✅ 引擎切换成功');
  }

  /**
   * 朗读文本
   */
  async speak(text, options = {}) {
    return this.engine.speak(text, options);
  }

  /**
   * 停止朗读
   */
  stop() {
    this.engine.stop();
  }

  /**
   * 暂停朗读
   */
  pause() {
    this.engine.pause();
  }

  /**
   * 恢复朗读
   */
  resume() {
    this.engine.resume();
  }

  /**
   * 检查当前引擎是否可用
   */
  isSupported() {
    return this.engine.constructor.isSupported();
  }

  /**
   * 获取当前引擎状态
   */
  getStatus() {
    return {
      engineType: this.engineType,
      isSpeaking: this.engine.isSpeaking,
      isSupported: this.isSupported()
    };
  }

  /**
   * 获取所有可用语音 (仅浏览器引擎)
   */
  getAllVoices() {
    if (this.engine instanceof BrowserTTSEngine) {
      return this.engine.getAllVoices();
    }
    return [];
  }
}

// ⭐ 创建单例 (默认使用浏览器原生 TTS)
export const tts = new TextToSpeech('browser');

// 等待语音列表加载(某些浏览器需要)
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    console.log('✅ 语音列表已加载');
    
    // 显示可用语音
    const voices = tts.getAllVoices();
    console.log(`📢 可用语音数量: ${voices.length}`);
    
    const englishVoices = voices.filter(v => v.lang.startsWith('en-'));
    console.log(`🇺🇸 英文语音数量: ${englishVoices.length}`);
  };
}

export default TextToSpeech;

/**
 * 使用示例:
 * 
 * // 1. 使用默认浏览器 TTS
 * import { tts } from './utils/tts.js';
 * 
 * await tts.speak('Hello world', {
 *   rate: 0.85,
 *   onStart: () => console.log('开始'),
 *   onEnd: () => console.log('结束')
 * });
 * 
 * // 2. 切换到 OpenAI TTS
 * tts.switchEngine('openai', {
 *   apiKey: 'sk-xxxxx'
 * });
 * 
 * await tts.speak('Hello world');
 * 
 * // 3. 切换回浏览器 TTS
 * tts.switchEngine('browser');
 */
