import { useState } from 'react';
import { db } from '../db/schema.js';
import { parseArticle } from '../utils/textParser.js';
import './ArticleImport.css';

/**
 * 文章导入组件
 * 
 * 支持:
 * 1. 粘贴文本
 * 2. 上传文件(txt)
 * 3. 拖拽文件
 */
export default function ArticleImport({ onImported }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  /**
   * 处理导入
   */
  async function handleImport() {
    // 验证
    if (!title.trim()) {
      setError('请输入文章标题');
      return;
    }

    if (!content.trim()) {
      setError('请输入或粘贴文章内容');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      // 解析文章
      const article = parseArticle(title.trim(), content.trim());

      // 保存到数据库
      await db.articles.add(article);

      // 初始化进度
      await db.progress.put({
        docId: article.id,
        currentSentenceId: article.sentences[0].sentenceId,
        percentage: 0,
        lastReadAt: new Date().toISOString()
      });

      // 回调
      onImported(article);

      // 清空表单
      setTitle('');
      setContent('');
    } catch (err) {
      console.error('导入失败:', err);
      setError(err.message);
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

    // 检查文件类型
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (!['txt', 'doc', 'docx', 'pdf'].includes(ext)) {
      setError('支持的文件格式: .txt, .doc, .docx, .pdf');
      return;
    }

    try {
      let text = '';
      
      if (ext === 'txt') {
        // 直接读取文本
        text = await file.text();
      } else if (ext === 'pdf' || ext === 'doc' || ext === 'docx') {
        // PDF和Word需要后端处理或使用库
        // 暂时提示用户转换为txt
        setError(`${ext.toUpperCase()}文件支持开发中,请先转换为.txt格式\n\n建议:\n1. 打开文档\n2. 全选复制文本(Cmd+A, Cmd+C)\n3. 粘贴到上方文本框`);
        return;
      }
      
      setContent(text);

      // 自动填充标题(如果为空)
      if (!title) {
        const filename = file.name.replace(/\.(txt|doc|docx|pdf)$/i, '');
        setTitle(filename);
      }
    } catch (err) {
      console.error('读取文件失败:', err);
      setError('文件读取失败: ' + err.message);
    }
  }

  /**
   * 处理拖拽
   */
  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFileUpload(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  return (
    <div className="article-import">
      <div className="import-header">
        <h2>📚 导入文章</h2>
        <p>支持粘贴文本或上传.txt文件</p>
      </div>

      {error && (
        <div className="import-error">
          ❌ {error}
        </div>
      )}

      <div className="import-form">
        {/* 标题输入 */}
        <div className="form-group">
          <label htmlFor="title">文章标题 *</label>
          <input
            id="title"
            type="text"
            placeholder="例如: The Future of AI"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={importing}
          />
        </div>

        {/* 内容输入 */}
        <div className="form-group">
          <label htmlFor="content">文章内容 *</label>
          <textarea
            id="content"
            placeholder="粘贴或输入英文文章内容..."
            value={content}
            onChange={e => {
              setContent(e.target.value);
              // 如果标题为空,自动生成标题
              if (!title && e.target.value.length > 20) {
                const firstLine = e.target.value.split('\n')[0].trim();
                if (firstLine.length > 5 && firstLine.length < 100) {
                  setTitle(firstLine.substring(0, 50));
                } else {
                  setTitle('Article ' + new Date().toLocaleDateString());
                }
              }
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            disabled={importing}
            rows={15}
          />
          <div className="hint">
            支持拖拽.txt文件到此区域 | 粘贴后会自动生成标题
          </div>
        </div>

        {/* 文件上传 */}
        <div className="form-group">
          <label htmlFor="file-upload" className="file-upload-label">
            📁 或选择文件上传
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".txt,.doc,.docx,.pdf"
            onChange={e => handleFileUpload(e.target.files[0])}
            disabled={importing}
            style={{ display: 'none' }}
          />
        </div>

        {/* 预览信息 */}
        {content && (
          <div className="preview-info">
            <h3>📊 预览信息</h3>
            <div className="stats">
              <div className="stat">
                <span className="label">字符数:</span>
                <span className="value">{content.length}</span>
              </div>
              <div className="stat">
                <span className="label">单词数:</span>
                <span className="value">
                  {content.split(/\s+/).filter(w => w).length}
                </span>
              </div>
              <div className="stat">
                <span className="label">预估句子数:</span>
                <span className="value">
                  {(content.match(/[.!?]+/g) || []).length}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 导入按钮 */}
        <button
          className="btn-import"
          onClick={handleImport}
          disabled={importing || !title.trim() || !content.trim()}
        >
          {importing ? '导入中...' : '🚀 开始阅读'}
        </button>
      </div>
    </div>
  );
}
