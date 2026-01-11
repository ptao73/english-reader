import { useState, useEffect } from 'react';
import { db } from '../db/schema.js';
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
 */
export default function Reader({ article }) {
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

  const currentSentence = article.sentences[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === article.sentences.length - 1;

  return (
    <div className="reader">
      {/* 文章头部 */}
      <div className="reader-header">
        <h1>{article.title}</h1>
        <div className="meta">
          <span>共 {article.sentences.length} 句</span>
          <span>•</span>
          <span>当前: 第 {currentIndex + 1} 句</span>
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
        />
      </div>

      {/* 快速导航 */}
      <div className="quick-nav">
        <button 
          onClick={() => jumpToSentence(0)}
          disabled={isFirst}
        >
          ⏮ 第一句
        </button>
        <button 
          onClick={() => jumpToSentence(article.sentences.length - 1)}
          disabled={isLast}
        >
          最后一句 ⏭
        </button>
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
