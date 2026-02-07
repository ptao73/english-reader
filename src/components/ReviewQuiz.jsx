import { useState, useEffect } from 'react';
import { getDueWords, updateWordReview, getWordProgress } from '../utils/spacedRepetition.js';
import { generateQuizBatch, getQuizTypeName, getQuizTypeIcon } from '../utils/quizGenerator.js';
import { tts } from '../utils/tts.js';
import './ReviewQuiz.css';

/**
 * 词汇复习测验组件
 */
export default function ReviewQuiz({ onClose, onComplete }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [results, setResults] = useState([]);
  const [quizComplete, setQuizComplete] = useState(false);

  useEffect(() => {
    loadQuizzes();
  }, []);

  async function loadQuizzes() {
    setLoading(true);
    setError(null);
    try {
      // 获取待复习单词
      const dueWords = await getDueWords(10);

      if (dueWords.length === 0) {
        setError('没有待复习的单词');
        setLoading(false);
        return;
      }

      // 生成测验题目
      const quizBatch = await generateQuizBatch(dueWords);
      setQuizzes(quizBatch);
    } catch (err) {
      console.error('加载测验失败:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function speakWord(text) {
    tts.speak(text, { rate: 0.8 });
  }

  async function handleOptionSelect(option) {
    if (showResult) return; // 已显示结果，不可再选

    setSelectedOption(option);
    setShowResult(true);

    const currentQuiz = quizzes[currentIndex];
    const isCorrect = option.isCorrect;

    // 更新复习记录
    try {
      await updateWordReview(currentQuiz.wordId, isCorrect, currentQuiz.type);
    } catch (err) {
      console.error('更新复习记录失败:', err);
    }

    // 记录结果
    setResults(prev => [...prev, {
      wordId: currentQuiz.wordId,
      word: currentQuiz.correctAnswer,
      type: currentQuiz.type,
      isCorrect
    }]);
  }

  function handleNext() {
    if (currentIndex < quizzes.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setShowResult(false);
    } else {
      // 测验完成
      setQuizComplete(true);
    }
  }

  function handleFinish() {
    if (onComplete) {
      onComplete(results);
    }
    onClose();
  }

  // 加载中
  if (loading) {
    return (
      <div className="review-quiz-overlay">
        <div className="review-quiz-panel">
          <div className="quiz-loading">
            <div className="spinner"></div>
            <p>正在准备测验...</p>
          </div>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="review-quiz-overlay">
        <div className="review-quiz-panel">
          <div className="quiz-error">
            <div className="error-icon">📭</div>
            <h2>{error}</h2>
            <p>继续阅读并收集更多单词，或等待复习时间到达。</p>
            <button className="btn-close-quiz" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 测验完成
  if (quizComplete) {
    const correctCount = results.filter(r => r.isCorrect).length;
    const accuracy = Math.round((correctCount / results.length) * 100);

    return (
      <div className="review-quiz-overlay">
        <div className="review-quiz-panel">
          <div className="quiz-complete">
            <div className="complete-icon">
              {accuracy >= 80 ? '🎉' : accuracy >= 60 ? '👍' : '💪'}
            </div>
            <h2>复习完成!</h2>

            <div className="complete-stats">
              <div className="stat">
                <span className="value">{results.length}</span>
                <span className="label">总题数</span>
              </div>
              <div className="stat correct">
                <span className="value">{correctCount}</span>
                <span className="label">正确</span>
              </div>
              <div className="stat">
                <span className="value">{accuracy}%</span>
                <span className="label">正确率</span>
              </div>
            </div>

            {/* 错误单词回顾 */}
            {results.filter(r => !r.isCorrect).length > 0 && (
              <div className="wrong-words">
                <h3>需要加强的单词:</h3>
                <div className="wrong-list">
                  {results.filter(r => !r.isCorrect).map((r, i) => (
                    <span key={i} className="wrong-word">{r.word}</span>
                  ))}
                </div>
              </div>
            )}

            <button className="btn-finish" onClick={handleFinish}>
              完成
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 当前题目
  const currentQuiz = quizzes[currentIndex];

  return (
    <div className="review-quiz-overlay">
      <div className="review-quiz-panel">
        {/* 顶部进度 */}
        <div className="quiz-header">
          <div className="quiz-progress">
            <span className="progress-text">
              {currentIndex + 1} / {quizzes.length}
            </span>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${((currentIndex + 1) / quizzes.length) * 100}%` }}
              />
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* 题目类型标签 */}
        <div className="quiz-type-badge">
          {getQuizTypeIcon(currentQuiz.type)} {getQuizTypeName(currentQuiz.type)}
        </div>

        {/* 题目内容 */}
        <div className="quiz-question">
          {currentQuiz.type === 'context' && currentQuiz.targetWord && (
            <div className="target-word">
              单词: <strong>{currentQuiz.targetWord}</strong>
              <button
                className="btn-speak-mini"
                onClick={() => speakWord(currentQuiz.targetWord)}
              >
                🔊
              </button>
            </div>
          )}

          <p className="question-text">{currentQuiz.question}</p>

          {currentQuiz.hint && !showResult && (
            <p className="question-hint">💡 {currentQuiz.hint}</p>
          )}
        </div>

        {/* 选项 */}
        <div className="quiz-options">
          {currentQuiz.options.map((option, index) => {
            let optionClass = 'option-btn';

            if (showResult) {
              if (option.isCorrect) {
                optionClass += ' correct';
              } else if (selectedOption?.id === option.id) {
                optionClass += ' wrong';
              }
            } else if (selectedOption?.id === option.id) {
              optionClass += ' selected';
            }

            return (
              <button
                key={index}
                className={optionClass}
                onClick={() => handleOptionSelect(option)}
                disabled={showResult}
              >
                <span className="option-letter">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="option-text">{option.text}</span>
                {showResult && option.isCorrect && (
                  <span className="option-icon">✓</span>
                )}
                {showResult && selectedOption?.id === option.id && !option.isCorrect && (
                  <span className="option-icon">✗</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 结果反馈 */}
        {showResult && (
          <div className={`quiz-feedback ${selectedOption?.isCorrect ? 'correct' : 'wrong'}`}>
            {selectedOption?.isCorrect ? (
              <p>✅ 正确!</p>
            ) : (
              <p>❌ 错误! 正确答案是: <strong>{currentQuiz.correctAnswer}</strong></p>
            )}
          </div>
        )}

        {/* 下一题按钮 */}
        {showResult && (
          <div className="quiz-actions">
            <button className="btn-next" onClick={handleNext}>
              {currentIndex < quizzes.length - 1 ? '下一题 →' : '查看结果'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
