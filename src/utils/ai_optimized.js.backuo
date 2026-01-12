import { db } from '../db/schema.js';

/**
 * AI分析服务 - 阿里云 Qwen 版本
 * 实现三层缓存策略:
 * L1: IndexedDB本地缓存
 * L2: GitHub云端缓存(未来实现)
 * L3: 实时AI调用
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
 * 调用阿里云 Qwen API
 */
async function callQwenAPI(prompt) {
  if (!QWEN_API_KEY) {
    throw new Error('未配置QWEN_API_KEY,请在.env文件中设置VITE_QWEN_API_KEY');
  }

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${QWEN_API_KEY}`
      },
      body: JSON.stringify({
        model: 'qwen-plus',  // 可选: qwen-turbo, qwen-plus, qwen-max
        messages: [
          {
            role: 'system',
            content: '你是一个专业的英语教学助手，擅长分析英语句子的语法结构和含义。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: 'json_object' }  // 强制JSON输出
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API错误响应:', errorText);
      throw new Error(`API调用失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Qwen API 响应:', data);

    // Qwen API 的响应格式
    const text = data.choices[0].message.content;
    
    // 解析JSON响应
    try {
      // 去除可能的markdown代码块标记
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanText);
      
      // 验证必需字段
      if (!parsed.hint || !parsed.analysis || !parsed.zh) {
        throw new Error('AI返回的JSON缺少必需字段');
      }
      
      return parsed;
    } catch (e) {
      console.error('JSON解析失败:', text);
      throw new Error('AI返回格式错误: ' + e.message);
    }
  } catch (error) {
    console.error('Qwen API 调用失败:', error);
    throw error;
  }
}

/**
 * 获取句子分析(三层缓存)
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
  console.log('🔄 调用Qwen分析:', sentenceId);
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
