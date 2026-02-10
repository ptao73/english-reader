import { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react';
import { db } from './db/schema.js';
import { parseArticle } from './utils/textParser.js';
import { tts, loadTTSSettings } from './utils/tts.js';
import { recordActivity } from './utils/statistics.js';
import { getAiModelPreference, setAiModelPreference } from './utils/ai.js';
import { fetchModelStatus } from './utils/modelStatus.js';
import { isGitHubConfigured, syncArticles, getArticlesSyncStatus } from './utils/github.js';
import { preCacheArticle } from './utils/preCache.js';
import Reader from './components/Reader.jsx';
import Icon from './components/Icon.jsx';
import './App.css';

// 懒加载非首屏组件
const VocabularyList = lazy(() => import('./components/VocabularyList.jsx'));
const Statistics = lazy(() => import('./components/Statistics.jsx'));

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
  const [articlesSyncStatus, setArticlesSyncStatus] = useState(null);
  const [aiModel, setAiModel] = useState('qwen');

  // 粘贴弹窗状态
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [urlDetected, setUrlDetected] = useState(false);

  const fileInputRef = useRef(null);
  const syncInFlightRef = useRef(false);

  // 预缓存状态: { [articleId]: { cached, total } }
  const [preCacheProgress, setPreCacheProgress] = useState({});
  const preCacheAbortRef = useRef(null);

  const startPreCache = useCallback((article) => {
    // 取消上一个预缓存任务
    preCacheAbortRef.current?.abort();
    const controller = new AbortController();
    preCacheAbortRef.current = controller;

    preCacheArticle(article, {
      signal: controller.signal,
      onProgress: ({ cached, total }) => {
        setPreCacheProgress(prev => ({
          ...prev,
          [article.id]: { cached, total }
        }));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadArticles();
    initializeTTSSettings();
    runArticleSync({ silent: true });
    refreshArticlesSyncStatus();
    loadAiModel();
  }, []);

  async function loadAiModel() {
    try {
      const model = await getAiModelPreference();
      setAiModel(model);
    } catch (err) {
      console.error('加载模型偏好失败:', err);
    }
  }

  // 初始化TTS设置
  async function initializeTTSSettings() {
    try {
      const settings = await loadTTSSettings();
      tts.applySettings(settings);
      console.log('TTS设置已初始化');
    } catch (err) {
      console.error('初始化TTS设置失败:', err);
    }
  }

  async function loadDeletedArticles() {
    const record = await db.settings.get('deletedArticles');
    return Array.isArray(record?.value) ? record.value : [];
  }

  async function saveDeletedArticles(list) {
    await db.settings.put({ key: 'deletedArticles', value: list });
  }

  async function addDeletedArticle(docId) {
    const deleted = await loadDeletedArticles();
    const now = new Date().toISOString();
    const existing = deleted.find(item => item.docId === docId);
    if (existing) {
      existing.deletedAt = now;
    } else {
      deleted.push({ docId, deletedAt: now });
    }
    await saveDeletedArticles(deleted);
    return now;
  }

  async function runArticleSync({ silent = false } = {}) {
    if (!(await isGitHubConfigured())) return;
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;

    try {
      const [localArticles, localProgress, localRevealState, deleted] = await Promise.all([
        db.articles.toArray(),
        db.progress.toArray(),
        db.revealState.toArray(),
        loadDeletedArticles()
      ]);

      const result = await syncArticles(
        localArticles,
        localProgress,
        localRevealState,
        deleted,
        null
      );

      // 应用删除
      for (const docId of result.deletedToApply || []) {
        await db.articles.delete(docId);
        await db.progress.delete(docId);
        await db.sentences.where('docId').equals(docId).delete();
        await db.revealState.where('sentenceId').startsWith(`${docId}:`).delete();
      }

      // 写入新增/更新数据
      for (const article of result.newToLocal.articles || []) {
        await db.articles.put(article);
      }
      for (const progress of result.newToLocal.progress || []) {
        await db.progress.put(progress);
      }
      for (const reveal of result.newToLocal.revealState || []) {
        await db.revealState.put(reveal);
      }

      if (Array.isArray(result.deleted)) {
        await saveDeletedArticles(result.deleted);
      }

      await loadArticles();
      await refreshArticlesSyncStatus();
    } catch (err) {
      console.error('文章同步失败:', err);
      if (!silent) {
        alert('文章同步失败: ' + err.message);
      }
    } finally {
      syncInFlightRef.current = false;
    }
  }

  async function refreshArticlesSyncStatus() {
    if (!(await isGitHubConfigured())) {
      setArticlesSyncStatus({ configured: false });
      return;
    }
    try {
      const status = await getArticlesSyncStatus();
      setArticlesSyncStatus(status);
    } catch (err) {
      console.error('获取文章同步状态失败:', err);
      setArticlesSyncStatus({ configured: true, error: err.message });
    }
  }

  async function loadArticles() {
    setLoading(true);
    try {
      const [allArticles, deleted] = await Promise.all([
        db.articles.orderBy('updatedAt').reverse().toArray(),
        loadDeletedArticles()
      ]);
      const deletedIds = new Set((deleted || []).map(item => item.docId));
      setArticles(allArticles.filter(article => !deletedIds.has(article.id)));
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
      setUrlDetected(false);
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

  function isUrlLike(text) {
    const t = text.trim();
    if (!t || t.includes(' ')) return false;
    return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(t);
  }

  async function extractFromUrl(url) {
    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || '抓取失败');
    }
    return data;
  }

  function downloadTextFile(title, content) {
    const safeTitle = (title || 'article')
      .replace(/[\\\\/:*?\"<>|]+/g, '')
      .trim()
      .slice(0, 80) || 'article';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function importArticleFromText(title, content) {
    const article = parseArticle(title.trim(), content.trim());

    await db.articles.add(article);
    await db.progress.put({
      docId: article.id,
      currentSentenceId: article.sentences[0].sentenceId,
      percentage: 0,
      lastReadAt: new Date().toISOString()
    });

    await recordActivity('article_imported');

    setArticles(prev => [article, ...prev]);
    setCurrentArticle(article);
    setView('reading');
    setShowPasteModal(false);
    setPasteText('');
    setUrlDetected(false);
    runArticleSync({ silent: true });
    refreshArticlesSyncStatus();

    // 后台预缓存所有句子翻译
    startPreCache(article);
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
      if (isUrlLike(pasteText)) {
        const { title, content } = await extractFromUrl(pasteText.trim());
        downloadTextFile(title, content);
        await importArticleFromText(title || generateTitle(content), content);
        return;
      }

      const title = generateTitle(pasteText);
      await importArticleFromText(title, pasteText);
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
        const mammoth = await import('mammoth');
        const result = await mammoth.default.extractRawText({ arrayBuffer });
        text = result.value;

        if (!text.trim()) {
          setError('DOCX文件内容为空或无法解析');
          setImporting(false);
          return;
        }
      } else if (ext === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
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

      // 记录统计: 导入文章
      await recordActivity('article_imported');

      setArticles(prev => [article, ...prev]);
      setCurrentArticle(article);
      setView('reading');
      setShowPasteModal(false);
      setPasteText('');
      runArticleSync({ silent: true });
      refreshArticlesSyncStatus();

      // 后台预缓存所有句子翻译
      startPreCache(article);
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
      await addDeletedArticle(articleId);
      await db.articles.delete(articleId);
      await db.progress.delete(articleId);
      await db.sentences.where('docId').equals(articleId).delete();
      await db.revealState.where('sentenceId').startsWith(`${articleId}:`).delete();

      setArticles(prev => prev.filter(a => a.id !== articleId));

      if (currentArticle?.id === articleId) {
        backToList();
      }
      runArticleSync({ silent: true });
      refreshArticlesSyncStatus();
    } catch (err) {
      console.error('删除失败:', err);
      alert('删除失败:' + err.message);
    }
  }

  function closePasteModal() {
    setShowPasteModal(false);
    setPasteText('');
    setUrlDetected(false);
    setError(null);
  }

  async function toggleAiModel() {
    const next = aiModel === 'gemini' ? 'qwen' : 'gemini';
    const status = await fetchModelStatus();
    if (next === 'gemini' && !status.gemini) {
      alert('服务端未配置 GOOGLE_API_KEY，无法切换到 Gemini');
      return;
    }
    if (next === 'qwen' && !status.qwen) {
      alert('服务端未配置 QWEN_API_KEY，无法切换到 Qwen');
      return;
    }
    await setAiModelPreference(next);
    setAiModel(next);
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
    <div className={`app ${view === 'reading' ? 'is-reading' : ''}`}>
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
          <h1 className="logo">
            <Icon name="book" size={18} className="logo-icon" />
            English Reader
          </h1>
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
              词汇表
            </button>
            <button
              className={view === 'statistics' ? 'active' : ''}
              onClick={() => { setView('statistics'); closePasteModal(); }}
            >
              统计
            </button>
            <button
              className={showPasteModal ? 'active' : ''}
              onClick={handleImportClick}
              disabled={importing}
            >
              {importing ? '导入中...' : '导入文件'}
            </button>
          </nav>
          <button
            className="model-toggle"
            onClick={toggleAiModel}
            title={`当前模型: ${aiModel === 'gemini' ? 'Gemini' : 'Qwen'}`}
            aria-label={`切换模型，当前 ${aiModel === 'gemini' ? 'Gemini' : 'Qwen'}`}
          >
            <span className={`model-dot ${aiModel}`}></span>
            <span className="model-text">{aiModel === 'gemini' ? 'G' : 'Q'}</span>
          </button>
        </div>
      </header>

      {/* 粘贴弹窗 */}
      {showPasteModal && (
        <div className="paste-modal-overlay" onClick={closePasteModal}>
          <div className="paste-modal" onClick={e => e.stopPropagation()}>
            <div className="paste-modal-header">
              <h2>粘贴文章</h2>
              <button className="btn-close" onClick={closePasteModal} aria-label="关闭">
                <Icon name="close" size={18} />
              </button>
            </div>

            {error && (
              <div className="paste-error">
                错误: {error}
              </div>
            )}

            <textarea
              className="paste-textarea"
              placeholder={'在此粘贴英文文章内容或网页链接...\n\n也可点击下方【选择文件】按钮'}
              value={pasteText}
              onChange={e => {
                const value = e.target.value;
                setPasteText(value);
                setUrlDetected(isUrlLike(value));
              }}
              disabled={importing}
              rows={12}
            />
            {urlDetected && (
              <div className="url-hint">
                检测到URL，点击“开始阅读”将自动抓取正文并下载 .txt
              </div>
            )}

            <div className="paste-modal-footer">
              <span className="hint">
                {pasteText.trim() ? `${pasteText.split(/\s+/).filter(w => w).length} 个单词` : '支持粘贴英文内容/网页链接或选择 .txt/.docx/.pdf 文件'}
              </span>
              <div className="footer-buttons">
                <button
                  className="btn-select-file"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  选择文件
                </button>
                <button
                  className="btn-start-reading"
                  onClick={handlePasteImport}
                  disabled={importing || !pasteText.trim()}
                >
                  {importing ? '导入中...' : '开始阅读'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 错误提示（非弹窗状态） */}
      {error && !showPasteModal && (
        <div className="app-error">
          错误: {error}
          <button onClick={() => setError(null)} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
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
            syncStatus={articlesSyncStatus}
            preCacheProgress={preCacheProgress}
            onRead={startReading}
            onDelete={deleteArticle}
          />
        )}

        {view === 'vocabulary' && (
          <Suspense fallback={<div className="app-loading"><div className="spinner"></div></div>}>
            <VocabularyList onBack={() => setView('list')} />
          </Suspense>
        )}

        {view === 'statistics' && (
          <Suspense fallback={<div className="app-loading"><div className="spinner"></div></div>}>
            <Statistics onBack={() => setView('list')} />
          </Suspense>
        )}
      </main>

      {/* 底部导航栏 */}
      <nav className="bottom-nav">
        <div className="bottom-nav-content">
          <button
            className={`nav-item ${view === 'list' ? 'active' : ''}`}
            onClick={() => { setView('list'); closePasteModal(); }}
          >
            <span className="nav-icon"><Icon name="book" size={20} /></span>
            <span className="nav-label">文章</span>
          </button>
          <button
            className={`nav-item ${view === 'vocabulary' ? 'active' : ''}`}
            onClick={() => { setView('vocabulary'); closePasteModal(); }}
          >
            <span className="nav-icon"><Icon name="list" size={20} /></span>
            <span className="nav-label">词汇</span>
          </button>
          <button
            className="nav-item nav-item-add"
            onClick={handleImportClick}
            disabled={importing}
          >
            <span className="nav-icon"><Icon name="plus" size={20} /></span>
            <span className="nav-label">导入</span>
          </button>
          <button
            className={`nav-item ${view === 'statistics' ? 'active' : ''}`}
            onClick={() => { setView('statistics'); closePasteModal(); }}
          >
            <span className="nav-icon"><Icon name="chart" size={20} /></span>
            <span className="nav-label">统计</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

/**
 * 文章列表组件
 */
function ArticleList({ articles, syncStatus, preCacheProgress, onRead, onDelete }) {
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
        <div className="empty-icon">
          <Icon name="book" size={56} />
        </div>
        <h2>还没有文章</h2>
        <p>点击底部“导入”开始学习吧!</p>
      </div>
    );
  }

  return (
    <div className="article-list">
      <div className="list-header">
        <h2>我的文章</h2>
        <span className="count">{articles.length} 篇</span>
      </div>
      {syncStatus && (
        <div className="sync-status">
          {!syncStatus.configured && (
            <span>未配置 GitHub Token，文章不同步</span>
          )}
          {syncStatus.configured && syncStatus.error && (
            <span>同步状态获取失败: {syncStatus.error}</span>
          )}
          {syncStatus.configured && !syncStatus.error && syncStatus.lastSync && (
            <span>上次同步: {new Date(syncStatus.lastSync).toLocaleString()}</span>
          )}
          {syncStatus.configured && !syncStatus.error && !syncStatus.lastSync && (
            <span>尚未进行过文章同步</span>
          )}
        </div>
      )}

      <div className="list-grid">
        {articles.map(article => {
          const progress = progressMap[article.id];
          const cache = preCacheProgress?.[article.id];
          const isCaching = cache && cache.cached < cache.total;
          const isCacheDone = cache && cache.cached >= cache.total;
          return (
            <div key={article.id} className="article-card">
              <div className="card-header">
                <h3>{article.title}</h3>
                <button
                  className="btn-delete"
                  onClick={() => onDelete(article.id)}
                  title="删除"
                  aria-label="删除"
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>

              <div className="card-meta">
                <span>句数 {article.totalSentences}</span>
                <span>•</span>
                <span>日期 {new Date(article.createdAt).toLocaleDateString()}</span>
              </div>

              {isCaching && (
                <div className="precache-status caching">
                  <span className="precache-dot"></span>
                  翻译中 {cache.cached}/{cache.total}
                </div>
              )}
              {isCacheDone && (
                <div className="precache-status done">
                  翻译已就绪
                </div>
              )}

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
                {progress?.percentage > 0 ? '继续阅读' : '开始阅读'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;
