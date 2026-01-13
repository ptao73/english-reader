import { useState } from 'react';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { db } from '../db/schema.js';
import { parseArticle } from '../utils/textParser.js';
import './ArticleImport.css';

// 配置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * 文章导入组件
 *
 * 一键导入：选择文件后自动开始阅读
 */
export default function ArticleImport({ onImported }) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  /**
   * 处理文件上传并自动开始阅读
   */
  async function handleFileUpload(file) {
    if (!file) return;

    setError(null);
    setImporting(true);

    try {
      // 检查文件类型
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

      // 自动开始阅读
      onImported(article);
    } catch (err) {
      console.error('导入失败:', err);
      setError('导入失败: ' + err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="article-import">
      <div className="import-header">
        <h2>📚 导入文章</h2>
        <p>支持 .txt / .docx / .pdf 文件</p>
      </div>

      {error && (
        <div className="import-error">
          ❌ {error}
        </div>
      )}

      <div className="import-form">
        <input
          id="file-upload"
          type="file"
          accept=".txt,.doc,.docx,.pdf"
          onChange={e => handleFileUpload(e.target.files[0])}
          disabled={importing}
          style={{ display: 'none' }}
        />
        <label htmlFor="file-upload" className="btn-import">
          {importing ? '导入中...' : '📚 导入文章'}
        </label>
      </div>
    </div>
  );
}
