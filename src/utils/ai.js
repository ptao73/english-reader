import { db } from '../db/schema.js';

/**
 * AI分析服务 - 优化版
 * 实现三层缓存策略 + Stream 输出
 * L1: IndexedDB本地缓存
 * L2: GitHub云端缓存(未来实现)
 * L3: 实时AI调用 (支持流式输出)
 *
 * 所有 AI 请求通过 /api/ai 代理，密钥仅存于服务端
 */

const MODEL_SETTINGS_KEY = 'ai_model_preference';

/**
 * 核心Prompt: 句子三层分析
 */
const SENTENCE_ANALYSIS_PROMPT = (sentence) => `
请分三层分析这个英文句子,严格按照JSON格式输出:

句子: "${sentence}"

要求:
1. hint: 第一层提示 - 只给关键词、句型骨架,1-2行,帮助思考但不给答案
2. analysis: 第二层深度分析 - 语法结构、固定搭配、易错点,3-5段,不包含中文翻译
3. zh: 第三层中文翻译 - 准确、自然的中文

输出JSON格式:
{
  "hint": "...",
  "analysis": "...",
  "zh": "..."
}

示例:
{
  "hint": "主语: implementation | 谓语: has revolutionized | 句型: 现在完成时",
  "analysis": "语法结构:\\n- 主句: The implementation has revolutionized...\\n- 定语从句: the way (that) students learn\\n\\n重点词组:\\n- implementation of: ...的实施\\n- revolutionize: 彻底改变(比change更强烈)\\n\\n易错点:\\n- has revolutionized 用现在完成时,强调\\"已经产生的影响\\"",
  "zh": "人工智能在教育中的应用彻底改变了学生学习和与教育内容互动的方式。"
}

只输出JSON,不要其他内容。
`;

/**
 * 核心Prompt: 单词分析
 */
const WORD_ANALYSIS_PROMPT = (word, context) => `
请分析这个英文单词，严格按照JSON格式输出:

单词: "${word}"
${context ? `出现语境: "${context}"` : ''}

要求:
1. phonetic: 音标 (美式 IPA)
2. meanings: 释义数组，每个包含 { pos: 词性, def: 中文释义, defEn: 英文释义 }
3. etymology: 词源对象 { root: 词根, prefix: 前缀, suffix: 后缀, origin: 来源语言 }
4. examples: 例句数组 (2-3个真实例句)
5. collocations: 常见搭配数组 (3-5个)
6. synonyms: 同义词数组 (2-3个)
7. contextMeaning: 在给定语境中的具体含义 (如有语境)

输出JSON格式:
{
  "phonetic": "/wɜːrd/",
  "meanings": [
    { "pos": "n.", "def": "单词，词", "defEn": "a single unit of language" }
  ],
  "etymology": {
    "root": "word",
    "prefix": "",
    "suffix": "",
    "origin": "Old English"
  },
  "examples": ["This word is difficult to pronounce.", "Choose your words carefully."],
  "collocations": ["key word", "in other words", "word for word"],
  "synonyms": ["term", "expression"],
  "contextMeaning": "在此句中指..."
}

只输出JSON,不要其他内容。
`;

// 缓存模型可用性，避免每次都查询
let _modelStatus = null;
let _modelStatusFetchedAt = 0;
const MODEL_STATUS_TTL = 60000; // 1 分钟缓存

async function fetchModelStatus() {
  const now = Date.now();
  if (_modelStatus && now - _modelStatusFetchedAt < MODEL_STATUS_TTL) {
    return _modelStatus;
  }
  try {
    const res = await fetch('/api/ai?action=status');
    if (res.ok) {
      _modelStatus = await res.json();
      _modelStatusFetchedAt = now;
    }
  } catch {
    // 网络失败时使用上次缓存
  }
  return _modelStatus || { qwen: false, gemini: false };
}

async function getPreferredModel() {
  const record = await db.settings.get(MODEL_SETTINGS_KEY);
  const stored = record?.value;
  if (stored === 'gemini' || stored === 'qwen') return stored;
  const status = await fetchModelStatus();
  if (status.gemini) return 'gemini';
  return 'qwen';
}

async function setPreferredModel(model) {
  if (model !== 'gemini' && model !== 'qwen') return;
  await db.settings.put({ key: MODEL_SETTINGS_KEY, value: model });
}

