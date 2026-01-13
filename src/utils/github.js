/**
 * GitHub 同步服务
 *
 * 使用 GitHub Gist 作为云端存储
 * 优势:
 * - 无需创建专门的仓库
 * - API 简单直接
 * - 支持公开/私有
 */

const GITHUB_API = 'https://api.github.com';
const GIST_FILENAME = 'english-reader-vocabulary.json';

/**
 * 获取 GitHub 配置
 */
function getGitHubConfig() {
  const token = import.meta.env.VITE_GITHUB_TOKEN;
  return { token };
}

/**
 * 检查 GitHub 配置是否有效
 */
export function isGitHubConfigured() {
  const { token } = getGitHubConfig();
  return !!token && token !== 'your_github_token_here';
}

/**
 * 获取用户的 Gist 列表，查找词汇文件
 */
async function findVocabularyGist(token) {
  const response = await fetch(`${GITHUB_API}/gists`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '获取 Gist 列表失败');
  }

  const gists = await response.json();

  // 查找包含词汇文件的 Gist
  return gists.find(gist =>
    gist.files && gist.files[GIST_FILENAME]
  );
}

/**
 * 创建新的词汇 Gist
 */
async function createVocabularyGist(token, vocabulary) {
  const response = await fetch(`${GITHUB_API}/gists`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: 'English Reader - Vocabulary Backup',
      public: false, // 私有 Gist
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({
            version: 1,
            exportedAt: new Date().toISOString(),
            vocabulary: vocabulary
          }, null, 2)
        }
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '创建 Gist 失败');
  }

  return response.json();
}

/**
 * 更新现有的词汇 Gist
 */
async function updateVocabularyGist(token, gistId, vocabulary) {
  const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({
            version: 1,
            exportedAt: new Date().toISOString(),
            vocabulary: vocabulary
          }, null, 2)
        }
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || '更新 Gist 失败');
  }

  return response.json();
}

/**
 * 获取 Gist 内容
 */
async function getGistContent(token, gistId) {
  const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    throw new Error('获取 Gist 内容失败');
  }

  const gist = await response.json();
  const file = gist.files[GIST_FILENAME];

  if (!file) {
    throw new Error('词汇文件不存在');
  }

  return JSON.parse(file.content);
}

/**
 * 上传词汇到 GitHub
 * @param {Array} vocabulary - 本地词汇数组
 * @returns {Promise<Object>} - { success: boolean, gistUrl: string, count: number }
 */
export async function uploadVocabulary(vocabulary) {
  const { token } = getGitHubConfig();

  if (!token) {
    throw new Error('未配置 GitHub Token，请在 .env 文件中设置 VITE_GITHUB_TOKEN');
  }

  // 准备导出数据（移除本地特有字段）
  const exportData = vocabulary.map(word => ({
    word: word.word,
    originalWord: word.originalWord,
    phonetic: word.phonetic,
    meanings: word.meanings,
    etymology: word.etymology,
    examples: word.examples,
    collocations: word.collocations,
    synonyms: word.synonyms,
    context: word.context,
    contextMeaning: word.contextMeaning,
    articleTitle: word.articleTitle,
    mastered: word.mastered,
    createdAt: word.createdAt,
    updatedAt: word.updatedAt
  }));

  // 查找现有 Gist
  let gist = await findVocabularyGist(token);

  if (gist) {
    // 更新现有 Gist
    gist = await updateVocabularyGist(token, gist.id, exportData);
    console.log('✅ 已更新 Gist:', gist.html_url);
  } else {
    // 创建新 Gist
    gist = await createVocabularyGist(token, exportData);
    console.log('✅ 已创建 Gist:', gist.html_url);
  }

  return {
    success: true,
    gistUrl: gist.html_url,
    gistId: gist.id,
    count: exportData.length
  };
}

/**
 * 从 GitHub 下载词汇
 * @returns {Promise<Object>} - { vocabulary: Array, exportedAt: string }
 */
