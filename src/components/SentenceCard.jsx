import { useState, useEffect } from 'react';
import { db } from '../db/schema.js';
import { getSentenceAnalysis } from '../utils/ai.js';
import { tts } from '../utils/tts.js';
import './SentenceCard.css';

/**
 * 句子卡片组件 - 反直觉学习的核心实现
 * 
 * 三层揭示设计:
 * Level 1: 💡 提示 - 最少信息,强迫思考
 * Level 2: 📖 深度分析 - 完整语法解析
 * Level 3: 🈯 中文翻译 - 兜底确认
 */
export default function SentenceCard({ sentence, onNext, onPrevious }) {
  const [level, setLevel] = useState(1);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // 加载已保存的reveal状态
  useEffect(() => {
    loadRevealState();
  }, [sentence.sentenceId]);

  /**
   * 从数据库加载reveal状态
   */
  async function loadRevealState() {
    try {
      const state = await db.revealState.get(sentence.sentenceId);
      if (state) {
        setLevel(state.level);
      } else {
        setLevel(1); // 默认从Level 1开始
      }
    } catch (err) {
      console.error('加载状态失败:', err);
      setLevel(1);
    }
  }

  /**
   * 保存reveal状态到数据库
   */
  async function saveRevealState(newLevel) {
    try {
      await db.revealState.put({
        sentenceId: sentence.sentenceId,
        level: newLevel,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('保存状态失败:', err);
    }
  }

  /**
   * 揭示下一层
   */
  async function revealNext() {
    // 如果是第一次点击,需要先加载AI分析
    if (level === 1 && !analysis) {
      await loadAnalysis();
    }

    // 增加level
    const newLevel = Math.min(level + 1, 3);
    setLevel(newLevel);
    await saveRevealState(newLevel);
  }

  /**
   * 重置到Level 1(重新思考)
   */
  async function resetLevel() {
    setLevel(1);
    await saveRevealState(1);
  }

  /**
   * 加载AI分析
   */
  async function loadAnalysis() {
    setLoading(true);
    setError(null);

    try {
      const result = await getSentenceAnalysis(
        sentence.sentenceId,
        sentence.text
      );
      setAnalysis(result);
    } catch (err) {
      console.error('分析失败:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /**
   * 朗读句子
   */
  async function handleSpeak() {
    if (isSpeaking) {
      tts.stop();
      setIsSpeaking(false);
    } else {
      try {
        setIsSpeaking(true);
        await tts.speak(sentence.text, {
          rate: 0.85,  // 稍慢一点,方便学习
          pitch: 1.0,
          volume: 1.0
        });
        setIsSpeaking(false);
      } catch (err) {
        console.error('朗读失败:', err);
        setIsSpeaking(false);
      }
    }
  }

  /**
   * 判断按钮状态
   */
  const canReveal = level < 3;
  const isMaxLevel = level === 3;

  return (
    <div className="sentence-card">
      {/* 句子文本 */}
      <div className="sentence-text">
        <p>{sentence.text}</p>
        <button 
          className="btn-speak"
          onClick={handleSpeak}
          title={isSpeaking ? "停止朗读" : "朗读句子"}
        >
          {isSpeaking ? '⏹ 停止' : '🔊 朗读'}
        </button>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <span>AI正在分析句子...</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="error">
          <p>❌ {error}</p>
          <button onClick={loadAnalysis}>重试</button>
        </div>
      )}

      {/* 分析内容(根据level逐层显示) */}
      {analysis && !loading && (
        <div className="analysis-content">
          {/* Level 1: 提示 */}
          {level >= 1 && (
            <div className="hint-section">
              <div className="section-header">
                <span className="badge">💡 提示</span>
                <span className="tip">先自己思考,不要依赖答案</span>
              </div>
              <div className="content">
                <pre>{analysis.hint}</pre>
              </div>
            </div>
          )}

          {/* Level 2: 深度分析 */}
          {level >= 2 && (
            <div className="analysis-section">
              <div className="section-header">
                <span className="badge">📖 深度分析</span>
              </div>
              <div className="content">
                <pre>{analysis.analysis}</pre>
              </div>
            </div>
          )}

          {/* Level 3: 中文翻译 */}
          {level >= 3 && (
            <div className="translation-section">
              <div className="section-header">
                <span className="badge">🈯 中文翻译</span>
              </div>
              <div className="content">
                <p>{analysis.zh}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="actions">
        <div className="reveal-actions">
          {/* 揭示下一层按钮 */}
          <button
            className="btn-primary"
            onClick={revealNext}
            disabled={isMaxLevel || loading}
          >
            {level === 1 && '💡 查看提示'}
            {level === 2 && '📖 深度分析'}
            {level === 3 && '✅ 已全部展开'}
          </button>

          {/* 重新思考按钮 */}
          {level > 1 && (
            <button
              className="btn-secondary"
              onClick={resetLevel}
              disabled={loading}
            >
              🔄 重新思考
            </button>
          )}
        </div>

        {/* 导航按钮 */}
        <div className="nav-actions">
          {onPrevious && (
            <button
              className="btn-nav"
              onClick={onPrevious}
              disabled={loading}
            >
              ← 上一句
            </button>
          )}
          
          {onNext && (
            <button
              className="btn-nav"
              onClick={onNext}
              disabled={loading}
            >
              下一句 →
            </button>
          )}
        </div>
      </div>

      {/* 进度指示器 */}
      <div className="level-indicator">
        <div className={`level-dot ${level >= 1 ? 'active' : ''}`}>1</div>
        <div className={`level-dot ${level >= 2 ? 'active' : ''}`}>2</div>
        <div className={`level-dot ${level >= 3 ? 'active' : ''}`}>3</div>
      </div>
    </div>
  );
}
