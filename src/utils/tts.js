/**
 * 文本转语音(TTS)工具
 * 使用浏览器原生Web Speech API
 */

class TextToSpeech {
  constructor() {
    this.synthesis = window.speechSynthesis;
    this.currentUtterance = null;
    this.isSpeaking = false;
  }

  /**
   * 获取可用的英文语音
   */
  getEnglishVoices() {
    const voices = this.synthesis.getVoices();
    
    // 优先选择质量好的英文语音
    const preferredVoices = [
      'Alex',              // macOS
      'Samantha',          // macOS  
      'Google US English', // Chrome
      'Microsoft David',   // Edge/Windows
      'Daniel',            // iOS
      'Karen'              // iOS
    ];

    // 按优先级查找
    for (const name of preferredVoices) {
      const voice = voices.find(v => v.name.includes(name));
      if (voice) return voice;
    }

    // 找任何英文语音
    const englishVoice = voices.find(v => 
      v.lang.startsWith('en-') && v.localService
    );
    if (englishVoice) return englishVoice;

    // 降级到任何英文语音
    return voices.find(v => v.lang.startsWith('en-'));
  }

  /**
   * 朗读文本
   * @param {string} text - 要朗读的文本
   * @param {Object} options - 配置选项
   */
  speak(text, options = {}) {
    // 如果正在朗读,先停止
    if (this.isSpeaking) {
      this.stop();
    }

    return new Promise((resolve, reject) => {
      // 创建utterance
      const utterance = new SpeechSynthesisUtterance(text);
      
      // 选择语音
      const voice = this.getEnglishVoices();
      if (voice) {
        utterance.voice = voice;
      }

      // 配置参数
      utterance.rate = options.rate || 0.9;      // 语速(0.1-10)
      utterance.pitch = options.pitch || 1.0;    // 音调(0-2)
      utterance.volume = options.volume || 1.0;  // 音量(0-1)
      utterance.lang = options.lang || 'en-US';  // 语言

      // 事件监听
      utterance.onstart = () => {
        this.isSpeaking = true;
        console.log('🔊 开始朗读:', text.substring(0, 50) + '...');
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        console.log('✅ 朗读完成');
        resolve();
      };

      utterance.onerror = (event) => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        console.error('❌ 朗读错误:', event.error);
        reject(new Error(`朗读失败: ${event.error}`));
      };

      // 保存引用
      this.currentUtterance = utterance;

      // 开始朗读
      this.synthesis.speak(utterance);
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

// 创建单例
export const tts = new TextToSpeech();

// 等待语音列表加载(某些浏览器需要)
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    console.log('✅ 语音列表已加载');
  };
}

export default TextToSpeech;
