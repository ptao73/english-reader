/**
 * 测验生成器
 * 生成不同类型的词汇测验题目
 *
 * 测验类型:
 * 1. zhToEn: 中→英 - 显示中文释义，选择英文单词
 * 2. enToZh: 英→中 - 显示英文单词，选择中文释义
 * 3. fillBlank: 填空 - 例句挖空，填入单词
 * 4. context: 语境 - 显示原文语境，回忆含义
 */

import { db } from '../db/schema.js';

/**
 * 测验类型枚举
 */
export const QuizTypes = {
  ZH_TO_EN: 'zhToEn',
  EN_TO_ZH: 'enToZh',
  FILL_BLANK: 'fillBlank',
  CONTEXT: 'context'
};

/**
 * 打乱数组顺序
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 获取随机干扰项
 * @param {Array} allWords - 所有单词
 * @param {Object} targetWord - 目标单词(需排除)
 * @param {number} count - 干扰项数量
 * @returns {Array} 干扰项单词
 */
function getDistractors(allWords, targetWord, count = 3) {
  const others = allWords.filter(w => w.id !== targetWord.id);
  const shuffled = shuffleArray(others);
  return shuffled.slice(0, count);
}

/**
 * 获取单词的主要释义
 */
function getPrimaryMeaning(word) {
  if (word.meanings && word.meanings.length > 0) {
    const m = word.meanings[0];
    return m.def || m.defEn || '暂无释义';
  }
  return '暂无释义';
}

/**
 * 生成中→英测验
 * 显示中文释义，选择正确的英文单词
 */
function generateZhToEnQuiz(word, allWords) {
  const distractors = getDistractors(allWords, word, 3);
  const options = shuffleArray([
    { id: word.id, text: word.word, isCorrect: true },
    ...distractors.map(d => ({
      id: d.id,
      text: d.word,
      isCorrect: false
    }))
  ]);

  return {
    type: QuizTypes.ZH_TO_EN,
    wordId: word.id,
    question: getPrimaryMeaning(word),
    hint: word.phonetic || null,
    options,
    correctAnswer: word.word
  };
}

/**
 * 生成英→中测验
 * 显示英文单词，选择正确的中文释义
 */
function generateEnToZhQuiz(word, allWords) {
  const distractors = getDistractors(allWords, word, 3);
  const options = shuffleArray([
    { id: word.id, text: getPrimaryMeaning(word), isCorrect: true },
    ...distractors.map(d => ({
      id: d.id,
      text: getPrimaryMeaning(d),
      isCorrect: false
    }))
  ]);

  return {
    type: QuizTypes.EN_TO_ZH,
    wordId: word.id,
    question: word.word,
    hint: word.phonetic || null,
    options,
    correctAnswer: getPrimaryMeaning(word)
  };
}

/**
 * 生成填空测验
 * 例句中挖空，填入正确单词
 */
function generateFillBlankQuiz(word, allWords) {
  // 获取例句
  let sentence = '';
  if (word.examples && word.examples.length > 0) {
    sentence = word.examples[0];
  } else if (word.context) {
    sentence = word.context;
  } else {
    // 没有例句，降级为英→中
    return generateEnToZhQuiz(word, allWords);
  }

  // 创建挖空句子 (用 _____ 替换单词)
  const wordPattern = new RegExp(`\\b${word.word}\\b`, 'gi');
  const blankSentence = sentence.replace(wordPattern, '_____');

  // 如果没有成功替换(单词不在句子中)，降级
  if (blankSentence === sentence) {
    return generateEnToZhQuiz(word, allWords);
  }

  const distractors = getDistractors(allWords, word, 3);
  const options = shuffleArray([
    { id: word.id, text: word.word, isCorrect: true },
    ...distractors.map(d => ({
      id: d.id,
      text: d.word,
      isCorrect: false
    }))
  ]);

  return {
    type: QuizTypes.FILL_BLANK,
    wordId: word.id,
    question: blankSentence,
    hint: getPrimaryMeaning(word),
    options,
    correctAnswer: word.word
  };
}

/**
 * 生成语境测验
 * 显示收藏时的语境，回忆单词含义
 */
function generateContextQuiz(word, allWords) {
  // 需要有语境信息
  if (!word.context) {
    // 没有语境，降级为英→中
    return generateEnToZhQuiz(word, allWords);
  }

  const distractors = getDistractors(allWords, word, 3);
  const options = shuffleArray([
    { id: word.id, text: getPrimaryMeaning(word), isCorrect: true },
    ...distractors.map(d => ({
      id: d.id,
      text: getPrimaryMeaning(d),
      isCorrect: false
    }))
  ]);

  return {
    type: QuizTypes.CONTEXT,
    wordId: word.id,
    question: word.context,
    targetWord: word.word,
    hint: word.contextMeaning || null,
    options,
    correctAnswer: getPrimaryMeaning(word)
  };
}

/**
 * 为单个单词生成测验
 * 随机选择测验类型
 */
export function generateQuizForWord(word, allWords) {
  // 根据单词可用信息决定可用的测验类型
  const availableTypes = [QuizTypes.ZH_TO_EN, QuizTypes.EN_TO_ZH];

  if (word.examples?.length > 0 || word.context) {
    availableTypes.push(QuizTypes.FILL_BLANK);
  }

  if (word.context) {
    availableTypes.push(QuizTypes.CONTEXT);
  }

  // 随机选择一种类型
  const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)];

  switch (randomType) {
    case QuizTypes.ZH_TO_EN:
      return generateZhToEnQuiz(word, allWords);
    case QuizTypes.EN_TO_ZH:
      return generateEnToZhQuiz(word, allWords);
    case QuizTypes.FILL_BLANK:
      return generateFillBlankQuiz(word, allWords);
    case QuizTypes.CONTEXT:
      return generateContextQuiz(word, allWords);
    default:
      return generateEnToZhQuiz(word, allWords);
  }
}

/**
 * 为一批单词生成测验
 * @param {Array} words - 待测验单词
 * @returns {Promise<Array>} 测验题目数组
 */
export async function generateQuizBatch(words) {
  // 获取所有单词用于生成干扰项
  const allWords = await db.vocabulary.toArray();

  // 确保至少有4个单词才能生成有效测验
  if (allWords.length < 4) {
    throw new Error('词汇表单词数量不足，至少需要4个单词');
  }

  return words.map(word => generateQuizForWord(word, allWords));
}

/**
 * 获取测验类型的显示名称
 */
export function getQuizTypeName(type) {
  switch (type) {
    case QuizTypes.ZH_TO_EN:
      return '中→英';
    case QuizTypes.EN_TO_ZH:
      return '英→中';
    case QuizTypes.FILL_BLANK:
      return '填空';
    case QuizTypes.CONTEXT:
      return '语境';
    default:
      return '未知';
  }
}

/**
 * 获取测验类型的图标
 */
export function getQuizTypeIcon(type) {
  switch (type) {
    case QuizTypes.ZH_TO_EN:
      return '🇨🇳→🇺🇸';
    case QuizTypes.EN_TO_ZH:
      return '🇺🇸→🇨🇳';
    case QuizTypes.FILL_BLANK:
      return '📝';
    case QuizTypes.CONTEXT:
      return '📖';
    default:
      return '❓';
  }
}
