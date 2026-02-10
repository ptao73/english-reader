import { useState, useEffect } from 'react';
import { db } from '../db/schema.js';
import { tts } from '../utils/tts.js';
import {
  isGitHubConfigured,
  syncVocabulary,
  getSyncStatus
} from '../utils/github.js';
import { getDueWords } from '../utils/spacedRepetition.js';
import ReviewQuiz from './ReviewQuiz.jsx';
import Icon from './Icon.jsx';
import './VocabularyList.css';

/**
 * 词汇列表页面
 */
export default function VocabularyList({ onBack }) {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, unmastered, mastered
  const [sortBy, setSortBy] = useState('newest'); // newest, oldest, alphabetical
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWord, setSelectedWord] = useState(null);

  // 同步状态（预留给 GitHub 同步）
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  // 复习测验状态
  const [showReviewQuiz, setShowReviewQuiz] = useState(false);
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    loadWords();
    checkSyncStatus();
    checkDueWords();
  }, [filter, sortBy]);

  // 检查待复习单词数量
  async function checkDueWords() {
    try {
      const dueWords = await getDueWords(100);
      setDueCount(dueWords.length);
    } catch (err) {
      console.error('检查待复习单词失败:', err);
    }
  }

  // 复习完成回调
  function handleReviewComplete(results) {
    console.log('复习完成:', results);
    loadWords();
    checkDueWords();
  }

  useEffect(() => {
    // 搜索时防抖
    const timer = setTimeout(() => {
      loadWords();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 检查同步状态
  async function checkSyncStatus() {
    if (await isGitHubConfigured()) {
      try {
        const status = await getSyncStatus();
        setSyncStatus(status);
      } catch (err) {
        console.error('检查同步状态失败:', err);
        setSyncStatus({ configured: true, error: err.message });
      }
    } else {
      setSyncStatus({ configured: false });
    }
  }

  // 执行同步
  async function handleSync() {
    if (!(await isGitHubConfigured())) {
      alert('请先在 Vercel 环境变量中配置 GITHUB_TOKEN\n\n获取方式:\n1. 访问 https://github.com/settings/tokens\n2. 生成新 Token，勾选 gist 权限\n3. 在 Vercel 项目设置中添加 GITHUB_TOKEN 环境变量');
      return;
    }

    setSyncing(true);
    setSyncProgress('准备同步...');

    try {
      // 获取本地词汇
      const localWords = await db.vocabulary.toArray();

      // 执行同步
      const result = await syncVocabulary(localWords, (progress) => {
        setSyncProgress(progress);
      });

      // 将云端新词汇写入本地
      if (result.newToLocal.length > 0) {
        setSyncProgress(`正在导入 ${result.newToLocal.length} 个新词汇...`);

        for (const word of result.newToLocal) {
          const { _needUpdate, _localId, ...cleanWord } = word;

          // 检查本地是否已存在相同单词
          const existingWord = await db.vocabulary.where('word').equals(cleanWord.word).first();

          if (existingWord) {
            // 更新现有记录
            await db.vocabulary.update(existingWord.id, {
              ...cleanWord,
              updatedAt: new Date().toISOString()
            });
          } else if (_needUpdate && _localId) {
            // 更新指定ID的记录
            await db.vocabulary.update(_localId, cleanWord);
          } else {
            // 添加新记录 - 使用 put 避免主键冲突
            await db.vocabulary.put({
              ...cleanWord,
              createdAt: cleanWord.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        }
      }

      // 重新加载
      await loadWords();
      await checkSyncStatus();

      alert(`同步成功!\n\n共 ${result.totalCount} 个词汇\n新导入 ${result.newToLocal.length} 个`);
    } catch (err) {
      console.error('同步失败:', err);
      alert('同步失败: ' + err.message);
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  }

  async function loadWords() {
    setLoading(true);
    try {
      let results = await db.vocabulary.toArray();

      // 应用过滤
      if (filter === 'mastered') {
        results = results.filter(w => w.mastered);
      } else if (filter === 'unmastered') {
        results = results.filter(w => !w.mastered);
      }

      // 应用搜索
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        results = results.filter(w =>
          w.word.includes(q) ||
          w.meanings?.some(m => m.def?.includes(q))
        );
      }

      // 应用排序
      if (sortBy === 'newest') {
        results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      } else if (sortBy === 'oldest') {
        results.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      } else if (sortBy === 'alphabetical') {
        results.sort((a, b) => a.word.localeCompare(b.word));
      }

      setWords(results);
    } catch (err) {
      console.error('加载词汇失败:', err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleMastered(wordId) {
    const word = await db.vocabulary.get(wordId);
    await db.vocabulary.update(wordId, {
      mastered: !word.mastered,
      updatedAt: new Date().toISOString()
    });
    loadWords();
    if (selectedWord?.id === wordId) {
      setSelectedWord({ ...selectedWord, mastered: !word.mastered });
    }
  }

  async function deleteWord(wordId) {
    if (!confirm('确定要删除这个单词吗?')) return;
    await db.vocabulary.delete(wordId);
    setSelectedWord(null);
    loadWords();
  }

  function speakWord(word) {
    tts.speak(word, { rate: 0.8 });
  }

  const stats = {
    total: words.length,
    mastered: words.filter(w => w.mastered).length,
    unmastered: words.filter(w => !w.mastered).length
  };

  return (
    <div className="vocabulary-page">
      {/* 顶部工具栏 */}
      <div className="vocab-toolbar">
        <button className="btn-back" onClick={onBack}>
          ← 返回
        </button>
        <h1>我的词汇表</h1>

        {/* 复习和同步按钮区域 */}
        <div className="action-section">
          {/* 开始复习按钮 */}
          <button
            className={`btn-review ${dueCount > 0 ? 'has-due' : ''}`}
            onClick={() => setShowReviewQuiz(true)}
            disabled={words.length < 4}
            title={words.length < 4 ? '至少需要4个单词才能开始复习' : '开始复习'}
          >
            开始复习
            {dueCount > 0 && <span className="due-badge">{dueCount}</span>}
          </button>

          {/* 同步按钮 */}
          <button
            className={`btn-sync ${syncing ? 'syncing' : ''} ${!syncStatus?.configured ? 'disabled' : ''}`}
            onClick={handleSync}
            disabled={syncing}
            title={!syncStatus?.configured ? '请配置 GitHub Token' : '同步到云端'}
          >
            {syncing ? (
              <>{syncProgress || '同步中...'}</>
            ) : (
              <>云端同步</>
            )}
          </button>
          {syncStatus?.lastSync && (
            <span className="sync-info">
              上次同步: {new Date(syncStatus.lastSync).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* 统计信息 */}
      <div className="vocab-stats">
        <div className="stat-item">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">总词汇</span>
        </div>
        <div className="stat-item success">
          <span className="stat-value">{stats.mastered}</span>
          <span className="stat-label">已掌握</span>
        </div>
        <div className="stat-item warning">
          <span className="stat-value">{stats.unmastered}</span>
          <span className="stat-label">学习中</span>
        </div>
      </div>

      {/* 搜索和过滤 */}
      <div className="vocab-filters">
        <input
          type="text"
          className="search-input"
          placeholder="搜索单词或释义..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <select
          className="filter-select"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="all">全部</option>
          <option value="unmastered">学习中</option>
          <option value="mastered">已掌握</option>
        </select>
        <select
          className="sort-select"
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
        >
          <option value="newest">最新添加</option>
          <option value="oldest">最早添加</option>
          <option value="alphabetical">字母排序</option>
        </select>
      </div>

      {/* 词汇列表 */}
      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      ) : words.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Icon name="list" size={56} />
          </div>
          <h2>还没有收藏单词</h2>
          <p>在阅读文章时点击单词即可收藏</p>
        </div>
      ) : (
        <div className="vocab-grid">
          {words.map(word => (
            <div
              key={word.id}
              className={`vocab-card ${word.mastered ? 'mastered' : ''}`}
              onClick={() => setSelectedWord(word)}
            >
              <div className="vocab-card-header">
                <h3>{word.word}</h3>
                <button
                  className="btn-speak-mini"
                  onClick={e => { e.stopPropagation(); speakWord(word.word); }}
                  aria-label="朗读单词"
                >
                  <Icon name="speaker" size={18} />
                </button>
              </div>
              {word.phonetic && (
                <div className="vocab-phonetic">{word.phonetic}</div>
              )}
              <div className="vocab-meaning">
                {word.meanings?.[0]?.def || '暂无释义'}
              </div>
              {word.mastered && (
                <div className="mastered-badge">✓ 已掌握</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 单词详情弹窗 */}
      {selectedWord && (
        <WordDetailModal
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
          onToggleMastered={() => toggleMastered(selectedWord.id)}
          onDelete={() => deleteWord(selectedWord.id)}
          onSpeak={() => speakWord(selectedWord.word)}
        />
      )}

      {/* 复习测验 */}
      {showReviewQuiz && (
        <ReviewQuiz
          onClose={() => setShowReviewQuiz(false)}
          onComplete={handleReviewComplete}
        />
      )}
    </div>
  );
}

/**
 * 单词详情弹窗
 */
function WordDetailModal({ word, onClose, onToggleMastered, onDelete, onSpeak }) {
  return (
    <div className="word-modal-overlay" onClick={onClose}>
      <div className="word-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="word-title">
            <h2>{word.word}</h2>
            <button className="btn-speak" onClick={onSpeak} aria-label="朗读单词">
              <Icon name="speaker" size={18} />
            </button>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>

        {word.phonetic && (
          <div className="word-phonetic">{word.phonetic}</div>
        )}

        {/* 释义 */}
        {word.meanings?.length > 0 && (
          <section className="word-section">
            <h4>释义</h4>
            <div className="meanings-list">
              {word.meanings.map((m, i) => (
                <div key={i} className="meaning-item">
                  <span className="pos">{m.pos}</span>
                  <span className="def">{m.def}</span>
                  {m.defEn && <span className="def-en">{m.defEn}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 词源 */}
        {word.etymology && Object.values(word.etymology).some(v => v) && (
          <section className="word-section">
            <h4>词源</h4>
            <div className="etymology">
              {word.etymology.prefix && <span className="etym-part">前缀: {word.etymology.prefix}</span>}
              {word.etymology.root && <span className="etym-part">词根: {word.etymology.root}</span>}
              {word.etymology.suffix && <span className="etym-part">后缀: {word.etymology.suffix}</span>}
              {word.etymology.origin && <span className="etym-origin">来源: {word.etymology.origin}</span>}
            </div>
          </section>
        )}

        {/* 例句 */}
        {word.examples?.length > 0 && (
          <section className="word-section">
            <h4>例句</h4>
            <ul className="examples-list">
              {word.examples.map((ex, i) => (
                <li key={i}>{ex}</li>
              ))}
            </ul>
          </section>
        )}

        {/* 常见搭配 */}
        {word.collocations?.length > 0 && (
          <section className="word-section">
            <h4>常见搭配</h4>
            <div className="collocations">
              {word.collocations.map((c, i) => (
                <span key={i} className="collocation-tag">{c}</span>
              ))}
            </div>
          </section>
        )}

        {/* 同义词 */}
        {word.synonyms?.length > 0 && (
          <section className="word-section">
            <h4>≈ 同义词</h4>
            <div className="synonyms">
              {word.synonyms.map((s, i) => (
                <span key={i} className="synonym-tag">{s}</span>
              ))}
            </div>
          </section>
        )}

        {/* 语境释义 */}
        {word.context && (
          <section className="word-section context-section">
            <h4>收藏语境</h4>
            <p className="context-text">"{word.context}"</p>
            {word.contextMeaning && (
              <p className="context-meaning">{word.contextMeaning}</p>
            )}
            {word.articleTitle && (
              <p className="context-source">来自: {word.articleTitle}</p>
            )}
          </section>
        )}

        {/* 操作按钮 */}
        <div className="modal-actions">
          <button
            className={`btn-mastered ${word.mastered ? 'active' : ''}`}
            onClick={onToggleMastered}
          >
            {word.mastered ? '✓ 已掌握' : '○ 标记为已掌握'}
          </button>
          <button className="btn-delete-word" onClick={onDelete}>
            删除
          </button>
        </div>

        {/* 时间信息 */}
        <div className="word-meta">
          添加时间: {new Date(word.createdAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
