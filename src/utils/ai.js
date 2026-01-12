import { db } from '../db/schema.js';

/**
 * AI分析服务 - 优化版
 * 实现三层缓存策略 + Stream 输出
 * L1: IndexedDB本地缓存
 * L2: GitHub云端缓存(未来实现)
 * L3: 实时AI调用 (支持流式输出)
 */

const QWEN_API_KEY = import.meta.env.VITE_QWEN_API_KEY || '';
const API_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

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
 * 调用通义千问 API (非流式)
 */
async function callQwenAPI(prompt) {
  if (!QWEN_API_KEY) {
    throw new Error('未配置QWEN_API_KEY,请在.env文件中设置VITE_QWEN_API_KEY');
  }

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_API_KEY}`
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API调用失败: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices[0].message.content;
  
  // 解析JSON响应
  try {
    // 去除可能的markdown代码块标记
    const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanText);
  } catch (e) {
    console.error('JSON解析失败:', text);
    throw new Error('AI返回格式错误');
  }
}

/**
 * 调用通义千问 API (流式输出) ⭐ 新增
 * @param {string} prompt - 提示词
 * @param {Function} onChunk - 接收流式数据的回调函数
 * @returns {Promise<Object>} - 完整的分析结果
 */
async function callQwenAPIStream(prompt, onChunk) {
  if (!QWEN_API_KEY) {
    throw new Error('未配置QWEN_API_KEY,请在.env文件中设置VITE_QWEN_API_KEY');
  }

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${QWEN_API_KEY}`
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500,
      stream: true  // 启用流式输出
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API调用失败: ${error.error?.message || response.statusText}`);
  }

  // 读取流式响应
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';
            
            if (content) {
              fullText += content;
              
              // 回调给前端显示
              if (onChunk) {
                onChunk(content, fullText);
              }
            }
          } catch (e) {
            console.warn('解析流式数据失败:', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // 解析完整JSON
  try {
    const cleanText = fullText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanText);
  } catch (e) {
    console.error('JSON解析失败:', fullText);
    throw new Error('AI返回格式错误');
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

  // L2: 查询GitHub缓存(未来实现)
  // TODO: 实现GitHub缓存查询

  // L3: 调用AI
  console.log('🔄 调用AI分析:', sentenceId);
  const prompt = SENTENCE_ANALYSIS_PROMPT(sentenceText);
  const result = await callQwenAPI(prompt);

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
 * 获取句子分析(三层缓存) - 流式版本 ⭐ 新增
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

  // L2: 查询GitHub缓存(未来实现)
  // TODO: 实现GitHub缓存查询

  // L3: 调用AI (流式)
  console.log('🔄 调用AI分析(流式):', sentenceId);
  const prompt = SENTENCE_ANALYSIS_PROMPT(sentenceText);
  const result = await callQwenAPIStream(prompt, onChunk);

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
 * 获取单词分析(未来实现)
 */
export async function getWordAnalysis(word) {
  // 类似逻辑
  const cached = await db.aiCache.get(word);
  if (cached) {
    return cached.data;
  }

  // TODO: 实现单词分析prompt
  const result = {
    word,
    definition: '待实现',
    etymology: {},
    examples: []
  };

  await db.aiCache.put({
    key: word,
    type: 'word',
    data: result,
    createdAt: new Date().toISOString()
  });

  return result;
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
