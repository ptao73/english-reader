import { useState, useEffect } from 'react';
import { getSentenceAnalysisStream } from '../utils/ai.js';
import { tts } from '../utils/tts.js';
import './SentenceCard.css';

/**
 * 句子卡片组件 - 优化版
 * 
 * 核心功能:
 * - 三层渐进式揭示 (反直觉学习)
 * - ⭐ Stream 流式输出
 * - ⭐ 朗读高亮显示
 * - ⭐ 单词点击收藏
 */
export default function SentenceCard({ sentence, onSaveWord }) {
  const [revealLevel, setRevealLevel] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ⭐ 新增: 流式输出状态
  const [streamText, setStreamText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // ⭐ 新增: 朗读状态
  const [isSpeaking, setIsSpeaking] = useState(false);

  /**
   * 重置状态
   */
  useEffect(() => {
    setRevealLevel(0);
    setAnalysis(null);
    setError(null);
    setStreamText('');
    setIsStreaming(false);
    setIsSpeaking(false);
  }, [sentence.sentenceId]);

  /**
   * ⭐ 获取分析 (支持流式输出)
   */
  async function fetchAnalysis() {
    if (analysis) return;

    setLoading(true);
    setError(null);
    setIsStreaming(true);
    setStreamText('');

    try {
      const result = await getSentenceAnalysisStream(
        sentence.sentenceId,
        sentence.text,
        // ⭐ 流式回调
        (chunk, fullText) => {
          setStreamText(fullText);
        }
      );

      setAnalysis(result);
      setIsStreaming(false);
    } catch (err) {
      console.error('分析失败:', err);
      setError(err.message);
      setIsStreaming(false);
    } finally {
      setLoading(false);
    }
  }

  /**
   * 揭示下一层
   */
  async function revealNext() {
    if (revealLevel === 0) {
      // 第一次点击,加载分析
      await fetchAnalysis();
    }
    
    if (revealLevel < 3) {
      setRevealLevel(prev => prev + 1);
    }
  }

  /**
   * ⭐ 朗读句子 (带高亮效果)
   */
  async function speakSentence() {
    if (isSpeaking) {
      tts.stop();
      setIsSpeaking(false);
      return;
    }

    try {
      await tts.speak(sentence.text, {
        rate: 0.85,
        onStart: () => {
          setIsSpeaking(true);
        },
        onEnd: () => {
          setIsSpeaking(false);
        },
        onError: (err) => {
          console.error('朗读失败:', err);
          setIsSpeaking(false);
          alert('朗读失败,请重试');
        }
      });
    } catch (err) {
      console.error('朗读异常:', err);
      setIsSpeaking(false);
    }
  }

  /**
   * ⭐ 处理单词点击 (收藏功能)
   */
  function handleWordClick(event) {
    const word = event.target.textContent.trim();
    
    // 过滤标点符号
    const cleanWord = word.replace(/[.,!?;:'"]/g, '');
    
    if (cleanWord.length > 1 && onSaveWord) {
      onSaveWord(cleanWord, sentence.text);
      
      // 视觉反馈
      event.target.style.backgroundColor = '#fef3c7';
      setTimeout(() => {
        event.target.style.backgroundColor = '';
      }, 500);
    }
  }

  /**
   * 重新思考
   */
  function reset() {
    setRevealLevel(0);
  }

  return (
    <div className={`sentence-card ${isSpeaking ? 'speaking' : ''}`}>
      {/* 句子文本区域 - ⭐ 支持单词点击 */}
      <div className="sentence-text">
        {sentence.text.split(' ').map((word, index) => (
          <span
            key={index}
            className="word"
            onClick={handleWordClick}
            title="点击收藏单词"
          >
            {word}{' '}
          </span>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="sentence-actions">
        <button
          className={`btn-speak ${isSpeaking ? 'active' : ''}`}
          onClick={speakSentence}
          title={isSpeaking ? '停止朗读' : '朗读句子'}
        >
          {isSpeaking ? '⏹' : '🔊'}
        </button>

        {revealLevel === 0 && (
          <button
            className="btn-reveal btn-primary"
            onClick={revealNext}
            disabled={loading}
          >
            {loading ? '⏳ 分析中...' : '💡 查看提示'}
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="error-message">
          ❌ {error}
          <button onClick={fetchAnalysis}>重试</button>
        </div>
      )}

      {/* ⭐ 流式输出预览 (调试用) */}
      {isStreaming && (
        <div className="stream-preview">
          <div className="stream-label">正在生成...</div>
          <pre className="stream-text">{streamText}</pre>
        </div>
      )}

      {/* Level 1: 提示 */}
      {revealLevel >= 1 && analysis && (
        <div className="analysis-section level-1">
          <div className="section-header">
            <span className="level-badge">Level 1</span>
            <h4>💡 提示</h4>
          </div>
          <div className="section-content hint">
            {analysis.hint}
          </div>
          {revealLevel === 1 && (
            <button
              className="btn-reveal btn-secondary"
              onClick={revealNext}
            >
              📖 查看深度分析
            </button>
          )}
        </div>
      )}

      {/* Level 2: 深度分析 */}
      {revealLevel >= 2 && analysis && (
        <div className="analysis-section level-2">
          <div className="section-header">
            <span className="level-badge">Level 2</span>
            <h4>📖 深度分析</h4>
          </div>
          <div className="section-content analysis">
            {analysis.analysis.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          {revealLevel === 2 && (
            <button
              className="btn-reveal btn-tertiary"
              onClick={revealNext}
            >
              🈯 查看中文翻译
            </button>
          )}
        </div>
      )}

      {/* Level 3: 中文翻译 */}
      {revealLevel >= 3 && analysis && (
        <div className="analysis-section level-3">
          <div className="section-header">
            <span className="level-badge">Level 3</span>
            <h4>🈯 中文翻译</h4>
          </div>
          <div className="section-content translation">
            {analysis.zh}
          </div>
          <button
            className="btn-reset"
            onClick={reset}
          >
            🔄 重新思考
          </button>
        </div>
      )}
    </div>
  );
}