export async function downloadVocabulary() {
  const { token } = getGitHubConfig();

  if (!token) {
    throw new Error('未配置 GitHub Token');
  }

  // 查找词汇 Gist
  const gist = await findVocabularyGist(token);

  if (!gist) {
    throw new Error('未找到云端词汇备份，请先上传');
  }

  // 获取内容
  const data = await getGistContent(token, gist.id);

  return {
    vocabulary: data.vocabulary || [],
    exportedAt: data.exportedAt,
    version: data.version
  };
}

/**
 * 同步词汇（双向合并）
 *
 * 设计意图 (Why):
 * - 采用双向合并策略，确保多设备间数据不丢失
 * - 使用 updatedAt 时间戳作为冲突解决依据，保留最新修改
 * - 返回 newToLocal 数组，让调用方决定如何写入本地数据库
 *
 * @param {Array} localVocabulary - 本地词汇数组
 * @param {Function} onProgress - 进度回调函数，用于显示同步状态
 * @returns {Promise<Object>} - { success, gistUrl, totalCount, newToLocal, localCount, remoteCount }
 * @throws {Error} 当 Token 未配置或 API 调用失败时抛出错误
 */
export async function syncVocabulary(localVocabulary, onProgress) {
  // Guard Clause: 参数校验
  const { token } = getGitHubConfig();

  if (!token) {
    throw new Error('未配置 GitHub Token');
  }

  // 确保 localVocabulary 是数组
  if (!Array.isArray(localVocabulary)) {
    throw new Error('本地词汇必须是数组');
  }

  onProgress?.('检查云端数据...');

  // 查找现有 Gist
  let gist = await findVocabularyGist(token);
  let remoteVocabulary = [];

  if (gist) {
    onProgress?.('下载云端词汇...');
    const data = await getGistContent(token, gist.id);
    remoteVocabulary = data.vocabulary || [];
  }

  onProgress?.('合并词汇数据...');

  // 使用 Map 构建索引，O(1) 查找效率
  const localMap = new Map(localVocabulary.map(w => [w.word, w]));
  const remoteMap = new Map(remoteVocabulary.map(w => [w.word, w]));

  /**
   * 合并策略 (三种情况):
   * 1. 本地有，云端无 → 上传到云端 (新增词汇)
   * 2. 云端有，本地无 → 下载到本地 (其他设备添加的词汇)
   * 3. 都有 → 比较 updatedAt，保留较新版本 (冲突解决)
   */
  const merged = [];
  const newToLocal = []; // 需要添加/更新到本地的词汇
  const allWords = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const word of allWords) {
    const local = localMap.get(word);
    const remote = remoteMap.get(word);

    if (local && !remote) {
      // 仅本地有
      merged.push(local);
    } else if (remote && !local) {
      // 仅云端有，需要添加到本地
      merged.push(remote);
      newToLocal.push(remote);
    } else if (local && remote) {
      // 都有，取更新时间晚的
      const localTime = new Date(local.updatedAt || local.createdAt).getTime();
      const remoteTime = new Date(remote.updatedAt || remote.createdAt).getTime();

      if (localTime >= remoteTime) {
        merged.push(local);
      } else {
        merged.push(remote);
        // 标记需要更新本地
        newToLocal.push({ ...remote, _needUpdate: true, _localId: local.id });
      }
    }
  }

  onProgress?.('上传合并结果...');

  // 上传合并后的数据
  if (gist) {
    await updateVocabularyGist(token, gist.id, merged);
  } else {
    gist = await createVocabularyGist(token, merged);
  }

  return {
    success: true,
    gistUrl: gist.html_url,
    totalCount: merged.length,
    newToLocal: newToLocal,
    localCount: localVocabulary.length,
    remoteCount: remoteVocabulary.length
  };
}

/**
 * 获取同步状态
 */
export async function getSyncStatus() {
  const { token } = getGitHubConfig();

  if (!token) {
    return { configured: false };
  }

  try {
    const gist = await findVocabularyGist(token);

    if (!gist) {
      return {
        configured: true,
        hasBackup: false
      };
    }

    const data = await getGistContent(token, gist.id);

    return {
      configured: true,
      hasBackup: true,
      gistUrl: gist.html_url,
      lastSync: data.exportedAt,
      remoteCount: data.vocabulary?.length || 0
    };
  } catch (err) {
    return {
      configured: true,
      error: err.message
    };
  }
}
