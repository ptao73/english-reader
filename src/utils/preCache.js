import { db } from '../db/schema.js';
import { getSentenceAnalysis } from './ai.js';

const DELAY_BETWEEN_REQUESTS = 300; // ms

/**
 * 后台预缓存文章所有句子的翻译分析
 *
 * @param {Object} article - 文章对象 (含 sentences 数组)
 * @param {Object} options
 * @param {AbortSignal} options.signal - 用于取消任务
 * @param {Function} options.onProgress - 进度回调 ({ cached, total })
 * @param {number} [options.startFrom=0] - 从哪个索引开始（Reader 中可从当前位置开始）
 * @returns {Promise<void>}
 */
export async function preCacheArticle(article, { signal, onProgress, startFrom = 0 } = {}) {
  const sentences = article.sentences;
  if (!sentences || sentences.length === 0) return;

  const total = sentences.length;

  // 智能排序：先缓存 startFrom 之后的句子，再回头缓存之前的
  const ordered = [];
  for (let i = startFrom; i < sentences.length; i++) ordered.push(sentences[i]);
  for (let i = 0; i < startFrom; i++) ordered.push(sentences[i]);

  // 先统计已缓存数量
  let cached = 0;
  for (const s of sentences) {
    const existing = await db.aiCache.get(s.sentenceId);
    if (existing) cached++;
  }

  // 全部已缓存，直接通知完成
  if (cached >= total) {
    onProgress?.({ cached, total });
    return;
  }

  onProgress?.({ cached, total });

  for (const sentence of ordered) {
    if (signal?.aborted) return;

    // 跳过已缓存
    const existing = await db.aiCache.get(sentence.sentenceId);
    if (existing) continue;

    try {
      await getSentenceAnalysis(sentence.sentenceId, sentence.text);
      cached++;
      onProgress?.({ cached, total });
    } catch (err) {
      // 单句失败不中断整个任务，跳过继续
      console.warn('预缓存失败，跳过:', sentence.sentenceId, err.message);
    }

    // 请求间隔，避免限流
    if (!signal?.aborted) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    }
  }
}

/**
 * 检查文章的缓存进度
 * @param {Object} article - 文章对象
 * @returns {Promise<{cached: number, total: number}>}
 */
export async function getArticleCacheProgress(article) {
  const sentences = article.sentences;
  if (!sentences || sentences.length === 0) return { cached: 0, total: 0 };

  let cached = 0;
  for (const s of sentences) {
    const existing = await db.aiCache.get(s.sentenceId);
    if (existing) cached++;
  }

  return { cached, total: sentences.length };
}
