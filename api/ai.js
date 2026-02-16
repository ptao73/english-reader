const QWEN_API_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export default async function handler(req, res) {
  // GET /api/ai?action=status — 返回可用模型
  if (req.method === 'GET') {
    const action = req.query?.action;
    if (action === 'status') {
      return res.status(200).json({
        qwen: !!process.env.QWEN_API_KEY,
        gemini: !!process.env.GOOGLE_API_KEY,
      });
    }
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt, model, stream } = req.body || {};

  if (!prompt) {
    return res.status(400).json({ error: '缺少 prompt 参数' });
  }

  try {
    if (stream) {
      return await handleStream(req, res, prompt, model);
    }
    return await handleNonStream(req, res, prompt, model);
  } catch (err) {
    console.error('AI proxy error:', err);
    return res.status(500).json({ error: err.message || 'AI 调用失败' });
  }
}

async function handleNonStream(req, res, prompt, model) {
  if (model === 'gemini') {
    const result = await callGemini(prompt);
    return res.status(200).json(result);
  }
  // default: qwen
  const result = await callQwen(prompt);
  return res.status(200).json(result);
}

async function handleStream(req, res, prompt, model) {
  if (model === 'gemini') {
    // Gemini 不支持原生流式，回退到非流式
    const result = await callGemini(prompt);
    return res.status(200).json(result);
  }

  // Qwen 流式
  const apiKey = process.env.QWEN_API_KEY;
  const qwenModel = process.env.QWEN_MODEL || 'qwen-plus';

  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 QWEN_API_KEY' });
  }

  const response = await fetch(QWEN_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: qwenModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1500,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Qwen API ${response.status}`);
  }

  // SSE 透传
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  res.end();
}

async function callQwen(prompt) {
  const apiKey = process.env.QWEN_API_KEY;
  const model = process.env.QWEN_MODEL || 'qwen-plus';

  if (!apiKey) {
    throw new Error('服务端未配置 QWEN_API_KEY');
  }

  const response = await fetch(QWEN_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Qwen API ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  if (!text) throw new Error('AI 返回为空');

  const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleanText);
}

async function callGemini(prompt) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  if (!apiKey) {
    throw new Error('服务端未配置 GOOGLE_API_KEY');
  }

  const response = await fetch(
    `${GEMINI_API_ENDPOINT}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
      }),
    }
  );

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const error = await response.json();
      errorMessage = error.error?.message || errorMessage;
    } catch {}
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';

  if (!text) throw new Error('AI 返回为空');

  const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleanText);
}
