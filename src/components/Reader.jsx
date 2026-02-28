import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../db/schema.js';
import { tts } from '../utils/tts.js';
import { getSentenceAnalysis, getWordAnalysis } from '../utils/ai.js';
import { recordActivity } from '../utils/statistics.js';
import { initializeWordSM2 } from '../utils/spacedRepetition.js';
import { preCacheArticle, getArticleCacheProgress } from '../utils/preCache.js';
import SentenceCard from './SentenceCard.jsx';
import Icon from './Icon.jsx';
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
 * 6. 预加载分析缓存
 */
export default function Reader({ article, onBack, onDictation }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(null);
  const [isProgressLoaded, setIsProgressLoaded] = useState(false);

  // 预加载缓存状态
  const [analysisCache, setAnalysisCache] = useState({});
  const [isPrefetching, setIsPrefetching] = useState(false);
  const prefetchingIdRef = useRef(null);

  // 保存单词状态
  const [savingWord, setSavingWord] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);

  // 单词详情弹窗
  const [wordDetail, setWordDetail] = useState(null);

  // 后台预缓存
  const [preCacheStatus, setPreCacheStatus] = useState(null);
  const preCacheAbortRef = useRef(null);

  // 加载阅读进度
  useEffect(() => {
    loadProgress();
  }, [article.id]);

  // 当进度加载完成且 currentIndex 变化时，预加载分析
  useEffect(() => {
    if (isProgressLoaded) {
      prefetchAnalysis(currentIndex);
      saveProgress();
    }
  }, [currentIndex, isProgressLoaded]);

  // 打开文章时，检查并启动后台预缓存
  useEffect(() => {
    if (!isProgressLoaded) return;

    let cancelled = false;

    (async () => {
      const progress = await getArticleCacheProgress(article);
      if (cancelled) return;

      if (progress.cached < progress.total) {
        setPreCacheStatus(progress);

        preCacheAbortRef.current?.abort();
        const controller = new AbortController();
        preCacheAbortRef.current = controller;

        await preCacheArticle(article, {
          signal: controller.signal,
          startFrom: currentIndex,
          onProgress: (p) => {
            if (!cancelled) setPreCacheStatus(p);
          }
        }).catch(() => {});
      } else {
        setPreCacheStatus(progress);
      }
    })();

    return () => {
      cancelled = true;
      preCacheAbortRef.current?.abort();
    };
  }, [article.id, isProgressLoaded]);

  /**
   * 预加载指定句子的分析
   */
  async function prefetchAnalysis(index) {
    const sentence = article.sentences[index];
    if (!sentence) return;

    const sentenceId = sentence.sentenceId;

    // 如果已经缓存了，不重复加载
    if (analysisCache[sentenceId]) {
      console.log('✅ 已有缓存，跳过预加载:', sentenceId);
      return;
    }

    setIsPrefetching(true);
    prefetchingIdRef.current = sentenceId;

    try {
      console.log('🔄 开始预加载分析:', sentenceId);
      const result = await getSentenceAnalysis(sentenceId, sentence.text);

      // 确保是当前句子的结果
      if (prefetchingIdRef.current === sentenceId) {
        setAnalysisCache(prev => ({
          ...prev,
          [sentenceId]: result
        }));
        console.log('✅ 预加载完成并缓存:', sentenceId);
      }
    } catch (err) {
      console.error('❌ 预加载失败:', sentenceId, err.message);
    } finally {
      if (prefetchingIdRef.current === sentenceId) {
        setIsPrefetching(false);
      }
    }
  }

  /**
   * 加载阅读进度
   */
  async function loadProgress() {
    try {
      const saved = await db.progress.get(article.id);
      if (saved) {
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
    } finally {
      setIsProgressLoaded(true);
    }
  }

  /**
   * 保存阅读进度
   */
  async function saveProgress() {
    try {
      const currentSentence = article.sentences[currentIndex];
      if (!currentSentence) return;

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
   * 保存单词到词汇表
   * @param {string} word - 单词
   * @param {string} context - 上下文句子
   */
  async function saveWord(word, context) {
    const cleanWord = word.toLowerCase().trim();

    // 检查是否已存在
    const existing = await db.vocabulary
      .where('word')
      .equals(cleanWord)
      .first();

    if (existing) {
      // 已存在，直接显示已有的单词详情
      setWordDetail({ ...existing, isNew: false });
      return;
    }

    setSavingWord(cleanWord);

    try {
      // 调用AI获取单词分析
      const analysis = await getWordAnalysis(word, context);

      // 构建单词对象并初始化SM-2参数
      const wordData = initializeWordSM2({
        word: cleanWord,
        originalWord: word,
        phonetic: analysis.phonetic,
        meanings: analysis.meanings,
        etymology: analysis.etymology,
        examples: analysis.examples,
        collocations: analysis.collocations,
        synonyms: analysis.synonyms,
        context: context,
        contextMeaning: analysis.contextMeaning,
        articleId: article.id,
        articleTitle: article.title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // 写入词汇表
      await db.vocabulary.add(wordData);

      // 记录统计: 收集单词
      await recordActivity('word_collected');

      // 显示单词详情弹窗
      setWordDetail({ ...wordData, isNew: true });
      console.log('✅ 单词已保存:', cleanWord);
    } catch (err) {
      console.error('保存单词失败:', err);
      alert('保存失败: ' + err.message);
    } finally {
      setSavingWord(null);
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

  // 获取当前句子的缓存分析
  const currentCachedAnalysis = currentSentence
    ? analysisCache[currentSentence.sentenceId]
    : null;

  return (
    <div className="reader">
      {/* 保存单词状态提示 */}
      {savingWord && (
        <div className="word-save-toast saving">
          正在分析: {savingWord}...
        </div>
      )}

      {/* 单词详情弹窗 */}
      {wordDetail && (
        <div className="word-popup-overlay" onClick={() => setWordDetail(null)}>
          <div className="word-popup" onClick={e => e.stopPropagation()}>
            <div className="word-popup-header">
              <div className="word-popup-title">
                <h3>{wordDetail.originalWord || wordDetail.word}</h3>
                {wordDetail.phonetic && (
                  <span className="word-popup-phonetic">{wordDetail.phonetic}</span>
                )}
              </div>
              <span className={`word-popup-badge ${wordDetail.isNew ? 'new' : 'exists'}`}>
                {wordDetail.isNew ? '已收藏' : '已在词汇表'}
              </span>
            </div>

            {wordDetail.contextMeaning && (
              <div className="word-popup-context-meaning">
                {wordDetail.contextMeaning}
              </div>
            )}

            {wordDetail.meanings && wordDetail.meanings.length > 0 && (
              <div className="word-popup-meanings">
                {wordDetail.meanings.map((m, i) => (
                  <div key={i} className="word-popup-meaning">
                    <span className="word-popup-pos">{m.pos}</span>
                    <span className="word-popup-def">{m.def}</span>
                  </div>
                ))}
              </div>
            )}

            {wordDetail.collocations && wordDetail.collocations.length > 0 && (
              <div className="word-popup-collocations">
                <span className="word-popup-label">搭配</span>
                <span>{wordDetail.collocations.join(' / ')}</span>
              </div>
            )}

            <button className="word-popup-close" onClick={() => setWordDetail(null)}>
              知道了
            </button>
          </div>
        </div>
      )}

      {/* 顶部工具栏 */}
      <div className="reader-toolbar">
        <button className="btn-back" onClick={onBack}>
          ← 返回列表
        </button>
        <div className="toolbar-controls">
          <button
            className="btn-speak-main"
            onClick={speakCurrentSentence}
            title={isSpeaking ? '停止朗读' : '朗读当前句子'}
          >
            {isSpeaking ? '■ 停止' : '▶ 朗读'}
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
          {onDictation && (
            <button
              className="btn-control btn-dictation-entry"
              onClick={onDictation}
              title="精读模式"
              aria-label="精读模式"
            >
              <Icon name="headphones" size={18} />
            </button>
          )}
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
          {preCacheStatus && preCacheStatus.cached < preCacheStatus.total && (
            <>
              <span>•</span>
              <span className="prefetch-status">翻译中 {preCacheStatus.cached}/{preCacheStatus.total}</span>
            </>
          )}
          {preCacheStatus && preCacheStatus.cached >= preCacheStatus.total && (
            <>
              <span>•</span>
              <span className="prefetch-ready">翻译已就绪</span>
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
        {currentSentence && (
          <SentenceCard
            key={currentSentence.sentenceId}
            sentence={currentSentence}
            prefetchedAnalysis={currentCachedAnalysis}
            onSaveWord={saveWord}
            onNext={!isLast ? goToNext : null}
            onPrevious={!isFirst ? goToPrevious : null}
            hideSpeakButton={true}
          />
        )}
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
        {isExpanded ? '隐藏句子列表' : '显示全部句子'}
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
