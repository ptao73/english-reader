/**
 * SM-2 间隔重复算法
 * 基于 SuperMemo 2 算法实现
 *
 * 核心概念:
 * - easiness: 难度系数 (1.3 - 2.5)，越高表示越容易
 * - interval: 下次复习间隔 (天数)
 * - repetitions: 连续正确次数
 * - mastered: 掌握条件 = 连续5次正确 + 难度系数 >= 2.5
 */

import { db } from '../db/schema.js';

/**
 * 默认SM-2参数
 */
const DEFAULT_SM2_PARAMS = {
  easiness: 2.5,      // 初始难度系数
  interval: 1,        // 初始间隔(天)
  repetitions: 0      // 连续正确次数
};

/**
 * 掌握条件
 */
const MASTERY_CONDITIONS = {
  minRepetitions: 5,   // 最少连续正确次数
  minEasiness: 2.5     // 最低难度系数
};

/**
 * 计算下一次复习时间
 * @param {Object} word - 单词对象
 * @param {boolean} isCorrect - 是否答对
 * @param {number} quality - 答题质量 (0-5)，5最好
 * @returns {Object} 更新后的SM2参数
 */
export function calculateNextReview(word, isCorrect, quality = null) {
  // 获取当前SM2参数，如不存在则使用默认值
  const sm2 = word.sm2 || { ...DEFAULT_SM2_PARAMS };

  // 如果未提供quality，根据isCorrect推断
  // 正确: quality=4 (正确但有犹豫)
  // 错误: quality=1 (完全错误)
  if (quality === null) {
    quality = isCorrect ? 4 : 1;
  }

  let { easiness, interval, repetitions } = sm2;

  if (isCorrect) {
    // 答对: 更新间隔
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easiness);
    }

    repetitions += 1;

    // 更新难度系数 (SM-2 公式)
    easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    // 难度系数限制在 [1.3, 2.5]
    if (easiness < 1.3) easiness = 1.3;
    if (easiness > 2.5) easiness = 2.5;

  } else {
    // 答错: 重置间隔为1天
    interval = 1;
    repetitions = 0;

    // 降低难度系数
    easiness = Math.max(1.3, easiness - 0.2);
  }

  // 计算下次复习时间
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  // 检查是否达到掌握条件
  const mastered = (
    repetitions >= MASTERY_CONDITIONS.minRepetitions &&
    easiness >= MASTERY_CONDITIONS.minEasiness
  );

  return {
    sm2: { easiness, interval, repetitions },
    nextReview: nextReview.toISOString(),
    mastered
  };
}

/**
 * 更新单词的复习状态
 * @param {number} wordId - 单词ID
 * @param {boolean} isCorrect - 是否答对
 * @param {string} quizType - 测验类型
 * @returns {Promise<Object>} 更新后的单词
 */
export async function updateWordReview(wordId, isCorrect, quizType) {
  const word = await db.vocabulary.get(wordId);
  if (!word) {
    throw new Error('单词不存在');
  }

  // 计算新的复习参数
  const { sm2, nextReview, mastered } = calculateNextReview(word, isCorrect);

  // 更新单词记录
  await db.vocabulary.update(wordId, {
    sm2,
    nextReview,
    mastered,
    reviewCount: (word.reviewCount || 0) + 1,
    updatedAt: new Date().toISOString()
  });

  // 记录复习历史
  await db.reviewHistory.add({
    wordId,
    quizType,
    isCorrect,
    reviewedAt: new Date().toISOString()
  });

  // 返回更新后的单词
  return await db.vocabulary.get(wordId);
}

/**
 * 获取待复习的单词列表
 * @param {number} limit - 最多返回数量
 * @returns {Promise<Array>} 待复习单词
 */
export async function getDueWords(limit = 20) {
  const now = new Date().toISOString();

  const allWords = await db.vocabulary.toArray();

  // 筛选待复习单词:
  // 1. 未掌握的
  // 2. nextReview <= 当前时间 或 没有nextReview(新词)
  const dueWords = allWords.filter(word => {
    if (word.mastered) return false;
    if (!word.nextReview) return true;
    return word.nextReview <= now;
  });

  // 排序: 优先复习逾期最久的
  dueWords.sort((a, b) => {
    if (!a.nextReview) return -1;
    if (!b.nextReview) return 1;
    return new Date(a.nextReview) - new Date(b.nextReview);
  });

  return dueWords.slice(0, limit);
}

/**
 * 获取单词的复习进度信息
 * @param {Object} word - 单词对象
 * @returns {Object} 进度信息
 */
export function getWordProgress(word) {
  const sm2 = word.sm2 || { ...DEFAULT_SM2_PARAMS };

  // 计算到掌握的进度百分比
  const repProgress = Math.min(sm2.repetitions / MASTERY_CONDITIONS.minRepetitions, 1);
  const easeProgress = Math.min((sm2.easiness - 1.3) / (MASTERY_CONDITIONS.minEasiness - 1.3), 1);
  const overallProgress = Math.round((repProgress * 0.7 + easeProgress * 0.3) * 100);

  return {
    easiness: sm2.easiness.toFixed(2),
    interval: sm2.interval,
    repetitions: sm2.repetitions,
    progress: overallProgress,
    mastered: word.mastered || false,
    nextReview: word.nextReview,
    reviewCount: word.reviewCount || 0
  };
}

/**
 * 初始化单词的SM2参数(首次添加时调用)
 * @param {Object} word - 单词对象
 * @returns {Object} 带SM2参数的单词
 */
export function initializeWordSM2(word) {
  return {
    ...word,
    sm2: { ...DEFAULT_SM2_PARAMS },
    nextReview: new Date().toISOString(), // 立即可复习
    mastered: false,
    reviewCount: 0
  };
}
