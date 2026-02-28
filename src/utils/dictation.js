/**
 * 听写引擎 - 精读/听写模式
 * 逐句播放语音，每句重复多次，句间有间隔
 * 复用项目的 TTS 系统和分句逻辑
 */

import { tts } from './tts.js';
import { splitIntoSentences } from './textParser.js';

export class DictationEngine {
  constructor() {
    this.sentences = [];
    this.currentIndex = 0;
    this.currentRepeatCount = 0;
    this.isPlaying = false;
    this.timer = null;
    this.config = { repeats: 3, interval: 3000 };
    this._speakPromise = null;

    // 状态回调钩子：供外部 UI 订阅状态变化
    this.onStateChange = null;
  }

  /**
   * 从原始文本加载句子（使用项目的智能分句）
   */
  loadText(rawText) {
    if (!rawText || !rawText.trim()) return false;
    this.sentences = splitIntoSentences(rawText);
    this._reset();
    return this.sentences.length > 0;
  }

  /**
   * 直接接收已解析的句子数组（从 article.sentences 进入）
   */
  loadSentences(sentenceArray) {
    if (!sentenceArray || sentenceArray.length === 0) return false;
    this.sentences = sentenceArray.map(s => (typeof s === 'string' ? s : s.text));
    this._reset();
    return true;
  }

  _reset() {
    this.currentIndex = 0;
    this.currentRepeatCount = 0;
    this.isPlaying = false;
    this._stopAudio();
  }

  /**
   * 开始听写
   */
  start(config = {}) {
    if (this.sentences.length === 0) return;
    this.config = { ...this.config, ...config };
    this.currentIndex = 0;
    this.currentRepeatCount = 0;
    this.isPlaying = true;

    this._stopAudio();
    this._playEngine();
  }

  /**
   * 从当前位置继续（暂停后恢复）
   */
  resume() {
    if (this.sentences.length === 0 || this.currentIndex >= this.sentences.length) return;
    this.isPlaying = true;
    this._playEngine();
  }

  /**
   * 停止听写
   */
  stop() {
    this.isPlaying = false;
    this._stopAudio();
    this._notify('stopped');
  }

  /**
   * 跳句：direction > 0 下一句，< 0 上一句
   */
  skip(direction) {
    if (!this.isPlaying || this.sentences.length === 0) return;
    this._stopAudio();

    this.currentIndex += direction;
    if (this.currentIndex < 0) this.currentIndex = 0;
    if (this.currentIndex >= this.sentences.length) {
      this.currentIndex = this.sentences.length - 1;
    }

    this.currentRepeatCount = 0;
    this._notify(direction > 0 ? 'skipped_next' : 'skipped_prev');
    this.timer = setTimeout(() => this._playEngine(), 300);
  }

  /**
   * 重读当前句
   */
  restartCurrent() {
    if (!this.isPlaying || this.sentences.length === 0 || this.currentIndex >= this.sentences.length) return;
    this._stopAudio();
    this.currentRepeatCount = 0;
    this._notify('restarting');
    this.timer = setTimeout(() => this._playEngine(), 300);
  }

  /**
   * 更新配置（不中断播放）
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }

  // ---- 私有方法 ----

  _stopAudio() {
    tts.stop();
    clearTimeout(this.timer);
    this._speakPromise = null;
  }

  _playEngine() {
    if (!this.isPlaying) return;

    if (this.currentIndex >= this.sentences.length) {
      this.isPlaying = false;
      this._notify('completed');
      return;
    }

    const sentence = this.sentences[this.currentIndex];
    this._notify('playing');

    // 使用项目 TTS 单例播放，自动继承用户语音设置
    this._speakPromise = tts.speak(sentence)
      .then(() => {
        if (!this.isPlaying) return;

        this.currentRepeatCount++;
        if (this.currentRepeatCount < this.config.repeats) {
          this._notify('waiting');
          this.timer = setTimeout(() => this._playEngine(), this.config.interval);
        } else {
          this.currentRepeatCount = 0;
          this.currentIndex++;
          if (this.currentIndex < this.sentences.length) {
            this._notify('next');
            this.timer = setTimeout(() => this._playEngine(), this.config.interval);
          } else {
            this.isPlaying = false;
            this._notify('completed');
          }
        }
      })
      .catch(() => {
        // 被 stop/skip 打断时忽略错误
        if (!this.isPlaying) return;
      });
  }

  _notify(status = '') {
    if (typeof this.onStateChange === 'function') {
      this.onStateChange({
        isPlaying: this.isPlaying,
        currentIndex: this.currentIndex,
        totalSentences: this.sentences.length,
        currentRepeatCount: this.currentRepeatCount,
        maxRepeats: this.config.repeats,
        currentSentence: this.sentences[this.currentIndex] || '',
        status,
      });
    }
  }
}
