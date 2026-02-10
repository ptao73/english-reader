const GITHUB_API = 'https://api.github.com';
const GIST_FILENAME = 'english-reader-vocabulary.json';
const ARTICLES_GIST_FILENAME = 'english-reader-articles.json';

export default async function handler(req, res) {
  // GET /api/github?action=status — 检查 token 是否配置
  if (req.method === 'GET') {
    const action = req.query?.action;
    if (action === 'status') {
      const token = process.env.GITHUB_TOKEN;
      return res.status(200).json({
        configured: !!token && token !== 'your_github_token_here',
      });
    }
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token || token === 'your_github_token_here') {
    return res.status(500).json({ error: '服务端未配置 GITHUB_TOKEN' });
  }

  const { action, ...params } = req.body || {};

  try {
    switch (action) {
      case 'findGist': {
        const { filename } = params;
        const gist = await findGistByFilename(token, filename || GIST_FILENAME);
        return res.status(200).json({ gist: gist || null });
      }

      case 'createGist': {
        const { filename, description, content } = params;
        const gist = await createGist(token, filename, description, content);
        return res.status(200).json(gist);
      }

      case 'updateGist': {
        const { gistId, filename, content } = params;
        const gist = await updateGist(token, gistId, filename, content);
        return res.status(200).json(gist);
      }

      case 'getGistContent': {
        const { gistId, filename } = params;
        const data = await getGistContent(token, gistId, filename);
        return res.status(200).json(data);
      }

      case 'getGistContentRaw': {
        const { rawUrl } = params;
        const data = await getGistContentRaw(rawUrl);
        return res.status(200).json(data);
      }

      default:
        return res.status(400).json({ error: `未知 action: ${action}` });
    }
  } catch (err) {
    console.error('GitHub proxy error:', err);
    return res.status(500).json({ error: err.message || 'GitHub 操作失败' });
  }
}

async function githubFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `GitHub API ${response.status}`);
  }

  return response.json();
}

async function findGistByFilename(token, filename) {
  const gists = await githubFetch(`${GITHUB_API}/gists`, token);
  return gists.find((gist) => gist.files && gist.files[filename]) || null;
}

async function createGist(token, filename, description, content) {
  return githubFetch(`${GITHUB_API}/gists`, token, {
    method: 'POST',
    body: JSON.stringify({
      description: description || 'English Reader Backup',
      public: false,
      files: {
        [filename]: {
          content: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
        },
      },
    }),
  });
}

async function updateGist(token, gistId, filename, content) {
  return githubFetch(`${GITHUB_API}/gists/${gistId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      files: {
        [filename]: {
          content: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
        },
      },
    }),
  });
}

async function getGistContent(token, gistId, filename) {
  const gist = await githubFetch(`${GITHUB_API}/gists/${gistId}`, token);
  const file = gist.files[filename];

  if (!file) {
    throw new Error(`文件 ${filename} 不存在`);
  }

  // 如果内容被截断，需要获取 raw_url
  if (file.truncated && file.raw_url) {
    return { truncated: true, rawUrl: file.raw_url };
  }

  return { content: JSON.parse(file.content) };
}

async function getGistContentRaw(rawUrl) {
  const response = await fetch(rawUrl, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('获取 Gist 原始内容失败');
  }

  const text = await response.text();
  return { content: JSON.parse(text) };
}
