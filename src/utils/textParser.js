/**
 * 文本处理工具
 * 
 * 核心功能:
 * 1. 句子切分
 * 2. sentenceId生成
 * 3. 文章结构化
 */

/**
 * 简单句子切分(基于正则)
 * 
 * 规则:
 * - 以 . ! ? 结尾
 * - 处理常见缩写 (Mr. Mrs. Dr. etc.)
 * - 保留段落信息
 * 
 * @param {string} text - 原始文本
 * @returns {Array} - 句子数组
 */
export function splitIntoSentences(text) {
  // 预处理: 保护常见缩写
  const protectedText = text
    .replace(/Mr\./g, 'Mr<dot>')
    .replace(/Mrs\./g, 'Mrs<dot>')
    .replace(/Dr\./g, 'Dr<dot>')
    .replace(/Ms\./g, 'Ms<dot>')
    .replace(/vs\./g, 'vs<dot>')
    .replace(/etc\./g, 'etc<dot>')
    .replace(/e\.g\./g, 'e<dot>g<dot>')
    .replace(/i\.e\./g, 'i<dot>e<dot>');

  // 切分句子
  const sentences = protectedText
    .match(/[^.!?]+[.!?]+/g) || [];

  // 恢复缩写
  return sentences.map(s => 
    s.replace(/<dot>/g, '.')
     .trim()
  ).filter(s => s.length > 0);
}

/**
 * 生成稳定的sentenceId
 * 
 * 格式: docId:chId:pN:sM
 * 
 * @param {string} docId - 文档ID
 * @param {number} pageIndex - 页码(从1开始)
 * @param {number} sentenceIndex - 句子索引(从1开始)
 * @param {string} chapterId - 章节ID(可选)
 * @returns {string} - sentenceId
 */
export function generateSentenceId(docId, pageIndex, sentenceIndex, chapterId = 'ch1') {
  return `${docId}:${chapterId}:p${pageIndex}:s${sentenceIndex}`;
}

/**
 * 解析sentenceId
 * 
 * @param {string} sentenceId - 如 "doc1:ch1:p5:s12"
 * @returns {Object} - {docId, chapterId, pageIndex, sentenceIndex}
 */
export function parseSentenceId(sentenceId) {
  const parts = sentenceId.split(':');
  
  return {
    docId: parts[0],
    chapterId: parts[1] || 'ch1',
    pageIndex: parseInt(parts[2]?.replace('p', '') || '1'),
    sentenceIndex: parseInt(parts[3]?.replace('s', '') || '1')
  };
}

/**
 * 将文本结构化为文章对象
 * 
 * @param {string} title - 标题
 * @param {string} content - 内容
 * @param {Object} options - 配置项
 * @returns {Object} - 结构化文章
 */
export function parseArticle(title, content, options = {}) {
  const {
    docId = `doc_${Date.now()}`,
    chapterId = 'ch1',
    sentencesPerPage = 20  // 每页句子数
  } = options;

  // 切分句子
  const allSentences = splitIntoSentences(content);

  // 生成带ID的句子
  const sentences = allSentences.map((text, index) => {
    const pageIndex = Math.floor(index / sentencesPerPage) + 1;
    const sentenceIndexInPage = (index % sentencesPerPage) + 1;
    
    return {
      sentenceId: generateSentenceId(docId, pageIndex, sentenceIndexInPage, chapterId),
      text,
      index,
      pageIndex,
      sentenceIndexInPage
    };
  });

  return {
    id: docId,
    title,
    content,
    sentences,
    totalSentences: sentences.length,
    totalPages: Math.ceil(sentences.length / sentencesPerPage),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * 按页分组句子
 * 
 * @param {Array} sentences - 句子数组
 * @returns {Object} - {1: [...], 2: [...]}
 */
export function groupSentencesByPage(sentences) {
  return sentences.reduce((acc, sentence) => {
    const page = sentence.pageIndex;
    if (!acc[page]) {
      acc[page] = [];
    }
    acc[page].push(sentence);
    return acc;
  }, {});
}

/**
 * 计算阅读进度百分比
 * 
 * @param {number} currentIndex - 当前句子索引
 * @param {number} totalSentences - 总句子数
 * @returns {number} - 百分比(0-100)
 */
export function calculateProgress(currentIndex, totalSentences) {
  if (totalSentences === 0) return 0;
  return Math.round((currentIndex / totalSentences) * 100);
}

/**
 * 估算阅读时间(分钟)
 * 
 * 假设: 平均阅读速度 200词/分钟
 * 
 * @param {string} text - 文本
 * @returns {number} - 分钟数
 */
export function estimateReadingTime(text) {
  const words = text.split(/\s+/).length;
  const minutes = Math.ceil(words / 200);
  return minutes;
}

/**
 * 提取关键词(简单版本)
 * 
 * @param {string} text - 文本
 * @param {number} limit - 提取数量
 * @returns {Array} - 关键词数组
 */
export function extractKeywords(text, limit = 10) {
  // 停用词列表(简化版)
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
    'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
  ]);

  // 提取单词
  const words = text.toLowerCase()
    .match(/\b[a-z]{3,}\b/g) || [];

  // 统计频率
  const frequency = {};
  words.forEach(word => {
    if (!stopWords.has(word)) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
  });

  // 排序并返回Top N
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}
