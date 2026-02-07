/**
 * 学习统计工具
 * 计算和聚合各类学习数据
 */

import { db } from '../db/schema.js';

/**
 * 获取今天的日期字符串 (YYYY-MM-DD)
 */
export function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * 获取阅读统计
 * @returns {Promise<Object>} 阅读相关统计
 */
export async function getReadingStats() {
  try {
    // 导入文章总数
    const totalArticles = await db.articles.count();

    // 获取所有进度记录
    const allProgress = await db.progress.toArray();

    // 完成阅读的文章数 (进度 >= 100%)
    const completedArticles = allProgress.filter(p => p.percentage >= 100).length;

    // 计算已分析句子数 (通过 revealState 表统计)
    const analyzedSentences = await db.revealState.count();

    return {
      totalArticles,
      completedArticles,
      analyzedSentences
    };
  } catch (err) {
    console.error('获取阅读统计失败:', err);
    return {
      totalArticles: 0,
      completedArticles: 0,
      analyzedSentences: 0
    };
  }
}

/**
 * 获取词汇统计
 * @returns {Promise<Object>} 词汇相关统计
 */
export async function getVocabularyStats() {
  try {
    const allWords = await db.vocabulary.toArray();
    const totalWords = allWords.length;
    const masteredWords = allWords.filter(w => w.mastered).length;
    const masteredPercentage = totalWords > 0
      ? Math.round((masteredWords / totalWords) * 100)
      : 0;

    // 今日待复习数量 (nextReview <= 今天)
    const now = new Date().toISOString();
    const dueForReview = allWords.filter(w => {
      if (!w.nextReview || w.mastered) return false;
      return w.nextReview <= now;
    }).length;

    return {
      totalWords,
      masteredWords,
      masteredPercentage,
      dueForReview
    };
  } catch (err) {
    console.error('获取词汇统计失败:', err);
    return {
      totalWords: 0,
      masteredWords: 0,
      masteredPercentage: 0,
      dueForReview: 0
    };
  }
}

/**
 * 获取复习统计
 * @returns {Promise<Object>} 复习相关统计
 */
export async function getReviewStats() {
  try {
    const allReviews = await db.reviewHistory.toArray();
    const totalReviews = allReviews.length;
    const correctReviews = allReviews.filter(r => r.isCorrect).length;
    const accuracy = totalReviews > 0
      ? Math.round((correctReviews / totalReviews) * 100)
      : 0;

    // 今日复习统计
    const today = getTodayDateString();
    const todayReviews = allReviews.filter(r =>
      r.reviewedAt && r.reviewedAt.startsWith(today)
    );
    const todayTotal = todayReviews.length;
    const todayCorrect = todayReviews.filter(r => r.isCorrect).length;

    return {
      totalReviews,
      correctReviews,
      accuracy,
      todayTotal,
      todayCorrect
    };
  } catch (err) {
    console.error('获取复习统计失败:', err);
    return {
      totalReviews: 0,
      correctReviews: 0,
      accuracy: 0,
      todayTotal: 0,
      todayCorrect: 0
    };
  }
}

/**
 * 获取所有统计数据
 * @returns {Promise<Object>} 所有统计
 */
export async function getAllStats() {
  const [reading, vocabulary, review] = await Promise.all([
    getReadingStats(),
    getVocabularyStats(),
    getReviewStats()
  ]);

  return {
    reading,
    vocabulary,
    review
  };
}

/**
 * 记录今日学习活动
 * @param {string} activityType - 活动类型
 * @param {number} count - 数量
 */
export async function recordActivity(activityType, count = 1) {
  const today = getTodayDateString();

  try {
    let stats = await db.learningStats.get(today);

    if (!stats) {
      stats = {
        date: today,
        articlesImported: 0,
        sentencesRead: 0,
        wordsCollected: 0,
        reviewCount: 0,
        correctCount: 0
      };
    }

    switch (activityType) {
      case 'article_imported':
        stats.articlesImported += count;
        break;
      case 'sentence_read':
        stats.sentencesRead += count;
        break;
      case 'word_collected':
        stats.wordsCollected += count;
        break;
      case 'review':
        stats.reviewCount += count;
        break;
      case 'correct':
        stats.correctCount += count;
        break;
    }

    await db.learningStats.put(stats);
  } catch (err) {
    console.error('记录活动失败:', err);
  }
}

/**
 * 获取最近N天的学习统计
 * @param {number} days - 天数
 * @returns {Promise<Array>} 每日统计数组
 */
export async function getRecentDailyStats(days = 7) {
  try {
    const stats = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayStat = await db.learningStats.get(dateStr);
      stats.push({
        date: dateStr,
        ...(dayStat || {
          articlesImported: 0,
          sentencesRead: 0,
          wordsCollected: 0,
          reviewCount: 0,
          correctCount: 0
        })
      });
    }

    return stats.reverse(); // 从早到晚排序
  } catch (err) {
    console.error('获取每日统计失败:', err);
    return [];
  }
}