function shouldFallback(err) {
  const msg = `${err?.message || ''}`.toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('socket')
  );
}

async function callGeminiAPI(prompt) {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: 'gemini' }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API调用失败: ${error.error || response.statusText}`);
  }

  return response.json();
}

async function callQwenAPI(prompt) {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: 'qwen' }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API调用失败: ${error.error || response.statusText}`);
  }

  return response.json();
}

async function callQwenAPIStream(prompt, onChunk) {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: 'qwen', stream: true }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API调用失败: ${error.error || response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';

  // 如果服务端回退到了非流式（如 Gemini fallback），直接解析 JSON
  if (contentType.includes('application/json')) {
    const result = await response.json();
    if (onChunk) {
      const fullText = JSON.stringify(result, null, 2);
      onChunk(fullText, fullText);
    }
    return result;
  }

  // SSE 流式读取
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((line) => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';
            if (content) {
              fullText += content;
              if (onChunk) {
                onChunk(content, fullText);
              }
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const cleanText = fullText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleanText);
}

async function callWithFallback(prompt) {
  const preferred = await getPreferredModel();
  const status = await fetchModelStatus();

  if (preferred === 'gemini') {
    try {
      return await callGeminiAPI(prompt);
    } catch (err) {
      if (!shouldFallback(err) && status.gemini) {
        throw err;
      }
      return await callQwenAPI(prompt);
    }
  }

  try {
    return await callQwenAPI(prompt);
  } catch (err) {
    if (!shouldFallback(err) && status.qwen) {
      throw err;
    }
    return await callGeminiAPI(prompt);
  }
}

async function callWithFallbackStream(prompt, onChunk) {
  const preferred = await getPreferredModel();
  const status = await fetchModelStatus();

  if (preferred === 'gemini') {
    try {
      const result = await callGeminiAPI(prompt);
      if (onChunk) {
        const fullText = JSON.stringify(result, null, 2);
        let index = 0;
        const interval = setInterval(() => {
          if (index >= fullText.length) {
            clearInterval(interval);
            return;
          }
          const chunk = fullText.slice(index, index + 10);
          index += 10;
          onChunk(chunk, fullText.slice(0, index));
        }, 20);
      }
      return result;
    } catch (err) {
      if (!shouldFallback(err) && status.gemini) {
        throw err;
      }
      return await callQwenAPIStream(prompt, onChunk);
    }
  }

  try {
    return await callQwenAPIStream(prompt, onChunk);
  } catch (err) {
    if (!shouldFallback(err) && status.qwen) {
      throw err;
    }
    const result = await callGeminiAPI(prompt);
    if (onChunk) {
      const fullText = JSON.stringify(result, null, 2);
      let index = 0;
      const interval = setInterval(() => {
        if (index >= fullText.length) {
          clearInterval(interval);
          return;
        }
        const chunk = fullText.slice(index, index + 10);
        index += 10;
        onChunk(chunk, fullText.slice(0, index));
      }, 20);
    }
    return result;
  }
}

/**
 * 获取句子分析(三层缓存) - 非流式版本
 * @param {string} sentenceId - 句子ID
 * @param {string} sentenceText - 句子文本
 * @returns {Promise<Object>} - {hint, analysis, zh}
 */
export async function getSentenceAnalysis(sentenceId, sentenceText) {
  // L1: 查询本地缓存
  const cached = await db.aiCache.get(sentenceId);
  if (cached) {
    console.log('✅ L1缓存命中:', sentenceId);
    return cached.data;
  }

  // L3: 调用AI
  console.log('🔄 调用AI分析:', sentenceId);
  const prompt = SENTENCE_ANALYSIS_PROMPT(sentenceText);
  const result = await callWithFallback(prompt);

  // 包装完整数据
  const analysisData = {
    sentenceId,
    text: sentenceText,
    hint: result.hint,
    analysis: result.analysis,
    zh: result.zh,
    cachedAt: new Date().toISOString()
  };

  // 写入L1缓存
  await db.aiCache.put({
    key: sentenceId,
    type: 'sentence',
    data: analysisData,
    createdAt: new Date().toISOString()
  });

  console.log('✅ 已缓存:', sentenceId);

  return analysisData;
}

/**
 * 获取句子分析(三层缓存) - 流式版本
 * @param {string} sentenceId - 句子ID
 * @param {string} sentenceText - 句子文本
 * @param {Function} onChunk - 流式回调函数 (chunk, fullText) => void
 * @returns {Promise<Object>} - {hint, analysis, zh}
 */
export async function getSentenceAnalysisStream(sentenceId, sentenceText, onChunk) {
  // L1: 查询本地缓存
  const cached = await db.aiCache.get(sentenceId);
  if (cached) {
    console.log('✅ L1缓存命中:', sentenceId);

    // 模拟流式输出缓存内容
    if (onChunk) {
      const fullText = JSON.stringify(cached.data, null, 2);
      let index = 0;
      const interval = setInterval(() => {
        if (index >= fullText.length) {
          clearInterval(interval);
          return;
        }
        const chunk = fullText.slice(index, index + 10);
        index += 10;
        onChunk(chunk, fullText.slice(0, index));
      }, 20);
    }

    return cached.data;
  }

  // L3: 调用AI (流式)
  console.log('🔄 调用AI分析(流式):', sentenceId);
  const prompt = SENTENCE_ANALYSIS_PROMPT(sentenceText);
  const result = await callWithFallbackStream(prompt, onChunk);

  // 包装完整数据
  const analysisData = {
    sentenceId,
    text: sentenceText,
    hint: result.hint,
    analysis: result.analysis,
    zh: result.zh,
    cachedAt: new Date().toISOString()
  };

  // 写入L1缓存
  await db.aiCache.put({
    key: sentenceId,
    type: 'sentence',
    data: analysisData,
    createdAt: new Date().toISOString()
  });

  console.log('✅ 已缓存:', sentenceId);

  return analysisData;
}

/**
 * 获取单词分析 (完整实现)
 * @param {string} word - 单词
 * @param {string} context - 出现的上下文句子 (可选)
 * @returns {Promise<Object>} - 完整的单词分析结果
 * @throws {Error} 当单词为空或 API 调用失败时抛出错误
 */
export async function getWordAnalysis(word, context = '') {
  // Guard Clause: 参数校验
  if (!word || typeof word !== 'string') {
    throw new Error('单词参数不能为空');
  }

  const cleanWord = word.toLowerCase().trim();

  // Guard Clause: 清理后仍为空则抛出错误
  if (!cleanWord || cleanWord.length < 1) {
    throw new Error('无效的单词');
  }

  const cacheKey = `word:${cleanWord}`;

  try {
    // L1: 查询本地缓存
    const cached = await db.aiCache.get(cacheKey);
    if (cached) {
      console.log('✅ 单词缓存命中:', cleanWord);
      return cached.data;
    }

    // L3: 调用AI
    console.log('🔄 调用AI分析单词:', cleanWord);
    const prompt = WORD_ANALYSIS_PROMPT(word, context);
    const result = await callWithFallback(prompt);

    // 包装完整数据
    const wordData = {
      word: cleanWord,
      originalWord: word,
      phonetic: result.phonetic || '',
      meanings: result.meanings || [],
      etymology: result.etymology || {},
      examples: result.examples || [],
      collocations: result.collocations || [],
      synonyms: result.synonyms || [],
      contextMeaning: result.contextMeaning || '',
      context: context,
      cachedAt: new Date().toISOString()
    };

    // 写入L1缓存
    await db.aiCache.put({
      key: cacheKey,
      type: 'word',
      data: wordData,
      createdAt: new Date().toISOString()
    });

    console.log('✅ 单词已缓存:', cleanWord);

    return wordData;
  } catch (err) {
    console.error('单词分析失败:', cleanWord, err);
    throw new Error(`分析单词 "${cleanWord}" 失败: ${err.message}`);
  }
}

/**
 * 清理缓存
 */
export async function clearCache() {
  await db.aiCache.clear();
  console.log('✅ 缓存已清空');
}

/**
 * 获取缓存统计
 */
export async function getCacheStats() {
  const sentenceCacheCount = await db.aiCache.where('type').equals('sentence').count();
  const wordCacheCount = await db.aiCache.where('type').equals('word').count();

  return {
    sentences: sentenceCacheCount,
    words: wordCacheCount,
    total: sentenceCacheCount + wordCacheCount
  };
}

export async function getAiModelPreference() {
  return await getPreferredModel();
}

export async function setAiModelPreference(model) {
  return await setPreferredModel(model);
}

export { fetchModelStatus };
