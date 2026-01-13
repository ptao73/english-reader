import { useState, useEffect, useRef } from 'react';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { db } from './db/schema.js';
import { parseArticle } from './utils/textParser.js';
import Reader from './components/Reader.jsx';
import VocabularyList from './components/VocabularyList.jsx';
import './App.css';

// 配置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * 主应用组件
 */
function App() {
  const [view, setView] = useState('list');
  const [articles, setArticles] = useState([]);
  const [currentArticle, setCurrentArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  // 粘贴弹窗状态
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const fileInputRef = useRef(null);

  useEffect(() => {
    loadArticles();
  }, []);

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
   * 点击"导入文件"按钮
   */
  function handleImportClick() {
    if (showPasteModal) {
      // 弹窗已打开，直接打开文件选择器
      fileInputRef.current?.click();
    } else {
      // 弹窗未打开，显示粘贴弹窗
      setShowPasteModal(true);
      setPasteText('');
      setError(null);
    }
  }

  /**
   * 自动生成标题
   */
  function generateTitle(text) {
    const firstLine = text.split('\n')[0].trim();
    if (firstLine.length >= 5 && firstLine.length <= 100) {
      return firstLine.substring(0, 50);
    }
    return 'Article ' + new Date().toLocaleDateString();
  }

  /**
   * 处理粘贴文本导入
   */
  async function handlePasteImport() {
    if (!pasteText.trim()) {
      setError('请粘贴文章内容');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const title = generateTitle(pasteText);
      const article = parseArticle(title.trim(), pasteText.trim());

      await db.articles.add(article);
      await db.progress.put({
        docId: article.id,
        currentSentenceId: article.sentences[0].sentenceId,
        percentage: 0,
        lastReadAt: new Date().toISOString()
      });

      setArticles(prev => [article, ...prev]);
      setCurrentArticle(article);
      setView('reading');
      setShowPasteModal(false);
      setPasteText('');
    } catch (err) {
      console.error('导入失败:', err);
      setError('导入失败: ' + err.message);
    } finally {
      setImporting(false);
    }
  }

  /**
   * 处理文件上传
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

      const title = file.name.replace(/\.(txt|doc|docx|pdf)$/i, '');
      const article = parseArticle(title.trim(), text.trim());

      await db.articles.add(article);
      await db.progress.put({
        docId: article.id,
        currentSentenceId: article.sentences[0].sentenceId,
        percentage: 0,
        lastReadAt: new Date().toISOString()
      });

      setArticles(prev => [article, ...prev]);
      setCurrentArticle(article);
      setView('reading');
      setShowPasteModal(false);
      setPasteText('');
    } catch (err) {
      console.error('导入失败:', err);
      setError('导入失败: ' + err.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function startReading(article) {
    setCurrentArticle(article);
    setView('reading');
  }

  function backToList() {
    setCurrentArticle(null);
    setView('list');
  }

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

  function closePasteModal() {
    setShowPasteModal(false);
    setPasteText('');
    setError(null);
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
              className={view === 'list' && !showPasteModal ? 'active' : ''}
              onClick={() => { setView('list'); closePasteModal(); }}
            >
              文章列表
            </button>
            <button
              className={view === 'vocabulary' ? 'active' : ''}
              onClick={() => { setView('vocabulary'); closePasteModal(); }}
            >
              📚 词汇表
            </button>
            <button
              className={showPasteModal ? 'active' : ''}
              onClick={handleImportClick}
              disabled={importing}
            >
              {importing ? '导入中...' : '导入文件'}
            </button>
          </nav>
        </div>
      </header>

      {/* 粘贴弹窗 */}
      {showPasteModal && (
        <div className="paste-modal-overlay" onClick={closePasteModal}>
          <div className="paste-modal" onClick={e => e.stopPropagation()}>
            <div className="paste-modal-header">
              <h2>📝 粘贴文章</h2>
              <button className="btn-close" onClick={closePasteModal}>✕</button>
            </div>

            {error && (
              <div className="paste-error">
                ❌ {error}
              </div>
            )}

            <textarea
              className="paste-textarea"
              placeholder={'在此粘贴英文文章内容...\n\n或点击下方【选择文件】按钮'}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              disabled={importing}
              rows={12}
            />

            <div className="paste-modal-footer">
              <span className="hint">
                {pasteText.trim() ? `${pasteText.split(/\s+/).filter(w => w).length} 个单词` : '支持粘贴或选择 .txt/.docx/.pdf 文件'}
              </span>
              <div className="footer-buttons">
                <button
                  className="btn-select-file"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  📁 选择文件
                </button>
                <button
                  className="btn-start-reading"
                  onClick={handlePasteImport}
                  disabled={importing || !pasteText.trim()}
                >
                  {importing ? '导入中...' : '🚀 开始阅读'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 错误提示（非弹窗状态） */}
      {error && !showPasteModal && (
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

        {view === 'vocabulary' && (
          <VocabularyList onBack={() => setView('list')} />
        )}
      </main>

      {/* 底部信息 */}
      <footer className="app-footer">
        <p>⚡ Powered by React + IndexedDB + Claude AI</p>
        <p className="tip">💡 反直觉学习法:先思考,再揭示答案</p>
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
