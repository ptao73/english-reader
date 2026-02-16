/**
 * OpenAI TTS 后端代理
 * 保护 API Key 不暴露给浏览器
 *
 * GET  /api/tts?action=status  -> { available: true/false }
 * POST /api/tts                -> 返回 mp3 音频 Buffer
 */

const OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';

export default async function handler(req, res) {
  // GET /api/tts?action=status — 检查是否配置了 OpenAI API Key
  if (req.method === 'GET') {
    const action = req.query?.action;
    if (action === 'status') {
      return res.status(200).json({
        available: !!process.env.OPENAI_API_KEY,
      });
    }
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 OPENAI_API_KEY' });
  }

  const { text, voice, model, speed } = req.body || {};

  if (!text) {
    return res.status(400).json({ error: '缺少 text 参数' });
  }

  // 限制文本长度，防止滥用
  if (text.length > 4096) {
    return res.status(400).json({ error: '文本过长（最多 4096 字符）' });
  }

  try {
    const ttsModel = model || process.env.OPENAI_TTS_MODEL || 'tts-1';

    const response = await fetch(OPENAI_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ttsModel,
        voice: voice || 'nova',
        input: text,
        speed: speed || 1.0,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `OpenAI TTS API ${response.status}`);
    }

    // 将音频数据以 Buffer 形式返回
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('TTS proxy error:', err);
    return res.status(500).json({ error: err.message || 'TTS 调用失败' });
  }
}
