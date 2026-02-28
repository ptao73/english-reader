import { useState, useEffect, useRef, useCallback } from 'react';
import { DictationEngine } from '../utils/dictation.js';
import Icon from './Icon.jsx';
import './Dictation.css';

/**
 * 精读/听写模式界面
 * @param {Object} props
 * @param {Object} props.article - 文章对象 (含 title, sentences, content)
 * @param {Function} props.onBack - 返回回调
 */
export default function Dictation({ article, onBack }) {
  const engineRef = useRef(null);

  const [state, setState] = useState({
    isPlaying: false,
    currentIndex: 0,
    totalSentences: 0,
    currentRepeatCount: 0,
    maxRepeats: 3,
    currentSentence: '',
    status: '',
  });

  const [showText, setShowText] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [repeats, setRepeats] = useState(3);
  const [interval, setInterval_] = useState(3);

  // 初始化引擎
  useEffect(() => {
    const engine = new DictationEngine();
    engineRef.current = engine;

    engine.onStateChange = (newState) => {
      setState(newState);
    };

    // 加载文章句子
    if (article.sentences && article.sentences.length > 0) {
      engine.loadSentences(article.sentences);
    } else if (article.content) {
      engine.loadText(article.content);
    }

    // 初始通知
    engine._notify('ready');

    return () => {
      engine.stop();
      engine.onStateChange = null;
    };
  }, [article]);

  const handleStart = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (state.isPlaying) {
      engine.stop();
    } else {
      engine.start({ repeats, interval: interval * 1000 });
    }
  }, [state.isPlaying, repeats, interval]);

  const handlePrev = useCallback(() => {
    engineRef.current?.skip(-1);
  }, []);

  const handleNext = useCallback(() => {
    engineRef.current?.skip(1);
  }, []);

  const handleRestart = useCallback(() => {
    engineRef.current?.restartCurrent();
  }, []);

  const handleRepeatsChange = useCallback((delta) => {
    setRepeats(prev => {
      const next = Math.min(5, Math.max(1, prev + delta));
      engineRef.current?.updateConfig({ repeats: next });
      return next;
    });
  }, []);

  const handleIntervalChange = useCallback((delta) => {
    setInterval_(prev => {
      const next = Math.min(10, Math.max(1, prev + delta));
      engineRef.current?.updateConfig({ interval: next * 1000 });
      return next;
    });
  }, []);

  // 状态文本映射
  const statusText = {
    ready: '准备就绪',
    playing: '正在播放',
    waiting: '句间等待...',
    next: '准备下一句...',
    completed: '听写完成',
    stopped: '已停止',
    restarting: '重读当前句',
    skipped_next: '跳至下一句',
    skipped_prev: '跳至上一句',
  };

  const displayStatus = statusText[state.status] || '';
  const isActive = state.isPlaying;

  return (
    <div className="dictation-view">
      {/* 顶部栏 */}
      <div className="dictation-header">
        <div className="dictation-header-row">
          <button className="dictation-back" onClick={onBack}>
            ← 返回
          </button>
          <h1 className="dictation-title">{article.title}</h1>
          <span className="dictation-progress-badge">
            {state.totalSentences > 0
              ? `${state.currentIndex + 1}/${state.totalSentences}`
              : ''}
          </span>
        </div>
      </div>

      {/* 主区域 */}
      <div className="dictation-main">
        {/* 状态 */}
        <div className={`dictation-status ${state.status === 'playing' ? 'playing' : ''}`}>
          {displayStatus}
        </div>

        {/* 重复次数指示器 */}
        <div className="dictation-repeats">
          {Array.from({ length: state.maxRepeats || repeats }, (_, i) => (
            <span
              key={i}
              className={`repeat-dot ${i < state.currentRepeatCount ? 'filled' : ''}`}
            />
          ))}
        </div>

        {/* 句子显示区 */}
        <div className="dictation-sentence-area">
          {showText ? (
            <p className="dictation-sentence-text">
              {state.currentSentence || (article.sentences?.[0]?.text || '—')}
            </p>
          ) : (
            <p className="dictation-sentence-hidden">
              点击下方"显示原文"查看句子
            </p>
          )}
        </div>

        {/* 显示/隐藏切换 */}
        <button className="dictation-btn-toggle" onClick={() => setShowText(!showText)}>
          <Icon name={showText ? 'close' : 'book'} size={16} />
          {showText ? '隐藏原文' : '显示原文'}
        </button>
      </div>

      {/* 控制栏 */}
      <div className="dictation-controls">
        <div className="dictation-controls-row">
          <button
            className="dictation-btn"
            onClick={handlePrev}
            disabled={!isActive}
            title="上一句"
            aria-label="上一句"
          >
            ⏮
          </button>

          <button
            className="dictation-btn"
            onClick={handleRestart}
            disabled={!isActive}
            title="重读"
            aria-label="重读当前句"
          >
            <Icon name="refresh" size={20} />
          </button>

          <button
            className={`dictation-btn dictation-btn-play ${isActive ? 'stop' : ''}`}
            onClick={handleStart}
            title={isActive ? '停止' : '开始'}
            aria-label={isActive ? '停止听写' : '开始听写'}
          >
            {isActive ? '■' : '▶'}
          </button>

          <button
            className="dictation-btn"
            onClick={handleNext}
            disabled={!isActive}
            title="下一句"
            aria-label="下一句"
          >
            ⏭
          </button>
        </div>
      </div>

      {/* 设置区 */}
      <div className="dictation-settings">
        <button
          className="dictation-settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
        >
          {showSettings ? '▼ 收起设置' : '▶ 听写设置'}
        </button>

        {showSettings && (
          <div className="dictation-settings-body">
            <div className="dictation-setting-item">
              <span className="dictation-setting-label">每句重复</span>
              <div className="dictation-setting-control">
                <button onClick={() => handleRepeatsChange(-1)} disabled={repeats <= 1}>−</button>
                <span className="dictation-setting-value">{repeats}</span>
                <button onClick={() => handleRepeatsChange(1)} disabled={repeats >= 5}>+</button>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>次</span>
              </div>
            </div>

            <div className="dictation-setting-item">
              <span className="dictation-setting-label">句间间隔</span>
              <div className="dictation-setting-control">
                <button onClick={() => handleIntervalChange(-1)} disabled={interval <= 1}>−</button>
                <span className="dictation-setting-value">{interval}</span>
                <button onClick={() => handleIntervalChange(1)} disabled={interval >= 10}>+</button>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>秒</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="dictation-safe-bottom" />
    </div>
  );
}
