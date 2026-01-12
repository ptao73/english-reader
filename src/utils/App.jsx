import { useState, useEffect } from 'react';
import { db } from './db/schema.js';
import ArticleImport from './components/ArticleImport.jsx';
import Reader from './components/Reader.jsx';
import { getSentenceAnalysisStream } from './utils/ai.js';
import { tts } from './utils/tts.js';
import './App.css';

/**
 * 主应用组件 - 优化版
 * 
 * 新增功能:
 * - Stream 流式输出
 * - 朗读高亮显示
 * - 收藏单字预备
 */
function App() {
  const [view, setView] = useState('import');
  const [articles, setArticles] = useState([]);
  const [currentArticle, setCurrentArticle] = useState(null);
  const [loading, setLoading] = useState(true);

  // ⭐ 新增: 收藏的单词列表 (预备接入 IndexedDB)
  const [savedWords, setSavedWords] = useState([]);

  useEffect(() => {
    loadArticles();
    loadSavedWords(); // 加载收藏的单词
  }, []);

  /**
   * 加载所有文章
   */
  async function loadArticles() {
    setLoading(true);
    try {
      const allArticles = await db.articles
        .orderBy('updatedAt')
        .reverse()
        .toArray();
      
      setArticles(allArticles);

      if (allArticles.length > 0) {
        setView('list');
      }
    } catch (err) {
      console.error('加载文章失败:', err);
    } finally {
      setLoading(false);
    }
  }

  /**
   * ⭐ 加载收藏的单词 (预备功能)
   */
  async function loadSavedWords() {
    try {
      // TODO: 接入 IndexedDB
      // const words = await db.vocabulary.toArray();
      // setSavedWords(words);
      
      // 暂时从 localStorage 读取
      const stored = localStorage.getItem('savedWords');
      if (stored) {
        setSavedWords(JSON.parse(stored));
      }
    } catch (err) {
      console.error('加载单词失败:', err);
    }
  }

  /**
   * ⭐ 收藏单词 (预备功能)
   * @param {string} word - 单词
   * @param {string} context - 上下文句子
   */
  function saveWord(word, context) {
    console.log('📌 收藏单词:', word);
    console.log('📝 上下文:', context);
    
    const wordData = {
      word: word.toLowerCase(),
      context,
      savedAt: new Date().toISOString(),
      reviewCount: 0,
      mastered: false
    };

    // 暂时存到 state 和 localStorage
    const newWords = [...savedWords, wordData];
    setSavedWords(newWords);
    localStorage.setItem('savedWords', JSON.stringify(newWords));

    console.log('✅ 单词已收藏');
    console.log('💡 未来集成方案:');
    console.log('   1. 创建 IndexedDB 表: vocabulary');
    console.log('   2. Schema: { word, context, savedAt, reviewCount, mastered }');
    console.log('   3. 调用: await db.vocabulary.add(wordData)');
    console.log('   4. 实现 SM-2 复习算法');
    
    // TODO: 接入 IndexedDB
    // await db.vocabulary.add(wordData);
  }

  /**
   * 处理文章导入完成
   */
  function handleArticleImported(article) {
    setCurrentArticle(article);
    setArticles(prev => [article, ...prev]);
    setView('reading');
  }

  /**
   * 开始阅读某篇文章
   */
  function startReading(article) {
    setCurrentArticle(article);
    setView('reading');
  }

  /**
   * 返回列表
   */
  function backToList() {
    setCurrentArticle(null);
    setView('list');
  }

  /**
   * 删除文章
   */
  async function deleteArticle(articleId) {
    if (!confirm('确定要删除这篇文章吗?')) return;

    try {
      await db.articles.delete(articleId);
      await db.progress.delete(articleId);
      await db.sentences.where('docId').equals(articleId).delete();
      
      setArticles(prev => prev.filter(a => a.id !== articleId));
      
      if (currentArticle?.id === articleId) {
        backToList();
      }
    } catch (err) {
      console.error('删除失败:', err);
      alert('删除失败:' + err.message);
    }
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1 className="logo">📖 English Reader</h1>
          <nav className="nav">
            <button
              className={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
              disabled={articles.length === 0}
            >
              文章列表
            </button>
            <button
              className={view === 'import' ? 'active' : ''}
              onClick={() => setView('import')}
            >
              导入文章
            </button>
            {/* ⭐ 新增: 生字本入口 (预备) */}
            <button
              className={view === 'vocabulary' ? 'active' : ''}
              onClick={() => setView('vocabulary')}
              disabled={savedWords.length === 0}
            >
              生字本 ({savedWords.length})
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {view === 'import' && (
          <ArticleImport onImported={handleArticleImported} />
        )}

        {view === 'reading' && currentArticle && (
          <div className="reading-view">
            <button className="btn-back" onClick={backToList}>
              ← 返回列表
            </button>
            {/* ⭐ 传递 saveWord 回调 */}
            <Reader 
              article={currentArticle} 
              onSaveWord={saveWord}
            />
          </div>
        )}

        {view === 'list' && (
          <ArticleList
            articles={articles}
            onRead={startReading}
            onDelete={deleteArticle}
          />
        )}

        {/* ⭐ 新增: 生字本视图 (预备) */}
        {view === 'vocabulary' && (
          <VocabularyView 
            words={savedWords}
            onRemove={(word) => {
              const newWords = savedWords.filter(w => w.word !== word);
              setSavedWords(newWords);
              localStorage.setItem('savedWords', JSON.stringify(newWords));
            }}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>
          ⚡ Powered by React + IndexedDB + Qwen AI
        </p>
        <p className="tip">
          💡 反直觉学习法:先思考,再揭示答案
        </p>
      </footer>
    </div>
  );
}

/**
 * 文章列表组件
 */
function ArticleList({ articles, onRead, onDelete }) {
  const [progressMap, setProgressMap] = useState({});

  useEffect(() => {
    loadAllProgress();
  }, [articles]);

  async function loadAllProgress() {
    const map = {};
    for (const article of articles) {
      const progress = await db.progress.get(article.id);
      if (progress) {
        map[article.id] = progress;
      }
    }
    setProgressMap(map);
  }

  if (articles.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📚</div>
        <h2>还没有文章</h2>
        <p>导入你的第一篇英文文章开始学习吧!</p>
      </div>
    );
  }

  return (
    <div className="article-list">
      <div className="list-header">
        <h2>📚 我的文章</h2>
        <span className="count">{articles.length} 篇</span>
      </div>

      <div className="list-grid">
        {articles.map(article => {
          const progress = progressMap[article.id];
          return (
            <div key={article.id} className="article-card">
              <div className="card-header">
                <h3>{article.title}</h3>
                <button
                  className="btn-delete"
                  onClick={() => onDelete(article.id)}
                  title="删除"
                >
                  🗑
                </button>
              </div>

              <div className="card-meta">
                <span>📝 {article.totalSentences} 句</span>
                <span>•</span>
                <span>📅 {new Date(article.createdAt).toLocaleDateString()}</span>
              </div>

              {progress && (
                <div className="card-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                  <span className="progress-text">
                    {progress.percentage}% 已完成
                  </span>
                </div>
              )}

              <button
                className="btn-read"
                onClick={() => onRead(article)}
              >
                {progress?.percentage > 0 ? '📖 继续阅读' : '🚀 开始阅读'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ⭐ 生字本视图 (预备组件)
 */
function VocabularyView({ words, onRemove }) {
  return (
    <div className="vocabulary-view">
      <div className="vocab-header">
        <h2>📚 我的生字本</h2>
        <span className="count">{words.length} 个单词</span>
      </div>

      <div className="vocab-list">
        {words.map((item, index) => (
          <div key={index} className="vocab-card">
            <div className="vocab-word">{item.word}</div>
            <div className="vocab-context">"{item.context}"</div>
            <div className="vocab-meta">
              <span>📅 {new Date(item.savedAt).toLocaleDateString()}</span>
              <button 
                className="btn-remove"
                onClick={() => onRemove(item.word)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="vocab-tips">
        <h3>💡 接下来的功能:</h3>
        <ul>
          <li>✅ 单词收藏功能 (已实现)</li>
          <li>🔄 接入 IndexedDB 持久化存储</li>
          <li>🔄 SM-2 记忆曲线复习算法</li>
          <li>🔄 单词卡片翻转效果</li>
          <li>🔄 词根词缀分析</li>
          <li>🔄 例句收集与朗读</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
