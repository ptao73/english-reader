import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import dns from 'node:dns/promises';

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const TIMEOUT_MS = 10000;

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPrivateIp(ip) {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('127.') ||
    ip.startsWith('169.254.') ||
    ip.startsWith('::1') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    (ip.startsWith('172.') && (() => {
      const p = Number(ip.split('.')[1]);
      return p >= 16 && p <= 31;
    })())
  );
}

async function isBlockedHost(hostname) {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) {
    return isPrivateIp(lower);
  }
  try {
    const results = await dns.lookup(lower, { all: true });
    return results.some(r => isPrivateIp(r.address));
  } catch {
    return true;
  }
}

async function readTextWithLimit(response) {
  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    throw new Error('页面过大，无法抓取');
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf-8') > MAX_BYTES) {
      throw new Error('页面过大，无法抓取');
    }
    return text;
  }

  let bytes = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > MAX_BYTES) {
      throw new Error('页面过大，无法抓取');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function normalizeText(text) {
  return text
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function englishRatio(text) {
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const total = (text.match(/[A-Za-z\u4e00-\u9fff]/g) || []).length;
  if (total === 0) return 0;
  return letters / total;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { url } = req.body || {};
  if (!url || !isHttpUrl(url)) {
    res.status(400).json({ error: '无效的URL' });
    return;
  }

  const target = new URL(url);
  if (await isBlockedHost(target.hostname)) {
    res.status(400).json({ error: '该URL不可访问' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'EnglishReaderBot/1.0',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      res.status(response.status).json({ error: '抓取失败' });
      return;
    }

    const html = await readTextWithLimit(response);
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    let title = article?.title || dom.window.document.title || target.hostname;
    let content = article?.textContent || dom.window.document.body?.textContent || '';
    content = normalizeText(content);

    if (!content) {
      res.status(422).json({ error: '未能提取正文' });
      return;
    }

    if (englishRatio(content) < 0.4) {
      res.status(422).json({ error: '非英文内容，已忽略' });
      return;
    }

    res.status(200).json({
      title: title.trim(),
      content,
      mode: article ? 'readability' : 'fallback'
    });
  } catch (err) {
    const msg = err?.name === 'AbortError' ? '抓取超时' : '抓取失败';
    res.status(500).json({ error: msg });
  } finally {
    clearTimeout(timeout);
  }
}
