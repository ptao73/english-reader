import Dexie from 'dexie';

/**
 * 英文学习APP数据库
 * 
 * 核心表:
 * - articles: 文章存储
 * - sentences: 句子级数据(可选索引)
 * - aiCache: AI解析缓存(L1缓存)
 * - vocabulary: 词汇表
 * - progress: 阅读进度
 * - revealState: 反直觉学习节奏状态
 */
class EnglishLearningDB extends Dexie {
  constructor() {
    super('EnglishLearningDB');
    
    this.version(1).stores({
      // 文章表
      articles: 'id, title, createdAt, updatedAt',
      
      // 句子表(sentenceId格式: docId:chId:pN:sM)
      sentences: 'sentenceId, docId, text, level, updatedAt',
      
      // AI缓存表(L1本地缓存)
      // key: sentenceId 或 word
      // type: 'sentence' | 'word'
      aiCache: 'key, type, createdAt',
      
      // 词汇表
      // id: 自增ID
      // word: 单词(索引)
      vocabulary: '++id, word, nextReview, mastered, createdAt',
      
      // 学习进度
      progress: 'docId, currentSentenceId, percentage, lastReadAt',
      
      // 反直觉学习状态(关键!)
      // sentenceId -> level (1/2/3)
      revealState: 'sentenceId, level, updatedAt',
      
      // 离线模型索引(未来使用)
      models: 'name, version, downloadedAt'
    });

    // 表引用
    this.articles = this.table('articles');
    this.sentences = this.table('sentences');
    this.aiCache = this.table('aiCache');
    this.vocabulary = this.table('vocabulary');
    this.progress = this.table('progress');
    this.revealState = this.table('revealState');
    this.models = this.table('models');
  }
}

// 创建全局数据库实例
export const db = new EnglishLearningDB();

// 导出数据库类供测试使用
export default EnglishLearningDB;

/**
 * 数据结构定义(TypeScript风格注释)
 */

// Article类型
export const ArticleSchema = {
  id: 'string',           // 唯一ID
  title: 'string',        // 标题
  content: 'string',      // 原始文本
  sentences: 'array',     // 句子数组
  createdAt: 'string',    // ISO 8601
  updatedAt: 'string'
};

// Sentence类型
export const SentenceSchema = {
  sentenceId: 'string',   // 如: "doc1:ch1:p1:s5"
  docId: 'string',        // 所属文章ID
  text: 'string',         // 句子文本
  level: 'number',        // 当前揭示级别(1/2/3)
  updatedAt: 'string'
};

// AICache类型
export const AICacheSchema = {
  key: 'string',          // sentenceId 或 word
  type: 'string',         // 'sentence' | 'word'
  data: 'object',         // 缓存的AI响应
  createdAt: 'string'
};

// AIResponse for Sentence
export const SentenceAnalysisSchema = {
  sentenceId: 'string',
  text: 'string',
  hint: 'string',         // Level 1: 最少提示
  analysis: 'string',     // Level 2: 完整分析
  zh: 'string',           // Level 3: 中文翻译
  cachedAt: 'string'
};

// Vocabulary类型
export const VocabularySchema = {
  id: 'number',           // 自增ID
  word: 'string',         // 单词
  meanings: 'array',      // 释义列表
  etymology: 'object',    // 词源 {root, suffix, prefix}
  examples: 'array',      // 例句
  reviewCount: 'number',  // 复习次数
  nextReview: 'string',   // 下次复习时间
  mastered: 'boolean',    // 是否掌握
  createdAt: 'string',
  updatedAt: 'string'
};

// Progress类型
export const ProgressSchema = {
  docId: 'string',
  currentSentenceId: 'string',
  percentage: 'number',   // 0-100
  lastReadAt: 'string'
};

// RevealState类型(反直觉学习核心!)
export const RevealStateSchema = {
  sentenceId: 'string',
  level: 'number',        // 1/2/3
  updatedAt: 'string'
};
