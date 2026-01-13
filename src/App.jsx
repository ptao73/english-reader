import { useState, useEffect, useRef } from 'react';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { db } from './db/schema.js';
import { parseArticle } from './utils/textParser.js';
import Reader from './components/Reader.jsx';
import './App.css';

// 配置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * 主应用组件
 *
 * 状态管理:
 * - 文章列表
 * - 当前文章
 * - 视图切换(列表/阅读)
 */
function App() {
  const [view, setView] = useState('list'); // 'reading' | 'list'
  const [articles, setArticles] = useState([]);
  const [currentArticle, setCurrentArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

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
    } catch (err) {
      console.error('加载文章失败:', err);
    } finally {
      setLoading(false);
    }
  }

  /**
   * 处理文件上传并自动开始阅读
   */
  async function handleFileUpload(file) {
    if (!file) return;

    setError(null);
    setImporting(true);

    try {
      const ext = file.name.split('.').pop().toLowerCase();

      if (!['txt', 'doc', 'docx', 'pdf'].includes(ext)) {
        setError('支持的文件格式: .txt, .docx, .pdf');
        setImporting(false);
        return;
      }

      let text = '';

      if (ext === 'txt') {
        text = await file.text();
      } else if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;

        if (!text.trim()) {
          setError('DOCX文件内容为空或无法解析');
          setImporting(false);
          return;
        }
      } else if (ext === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          fullText += pageText + '\n';
        }

        text = fullText.trim();

        if (!text) {
          setError('PDF文件内容为空或无法解析（可能是扫描版PDF）');
          setImporting(false);
          return;
        }
      } else if (ext === 'doc') {
        setError('旧版.doc格式暂不支持，请用Word打开后另存为.docx格式');
        setImporting(false);
        return;
      }

      // 使用文件名作为标题
      const title = file.name.replace(/\.(txt|doc|docx|pdf)$/i, '');

      // 解析文章并保存
      const article = parseArticle(title.trim(), text.trim());
      await db.articles.add(article);
      await db.progress.put({
        docId: article.id,
        currentSentenceId: article.sentences[0].sentenceId,
        percentage: 0,
        lastReadAt: new Date().toISOString()
      });

      // 更新列表并自动开始阅读
      setArticles(prev => [article, ...prev]);
      setCurrentArticle(article);
      setView('reading');
    } catch (err) {
      console.error('导入失败:', err);
      setError('导入失败: ' + err.message);
    } finally {
      setImporting(false);
      // 重置文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.doc,.docx,.pdf"
        onChange={e => handleFileUpload(e.target.files[0])}
        style={{ display: 'none' }}
      />

      {/* 顶部导航栏 */}
      <header className="app-header">
        <div className="header-content">
          <h1 className="logo">📖 English Reader</h1>
          <nav className="nav">
            <button
              className={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
            >
              文章列表
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? '导入中...' : '导入文件'}
            </button>
          </nav>
        </div>
      </header>

      {/* 错误提示 */}
      {error && (
        <div className="app-error">
          ❌ {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* 主内容区 */}
      <main className="app-main">
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
        <p>点击右上角"导入文件"开始学习吧!</p>
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
