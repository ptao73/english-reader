import { useState, useEffect } from 'react';
import { db } from './db/schema.js';
import ArticleImport from './components/ArticleImport.jsx';
import Reader from './components/Reader.jsx';
import './App.css';

/**
 * 主应用组件
 * 
 * 状态管理:
 * - 文章列表
 * - 当前文章
 * - 视图切换(导入/阅读/列表)
 */
function App() {
  const [view, setView] = useState('import'); // 'import' | 'reading' | 'list'
  const [articles, setArticles] = useState([]);
  const [currentArticle, setCurrentArticle] = useState(null);
  const [loading, setLoading] = useState(true);

  // 启动时加载文章列表
  useEffect(() => {
    loadArticles();
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

      // 如果有文章,默认显示列表;否则显示导入界面
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
      // 删除文章
      await db.articles.delete(articleId);
      
      // 删除相关数据
      await db.progress.delete(articleId);
      await db.sentences.where('docId').equals(articleId).delete();
      
      // 更新列表
      setArticles(prev => prev.filter(a => a.id !== articleId));
      
      // 如果当前正在阅读这篇文章,返回列表
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
      {/* 顶部导航栏 */}
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
          </nav>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="app-main">
        {view === 'import' && (
          <ArticleImport onImported={handleArticleImported} />
        )}

        {view === 'reading' && currentArticle && (
          <div className="reading-view">
            <Reader article={currentArticle} onBack={backToList} />
          </div>
        )}

        {view === 'list' && (
          <ArticleList
            articles={articles}
            onRead={startReading}
            onDelete={deleteArticle}
          />
        )}
      </main>

      {/* 底部信息 */}
      <footer className="app-footer">
        <p>
          ⚡ Powered by React + IndexedDB + Claude AI
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

export default App;
