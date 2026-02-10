import { useState, useEffect } from 'react';
import { getAllStats, getRecentDailyStats } from '../utils/statistics.js';
import Icon from './Icon.jsx';
import './Statistics.css';

/**
 * 学习统计面板组件
 */
export default function Statistics({ onBack }) {
  const [stats, setStats] = useState(null);
  const [dailyStats, setDailyStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const [allStats, daily] = await Promise.all([
        getAllStats(),
        getRecentDailyStats(7)
      ]);
      setStats(allStats);
      setDailyStats(daily);
    } catch (err) {
      console.error('加载统计失败:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="statistics-page">
        <div className="stats-toolbar">
          <button className="btn-back" onClick={onBack}>
            ← 返回
          </button>
          <h1>学习统计</h1>
        </div>
        <div className="loading">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="statistics-page">
      {/* 顶部工具栏 */}
        <div className="stats-toolbar">
          <button className="btn-back" onClick={onBack}>
            ← 返回
          </button>
          <h1>学习统计</h1>
          <button className="btn-refresh" onClick={loadStats} aria-label="刷新">
            <Icon name="refresh" size={18} />
          </button>
        </div>

      {/* 统计卡片区域 */}
      <div className="stats-grid">
        {/* 阅读统计 */}
        <div className="stats-card reading-card">
          <h2>阅读统计</h2>
          <div className="stats-items">
            <div className="stat-item">
              <span className="stat-value">{stats?.reading.totalArticles || 0}</span>
              <span className="stat-label">导入文章</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats?.reading.completedArticles || 0}</span>
              <span className="stat-label">已完成</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats?.reading.analyzedSentences || 0}</span>
              <span className="stat-label">分析句子</span>
            </div>
          </div>
        </div>

        {/* 词汇统计 */}
        <div className="stats-card vocabulary-card">
          <h2>词汇统计</h2>
          <div className="stats-items">
            <div className="stat-item">
              <span className="stat-value">{stats?.vocabulary.totalWords || 0}</span>
              <span className="stat-label">收集单词</span>
            </div>
            <div className="stat-item highlight">
              <span className="stat-value">{stats?.vocabulary.masteredWords || 0}</span>
              <span className="stat-label">已掌握</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats?.vocabulary.masteredPercentage || 0}%</span>
              <span className="stat-label">掌握率</span>
            </div>
            <div className="stat-item warning">
              <span className="stat-value">{stats?.vocabulary.dueForReview || 0}</span>
              <span className="stat-label">待复习</span>
            </div>
          </div>
          {/* 掌握进度条 */}
          {stats?.vocabulary.totalWords > 0 && (
            <div className="progress-section">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${stats.vocabulary.masteredPercentage}%` }}
                />
              </div>
              <span className="progress-text">
                {stats.vocabulary.masteredWords} / {stats.vocabulary.totalWords} 已掌握
              </span>
            </div>
          )}
        </div>

        {/* 复习统计 */}
        <div className="stats-card review-card">
          <h2>复习统计</h2>
          <div className="stats-items">
            <div className="stat-item">
              <span className="stat-value">{stats?.review.totalReviews || 0}</span>
              <span className="stat-label">总复习次数</span>
            </div>
            <div className="stat-item highlight">
              <span className="stat-value">{stats?.review.accuracy || 0}%</span>
              <span className="stat-label">正确率</span>
            </div>
          </div>
          {/* 今日复习 */}
          <div className="today-section">
            <h3>今日复习</h3>
            <div className="today-stats">
              <span className="today-value">{stats?.review.todayTotal || 0}</span>
              <span className="today-label">次</span>
              {stats?.review.todayTotal > 0 && (
                <span className="today-accuracy">
                  ({stats?.review.todayCorrect || 0} 正确)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 最近7天趋势 */}
      <div className="daily-trend">
        <h2>最近7天活动</h2>
        <div className="trend-chart">
          {dailyStats.map((day, index) => {
            const maxValue = Math.max(
              ...dailyStats.map(d => d.wordsCollected + d.reviewCount),
              1
            );
            const value = day.wordsCollected + day.reviewCount;
            const height = (value / maxValue) * 100;

            return (
              <div key={index} className="trend-bar-container">
                <div className="trend-bar" style={{ height: `${Math.max(height, 5)}%` }}>
                  <span className="trend-value">{value}</span>
                </div>
                <span className="trend-date">
                  {new Date(day.date).toLocaleDateString('zh-CN', { weekday: 'short' })}
                </span>
              </div>
            );
          })}
        </div>
        <div className="trend-legend">
          <span>* 柱状图显示 (新词 + 复习) 总数</span>
        </div>
      </div>

      {/* 学习提示 */}
      <div className="learning-tips">
        <h2>学习建议</h2>
        <div className="tips-content">
          {stats?.vocabulary.dueForReview > 0 && (
            <div className="tip warning">
              您有 <strong>{stats.vocabulary.dueForReview}</strong> 个单词待复习，建议现在开始复习!
            </div>
          )}
          {stats?.vocabulary.masteredPercentage < 30 && stats?.vocabulary.totalWords > 10 && (
            <div className="tip info">
              继续加油! 多使用复习功能可以帮助记忆更多单词。
            </div>
          )}
          {stats?.review.accuracy < 60 && stats?.review.totalReviews > 20 && (
            <div className="tip warning">
              正确率偏低，建议放慢复习节奏，确保理解每个单词。
            </div>
          )}
          {stats?.reading.totalArticles === 0 && (
            <div className="tip info">
              开始导入第一篇文章，开启学习之旅吧!
            </div>
          )}
          {stats?.vocabulary.totalWords === 0 && stats?.reading.totalArticles > 0 && (
            <div className="tip info">
              在阅读时点击不认识的单词，将它们添加到词汇表中。
            </div>
          )}
          {!stats?.vocabulary.dueForReview && stats?.vocabulary.totalWords > 0 && stats?.review.totalReviews > 0 && (
            <div className="tip success">
              所有单词都已复习完毕，继续保持!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
