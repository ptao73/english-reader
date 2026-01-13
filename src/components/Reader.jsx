import { useState, useEffect } from 'react';
import { db } from '../db/schema.js';
import { tts } from '../utils/tts.js';
import SentenceCard from './SentenceCard.jsx';
import './Reader.css';

/**
 * 阅读器组件
 *
 * 功能:
 * 1. 显示文章句子
 * 2. 导航控制(上一句/下一句)
 * 3. 进度保存与恢复
 * 4. 统计信息
 * 5. 朗读控制
 */
export default function Reader({ article, onBack }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    loadProgress();
  }, [article.id]);

  useEffect(() => {
    saveProgress();
  }, [currentIndex]);

  /**
   * 加载阅读进度
   */
  async function loadProgress() {
    try {
      const saved = await db.progress.get(article.id);
      if (saved) {
        // 找到对应句子的索引
        const index = article.sentences.findIndex(
          s => s.sentenceId === saved.currentSentenceId
        );
        if (index !== -1) {
          setCurrentIndex(index);
        }
        setProgress(saved);
      }
    } catch (err) {
      console.error('加载进度失败:', err);
    }
  }

  /**
   * 保存阅读进度
   */
  async function saveProgress() {
    try {
      const currentSentence = article.sentences[currentIndex];
      const percentage = Math.round((currentIndex / article.sentences.length) * 100);

      await db.progress.put({
        docId: article.id,
        currentSentenceId: currentSentence.sentenceId,
        percentage,
        lastReadAt: new Date().toISOString()
      });

      setProgress({
        docId: article.id,
        currentSentenceId: currentSentence.sentenceId,
        percentage,
        lastReadAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('保存进度失败:', err);
    }
  }

  /**
   * 导航:下一句
   */
  function goToNext() {
    if (currentIndex < article.sentences.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }

  /**
   * 导航:上一句
   */
  function goToPrevious() {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }

  /**
   * 跳转到指定句子
   */
  function jumpToSentence(index) {
    if (index >= 0 && index < article.sentences.length) {
      setCurrentIndex(index);
    }
  }

  /**
   * 朗读当前句子
   */
  async function speakCurrentSentence() {
    const currentSentence = article.sentences[currentIndex];
    if (!currentSentence) return;

    if (isSpeaking) {
      tts.stop();
      setIsSpeaking(false);
      return;
    }

    try {
      await tts.speak(currentSentence.text, {
        rate: 0.85,
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false)
      });
    } catch (err) {
      console.error('朗读失败:', err);
      setIsSpeaking(false);
    }
  }

  const currentSentence = article.sentences[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === article.sentences.length - 1;

  return (
    <div className="reader">
      {/* 顶部工具栏 */}
      <div className="reader-toolbar">
        <button className="btn-back" onClick={onBack}>
          ← 返回列表
        </button>
        <div className="toolbar-controls">
          <button
            className={`btn-control btn-speak ${isSpeaking ? 'active' : ''}`}
            onClick={speakCurrentSentence}
            title={isSpeaking ? '停止' : '朗读'}
          >
            {isSpeaking ? '■' : '♪'}
          </button>
          <button
            className="btn-control"
            onClick={goToPrevious}
            disabled={isFirst}
            title="上一句"
          >
            ◀
          </button>
          <button
            className="btn-control"
            onClick={goToNext}
            disabled={isLast}
            title="下一句"
          >
            ▶
          </button>
        </div>
      </div>

      {/* 文章头部 */}
      <div className="reader-header">
        <h1>{article.title}</h1>
        <div className="meta">
          <span>第 {currentIndex + 1} / {article.sentences.length} 句</span>
          {progress && (
            <>
              <span>•</span>
              <span>进度: {progress.percentage}%</span>
            </>
          )}
        </div>
      </div>

      {/* 进度条 */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${((currentIndex + 1) / article.sentences.length) * 100}%` }}
        />
      </div>

      {/* 句子卡片 */}
      <div className="reader-content">
        <SentenceCard
          sentence={currentSentence}
          onNext={!isLast ? goToNext : null}
          onPrevious={!isFirst ? goToPrevious : null}
          hideSpeakButton={true}
        />
      </div>

      {/* 句子列表(可选:折叠/展开) */}
      <SentenceList
        sentences={article.sentences}
        currentIndex={currentIndex}
        onSelectSentence={jumpToSentence}
      />
    </div>
  );
}

/**
 * 句子列表组件(可折叠)
 */
function SentenceList({ sentences, currentIndex, onSelectSentence }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="sentence-list">
      <button 
        className="toggle-list"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? '📖 隐藏句子列表' : '📋 显示全部句子'}
      </button>

      {isExpanded && (
        <div className="list-content">
          {sentences.map((sentence, index) => (
            <div
              key={sentence.sentenceId}
              className={`list-item ${index === currentIndex ? 'active' : ''}`}
              onClick={() => onSelectSentence(index)}
            >
              <span className="index">{index + 1}</span>
              <span className="text">{sentence.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
