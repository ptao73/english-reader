import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { getSentenceAnalysisStream } from '../utils/ai.js';
import { tts } from '../utils/tts.js';
import { tokenizeSentence } from '../utils/textParser.js';
import { recordActivity } from '../utils/statistics.js';
import './SentenceCard.css';

/**
 * 句子卡片组件 - 优化版
 *
 * 核心功能:
 * - 三层渐进式揭示 (反直觉学习)
 * - ⭐ 预加载缓存支持
 * - ⭐ Stream 流式输出
 * - ⭐ 朗读高亮显示
 * - ⭐ 单词点击收藏
 */
export default function SentenceCard({
  sentence,
  prefetchedAnalysis,
  onSaveWord,
  hideSpeakButton = false
}) {
  const [revealLevel, setRevealLevel] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 流式输出状态
  const [streamText, setStreamText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // 朗读状态
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
   * 当预加载分析到达时，自动使用
   */
  useEffect(() => {
    if (prefetchedAnalysis && !analysis) {
      setAnalysis(prefetchedAnalysis);
      console.log('✅ 使用预加载的分析');
    }
  }, [prefetchedAnalysis]);

  /**
   * 获取分析 (支持流式输出)
   */
  async function fetchAnalysis() {
    // 如果已有分析（包括预加载的），直接返回
    if (analysis) return;

    // 如果预加载已完成，直接使用
    if (prefetchedAnalysis) {
      setAnalysis(prefetchedAnalysis);
      return;
    }

    // 否则发起请求
    setLoading(true);
    setError(null);
    setIsStreaming(true);
    setStreamText('');

    try {
      const result = await getSentenceAnalysisStream(
        sentence.sentenceId,
        sentence.text,
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
      // 第一次点击 - 记录阅读统计
      recordActivity('sentence_read').catch(err => {
        console.error('记录统计失败:', err);
      });

      if (analysis || prefetchedAnalysis) {
        // 已有分析，直接使用
        if (!analysis && prefetchedAnalysis) {
          setAnalysis(prefetchedAnalysis);
        }
      } else {
        // 没有预加载，发起请求
        await fetchAnalysis();
      }
    }

    if (revealLevel < 3) {
      setRevealLevel(prev => prev + 1);
    }
  }

  /**
   * 朗读句子
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
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
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
   * 使用 useMemo 缓存分词结果
   * 设计意图: 避免在流式输出时频繁重新分词，提升性能
   */
  const tokens = useMemo(() => {
    return tokenizeSentence(sentence.text);
  }, [sentence.text]);

  /**
   * 处理单词点击 (收藏功能)
   * 使用 useCallback 避免不必要的重渲染
   *
   * 设计意图 (Why):
   * - 直接从 data-word 属性获取纯单词，无需二次清理
   * - 使用 useCallback 确保子组件不会因函数引用变化而重渲染
   */
  const handleWordClick = useCallback((event) => {
    const word = event.currentTarget.dataset.word;

    if (word && word.length > 1 && onSaveWord) {
      onSaveWord(word, sentence.text);

      // 视觉反馈
      event.currentTarget.classList.add('word-clicked');
      setTimeout(() => {
        event.currentTarget.classList.remove('word-clicked');
      }, 500);
    }
  }, [onSaveWord, sentence.text]);

  /**
   * 重新思考
   */
  function reset() {
    setRevealLevel(0);
  }

  // 判断分析是否已就绪（预加载或本地缓存）
  const analysisReady = analysis || prefetchedAnalysis;

  return (
    <div className={`sentence-card ${isSpeaking ? 'speaking' : ''}`}>
      {/* 句子文本区域 - 使用智能分词渲染 */}
      <div className="sentence-text">
        {tokens.map((token, index) => {
          if (token.type === 'word') {
            // 单词: 可点击，带 hover 效果
            return (
              <span
                key={index}
                className="word clickable"
                data-word={token.text}
                onClick={handleWordClick}
                title="点击收藏单词"
              >
                {token.text}
              </span>
            );
          } else if (token.type === 'punctuation') {
            // 标点符号: 不可点击，紧贴前一个单词
            return (
              <span key={index} className="punctuation">
                {token.text}
              </span>
            );
          } else if (token.type === 'number') {
            // 数字/金额: 不可点击，保持原样显示
            return (
              <span key={index} className="number">
                {token.text}
              </span>
            );
          } else {
            // 空格
            return <span key={index}>{token.text}</span>;
          }
        })}
      </div>

      {/* 操作按钮 */}
      <div className="sentence-actions">
        {!hideSpeakButton && (
          <button
            className={`btn-speak ${isSpeaking ? 'active' : ''}`}
            onClick={speakSentence}
            title={isSpeaking ? '停止朗读' : '朗读句子'}
          >
            {isSpeaking ? '停' : '读'}
          </button>
        )}

        {revealLevel === 0 && (
          <button
            className={`btn-reveal btn-primary ${analysisReady ? 'ready' : ''}`}
            onClick={revealNext}
            disabled={loading}
          >
            {loading ? '分析中...' : '查看提示'}
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="error-message">
          错误: {error}
          <button onClick={fetchAnalysis}>重试</button>
        </div>
      )}

      {/* 流式输出预览 */}
      {isStreaming && (
        <div className="stream-preview">
          <div className="stream-label">正在生成...</div>
          <pre className="stream-text">{streamText}</pre>
        </div>
      )}

      {/* Level 1: 提示 */}
      {revealLevel >= 1 && (analysis || prefetchedAnalysis) && (
        <div className="analysis-section level-1">
          <div className="section-header">
            <span className="level-badge">Level 1</span>
            <h4>提示</h4>
          </div>
          <div className="section-content hint">
            {(analysis || prefetchedAnalysis).hint}
          </div>
          {revealLevel === 1 && (
            <button
              className="btn-reveal btn-secondary"
              onClick={revealNext}
            >
              查看深度分析
            </button>
          )}
        </div>
      )}

      {/* Level 2: 深度分析 */}
      {revealLevel >= 2 && (analysis || prefetchedAnalysis) && (
        <div className="analysis-section level-2">
          <div className="section-header">
            <span className="level-badge">Level 2</span>
            <h4>深度分析</h4>
          </div>
          <div className="section-content analysis">
            {(analysis || prefetchedAnalysis).analysis.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          {revealLevel === 2 && (
            <button
              className="btn-reveal btn-tertiary"
              onClick={revealNext}
            >
              查看中文翻译
            </button>
          )}
        </div>
      )}

      {/* Level 3: 中文翻译 */}
      {revealLevel >= 3 && (analysis || prefetchedAnalysis) && (
        <div className="analysis-section level-3">
          <div className="section-header">
            <span className="level-badge">Level 3</span>
            <h4>中文翻译</h4>
          </div>
          <div className="section-content translation">
            {(analysis || prefetchedAnalysis).zh}
          </div>
          <button
            className="btn-reset"
            onClick={reset}
          >
            重新思考
          </button>
        </div>
      )}
    </div>
  );
}
