/**
 * 文本处理工具
 * 
 * 核心功能:
 * 1. 句子切分
 * 2. sentenceId生成
 * 3. 文章结构化
 */

/**
 * 智能句子切分
 *
 * 规则:
 * - 以 . ! ? 结尾（考虑引号）
 * - 保护常见缩写、头衔、学位
 * - 保护小数、金额、编号
 * - 处理省略号
 * - 保留段落信息
 *
 * @param {string} text - 原始文本
 * @returns {Array} - 句子数组
 */
export function splitIntoSentences(text) {
  if (!text || !text.trim()) return [];

  // 占位符
  const PLACEHOLDER = '\u0000';
  let processed = text;

  // 0. 预处理: 清理文本格式问题
  // 移除标点符号前的多余空格 (如 "word ." → "word.")
  processed = processed.replace(/\s+([.!?,;:])/g, '$1');
  // 移除装饰性符号 (中点·、项目符号•、星号分隔*** 等)
  processed = processed.replace(/[·•◦‣⁃]/g, ' ');
  processed = processed.replace(/\*{2,}/g, ' ');
  processed = processed.replace(/—{2,}/g, '—');
  // 规范化多个空格为单个空格
  processed = processed.replace(/\s+/g, ' ');

  // 1. 保护省略号 (... 或 …)
  processed = processed.replace(/\.{3}/g, `${PLACEHOLDER}ELLIPSIS${PLACEHOLDER}`);
  processed = processed.replace(/…/g, `${PLACEHOLDER}ELLIPSIS${PLACEHOLDER}`);

  // 2. 保护小数和金额 (如 3.14, $1.5, 0.01)
  processed = processed.replace(/(\d)\.(\d)/g, `$1${PLACEHOLDER}NUM${PLACEHOLDER}$2`);

  // 3. 保护常见缩写 - 头衔
  const titles = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Rev', 'Gen', 'Gov', 'Sen', 'Rep', 'Capt', 'Lt', 'Col', 'Sgt'];
  titles.forEach(title => {
    const regex = new RegExp(`\\b${title}\\.`, 'g');
    processed = processed.replace(regex, `${title}${PLACEHOLDER}TITLE${PLACEHOLDER}`);
  });

  // 4. 保护常见缩写 - 后缀
  const suffixes = ['Jr', 'Sr', 'Ph', 'Inc', 'Ltd', 'Corp', 'Co', 'Bros'];
  suffixes.forEach(suffix => {
    const regex = new RegExp(`\\b${suffix}\\.`, 'g');
    processed = processed.replace(regex, `${suffix}${PLACEHOLDER}SUFFIX${PLACEHOLDER}`);
  });

  // 5. 保护常见缩写 - 拉丁语/常用
  processed = processed.replace(/\be\.g\./gi, `e${PLACEHOLDER}EG${PLACEHOLDER}g${PLACEHOLDER}EG${PLACEHOLDER}`);
  processed = processed.replace(/\bi\.e\./gi, `i${PLACEHOLDER}IE${PLACEHOLDER}e${PLACEHOLDER}IE${PLACEHOLDER}`);
  processed = processed.replace(/\betc\./gi, `etc${PLACEHOLDER}ETC${PLACEHOLDER}`);
  processed = processed.replace(/\bvs\./gi, `vs${PLACEHOLDER}VS${PLACEHOLDER}`);
  processed = processed.replace(/\bv\./gi, `v${PLACEHOLDER}V${PLACEHOLDER}`);
  processed = processed.replace(/\bNo\./g, `No${PLACEHOLDER}NO${PLACEHOLDER}`);
  processed = processed.replace(/\bSt\./g, `St${PLACEHOLDER}ST${PLACEHOLDER}`);
  processed = processed.replace(/\bMt\./g, `Mt${PLACEHOLDER}MT${PLACEHOLDER}`);
  processed = processed.replace(/\bFt\./g, `Ft${PLACEHOLDER}FT${PLACEHOLDER}`);
  processed = processed.replace(/\bAve\./g, `Ave${PLACEHOLDER}AVE${PLACEHOLDER}`);
  processed = processed.replace(/\bBlvd\./g, `Blvd${PLACEHOLDER}BLVD${PLACEHOLDER}`);

  // 6. 保护国家/地区缩写
  processed = processed.replace(/\bU\.S\.A?\./g, `U${PLACEHOLDER}US${PLACEHOLDER}S${PLACEHOLDER}US${PLACEHOLDER}A${PLACEHOLDER}US${PLACEHOLDER}`);
  processed = processed.replace(/\bU\.S\./g, `U${PLACEHOLDER}US${PLACEHOLDER}S${PLACEHOLDER}US${PLACEHOLDER}`);
  processed = processed.replace(/\bU\.K\./g, `U${PLACEHOLDER}UK${PLACEHOLDER}K${PLACEHOLDER}UK${PLACEHOLDER}`);
  processed = processed.replace(/\bU\.N\./g, `U${PLACEHOLDER}UN${PLACEHOLDER}N${PLACEHOLDER}UN${PLACEHOLDER}`);
  processed = processed.replace(/\bE\.U\./g, `E${PLACEHOLDER}EU${PLACEHOLDER}U${PLACEHOLDER}EU${PLACEHOLDER}`);

  // 7. 保护学位
  processed = processed.replace(/\bPh\.D\./g, `Ph${PLACEHOLDER}PHD${PLACEHOLDER}D${PLACEHOLDER}PHD${PLACEHOLDER}`);
  processed = processed.replace(/\bM\.D\./g, `M${PLACEHOLDER}MD${PLACEHOLDER}D${PLACEHOLDER}MD${PLACEHOLDER}`);
  processed = processed.replace(/\bB\.A\./g, `B${PLACEHOLDER}BA${PLACEHOLDER}A${PLACEHOLDER}BA${PLACEHOLDER}`);
  processed = processed.replace(/\bM\.A\./g, `M${PLACEHOLDER}MA${PLACEHOLDER}A${PLACEHOLDER}MA${PLACEHOLDER}`);
  processed = processed.replace(/\bB\.S\./g, `B${PLACEHOLDER}BS${PLACEHOLDER}S${PLACEHOLDER}BS${PLACEHOLDER}`);
  processed = processed.replace(/\bM\.S\./g, `M${PLACEHOLDER}MS${PLACEHOLDER}S${PLACEHOLDER}MS${PLACEHOLDER}`);

  // 8. 保护时间 (a.m. / p.m.)
  processed = processed.replace(/\ba\.m\./gi, `a${PLACEHOLDER}AM${PLACEHOLDER}m${PLACEHOLDER}AM${PLACEHOLDER}`);
  processed = processed.replace(/\bp\.m\./gi, `p${PLACEHOLDER}PM${PLACEHOLDER}m${PLACEHOLDER}PM${PLACEHOLDER}`);

  // 9. 切分句子 - 改进的正则
  // 匹配: 非终结符内容 + 终结符(.!?) + 可选的引号/括号
  const sentenceRegex = /[^.!?]*[.!?]+["'»」』）)]*\s*/g;
  let sentences = processed.match(sentenceRegex) || [];

  // 10. 恢复所有占位符
  sentences = sentences.map(s => {
    let restored = s;
    // 恢复省略号
    restored = restored.replace(new RegExp(`${PLACEHOLDER}ELLIPSIS${PLACEHOLDER}`, 'g'), '...');
    // 恢复小数点
    restored = restored.replace(new RegExp(`${PLACEHOLDER}NUM${PLACEHOLDER}`, 'g'), '.');
    // 恢复所有其他标记为点号
    restored = restored.replace(new RegExp(`${PLACEHOLDER}[A-Z]+${PLACEHOLDER}`, 'g'), '.');
    return restored.trim();
  }).filter(s => {
    // 过滤无效句子:
    // 1. 空字符串
    if (s.length === 0) return false;
    // 2. 只包含标点符号或特殊字符 (无实际文字内容)
    if (!/[a-zA-Z]/.test(s)) return false;
    // 3. 单个字符或只有标点
    if (s.replace(/[^a-zA-Z]/g, '').length < 2) return false;
    return true;
  });

  // 11. 合并过短的句子片段（少于3个单词且不是完整句子）
  const merged = [];
  for (let i = 0; i < sentences.length; i++) {
    const current = sentences[i];
    const wordCount = current.split(/\s+/).length;

    // 如果当前片段很短且不以终结符结尾，与下一句合并
    if (wordCount < 3 && i < sentences.length - 1 && !/[.!?]["'»」』）)]*$/.test(current)) {
      sentences[i + 1] = current + ' ' + sentences[i + 1];
    } else {
      merged.push(current);
    }
  }

  return merged;
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
 * 智能分词 - 将句子切分为单词和标点的 token 数组
 *
 * 设计意图 (Why):
 * - 前端取词功能需要精确区分"可点击的单词"和"不可点击的标点"
 * - 简单的 split(' ') 会将标点粘连在单词上，导致查词失败
 * - 需要保护缩写词 (don't, I'm) 和连字符词 (state-of-the-art)
 *
 * @param {string} sentence - 输入句子
 * @returns {Array<{text: string, type: 'word'|'punctuation'|'number'|'space'}>} - token 数组
 */
export function tokenizeSentence(sentence) {
  if (!sentence || typeof sentence !== 'string') {
    return [];
  }

  const tokens = [];

  // 正则模式说明 (按优先级排序):
  // 1. 缩写词: [A-Za-z]+('[A-Za-z]+)+ (如 don't, I'm, they've)
  // 2. 连字符词: [A-Za-z]+(-[A-Za-z]+)+ (如 state-of-the-art)
  // 3. 普通单词: [A-Za-z]+
  // 4. 数字 (可能带小数/货币): [$€£¥]?\d+(?:\.\d+)?%?
  // 5. 标点符号: [.,!?;:'"()\[\]{}—–…""\u201C\u201D\u2018\u2019$€£¥]+
  // 6. 空格: \s+

  const tokenRegex = /([A-Za-z]+(?:'[A-Za-z]+)+)|([A-Za-z]+(?:-[A-Za-z]+)+)|([A-Za-z]+)|([$€£¥]?\d+(?:\.\d+)?%?)|([.,!?;:'"()\[\]{}—–…""''$€£¥]+)|(\s+)/g;

  let match;
  while ((match = tokenRegex.exec(sentence)) !== null) {
    const [fullMatch, contraction, hyphenated, word, number, punctuation, space] = match;

    if (contraction) {
      // 缩写词 (don't, I'm) - 视为单词
      tokens.push({ text: contraction, type: 'word' });
    } else if (hyphenated) {
      // 连字符词 (state-of-the-art) - 视为单词
      tokens.push({ text: hyphenated, type: 'word' });
    } else if (word) {
      // 普通单词
      tokens.push({ text: word, type: 'word' });
    } else if (number) {
      // 数字/金额 - 不可点击，作为独立元素显示
      tokens.push({ text: number, type: 'number' });
    } else if (punctuation) {
      // 标点符号
      tokens.push({ text: punctuation, type: 'punctuation' });
    } else if (space) {
      // 空格
      tokens.push({ text: space, type: 'space' });
    }
  }

  return tokens;
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
