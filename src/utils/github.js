/**
 * GitHub 同步服务
 *
 * 所有 GitHub API 调用通过 /api/github 代理，Token 仅存于服务端
 */

const GIST_FILENAME = 'english-reader-vocabulary.json';
const ARTICLES_GIST_FILENAME = 'english-reader-articles.json';

// 缓存 GitHub 配置状态
let _githubConfigured = null;
let _githubConfiguredAt = 0;
const CONFIG_TTL = 60000; // 1 分钟

/**
 * 检查 GitHub 配置是否有效（通过服务端代理查询）
 */
export async function isGitHubConfigured() {
  const now = Date.now();
  if (_githubConfigured !== null && now - _githubConfiguredAt < CONFIG_TTL) {
    return _githubConfigured;
  }
  try {
    const res = await fetch('/api/github?action=status');
    if (res.ok) {
      const data = await res.json();
      _githubConfigured = data.configured;
      _githubConfiguredAt = now;
      return _githubConfigured;
    }
  } catch {
    // 网络失败时使用上次缓存
  }
  return _githubConfigured ?? false;
}

/**
 * 通用代理请求
 */
async function githubProxy(body) {
  const response = await fetch('/api/github', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `GitHub 操作失败 (${response.status})`);
  }

  return response.json();
}

/**
 * 通过代理查找 Gist
 */
async function findGistByFilename(filename) {
  const result = await githubProxy({ action: 'findGist', filename });
  return result.gist;
}

/**
 * 通过代理创建词汇 Gist
 */
async function createVocabularyGist(vocabulary) {
  const content = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    vocabulary: vocabulary,
  }, null, 2);

  return githubProxy({
    action: 'createGist',
    filename: GIST_FILENAME,
    description: 'English Reader - Vocabulary Backup',
    content,
  });
}

/**
 * 通过代理更新词汇 Gist
 */
async function updateVocabularyGist(gistId, vocabulary) {
  const content = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    vocabulary: vocabulary,
  }, null, 2);

  return githubProxy({
    action: 'updateGist',
    gistId,
    filename: GIST_FILENAME,
    content,
  });
}

/**
 * 通过代理获取 Gist 内容
 */
async function getGistContent(gistId) {
  const result = await githubProxy({
    action: 'getGistContent',
    gistId,
    filename: GIST_FILENAME,
  });

  if (result.truncated && result.rawUrl) {
    const rawResult = await githubProxy({
      action: 'getGistContentRaw',
      rawUrl: result.rawUrl,
    });
    return rawResult.content;
  }

  return result.content;
}

/**
 * 通过代理创建文章 Gist
 */
async function createArticlesGist(payload) {
  const content = JSON.stringify(payload, null, 2);

  return githubProxy({
    action: 'createGist',
    filename: ARTICLES_GIST_FILENAME,
    description: 'English Reader - Articles Backup',
    content,
  });
}

/**
 * 通过代理更新文章 Gist
 */
async function updateArticlesGist(gistId, payload) {
  const content = JSON.stringify(payload, null, 2);

  return githubProxy({
    action: 'updateGist',
    gistId,
    filename: ARTICLES_GIST_FILENAME,
    content,
  });
}

/**
 * 通过代理获取文章 Gist 内容
 */
async function getArticlesContent(gistId) {
  const result = await githubProxy({
    action: 'getGistContent',
    gistId,
    filename: ARTICLES_GIST_FILENAME,
  });

  if (result.truncated && result.rawUrl) {
    const rawResult = await githubProxy({
      action: 'getGistContentRaw',
      rawUrl: result.rawUrl,
    });
    return rawResult.content;
  }

  return result.content;
}

/**
 * 上传词汇到 GitHub
 * @param {Array} vocabulary - 本地词汇数组
 * @returns {Promise<Object>} - { success: boolean, gistUrl: string, count: number }
 */
export async function uploadVocabulary(vocabulary) {
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
  let gist = await findGistByFilename(GIST_FILENAME);

  if (gist) {
    // 更新现有 Gist
    gist = await updateVocabularyGist(gist.id, exportData);
    console.log('✅ 已更新 Gist:', gist.html_url);
  } else {
    // 创建新 Gist
    gist = await createVocabularyGist(exportData);
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
  // 查找词汇 Gist
  const gist = await findGistByFilename(GIST_FILENAME);

  if (!gist) {
    throw new Error('未找到云端词汇备份，请先上传');
  }

  // 获取内容
  const data = await getGistContent(gist.id);

  return {
    vocabulary: data.vocabulary || [],
    exportedAt: data.exportedAt,
    version: data.version
  };
}

/**
 * 同步词汇（双向合并）
 */
export async function syncVocabulary(localVocabulary, onProgress) {
  if (!Array.isArray(localVocabulary)) {
    throw new Error('本地词汇必须是数组');
  }

  onProgress?.('检查云端数据...');

  // 查找现有 Gist
  let gist = await findGistByFilename(GIST_FILENAME);
  let remoteVocabulary = [];

  if (gist) {
    onProgress?.('下载云端词汇...');
    const data = await getGistContent(gist.id);
    remoteVocabulary = data.vocabulary || [];
  }

  onProgress?.('合并词汇数据...');

  const localMap = new Map(localVocabulary.map(w => [w.word, w]));
  const remoteMap = new Map(remoteVocabulary.map(w => [w.word, w]));

  const merged = [];
  const newToLocal = [];
  const allWords = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const word of allWords) {
    const local = localMap.get(word);
    const remote = remoteMap.get(word);

    if (local && !remote) {
      merged.push(local);
    } else if (remote && !local) {
      merged.push(remote);
      newToLocal.push(remote);
    } else if (local && remote) {
      const localTime = new Date(local.updatedAt || local.createdAt).getTime();
      const remoteTime = new Date(remote.updatedAt || remote.createdAt).getTime();

      if (localTime >= remoteTime) {
        merged.push(local);
      } else {
        merged.push(remote);
        newToLocal.push({ ...remote, _needUpdate: true, _localId: local.id });
      }
    }
  }

  onProgress?.('上传合并结果...');

  if (gist) {
    await updateVocabularyGist(gist.id, merged);
  } else {
    gist = await createVocabularyGist(merged);
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
  const configured = await isGitHubConfigured();

  if (!configured) {
    return { configured: false };
  }

  try {
    const gist = await findGistByFilename(GIST_FILENAME);

    if (!gist) {
      return {
        configured: true,
        hasBackup: false
      };
    }

    const data = await getGistContent(gist.id);

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

/**
 * 获取文章同步状态
 */
export async function getArticlesSyncStatus() {
  const configured = await isGitHubConfigured();

  if (!configured) {
    return { configured: false };
  }

  try {
    const gist = await findGistByFilename(ARTICLES_GIST_FILENAME);

    if (!gist) {
      return {
        configured: true,
        hasBackup: false
      };
    }

    const data = await getArticlesContent(gist.id);

    return {
      configured: true,
      hasBackup: true,
      gistUrl: gist.html_url,
      lastSync: data.exportedAt,
      remoteCount: data.articles?.length || 0
    };
  } catch (err) {
    return {
      configured: true,
      error: err.message
    };
  }
}

/**
 * 同步文章 + 进度 + 反直觉揭示状态（双向合并）
 */
export async function syncArticles(
  localArticles,
  localProgress,
  localRevealState,
  localDeletedArticles,
  onProgress
) {
  if (!Array.isArray(localArticles)) {
    throw new Error('本地文章必须是数组');
  }
  const safeLocalProgress = Array.isArray(localProgress) ? localProgress : [];
  const safeLocalRevealState = Array.isArray(localRevealState) ? localRevealState : [];
  const safeLocalDeleted = Array.isArray(localDeletedArticles) ? localDeletedArticles : [];

  onProgress?.('检查云端文章...');

  let gist = await findGistByFilename(ARTICLES_GIST_FILENAME);
  let remotePayload = { articles: [], progress: [], revealState: [], deleted: [] };

  if (gist) {
    onProgress?.('下载云端文章...');
    remotePayload = await getArticlesContent(gist.id);
  }

  const remoteArticles = remotePayload.articles || [];
  const remoteProgress = remotePayload.progress || [];
  const remoteRevealState = remotePayload.revealState || [];
  const remoteDeleted = remotePayload.deleted || [];

  onProgress?.('合并文章数据...');

  // 合并删除记录
  const deletedMap = new Map();
  for (const item of [...safeLocalDeleted, ...remoteDeleted]) {
    if (!item?.docId) continue;
    const prev = deletedMap.get(item.docId);
    const curTime = new Date(item.deletedAt || 0).getTime();
    if (!prev || curTime > new Date(prev.deletedAt || 0).getTime()) {
      deletedMap.set(item.docId, { docId: item.docId, deletedAt: item.deletedAt });
    }
  }

  const localArticleMap = new Map(localArticles.map(a => [a.id, a]));
  const remoteArticleMap = new Map(remoteArticles.map(a => [a.id, a]));
  const allArticleIds = new Set([...localArticleMap.keys(), ...remoteArticleMap.keys()]);

  const mergedArticles = [];
  const newArticlesToLocal = [];
  const deletedToApply = new Set();

  for (const docId of allArticleIds) {
    const local = localArticleMap.get(docId);
    const remote = remoteArticleMap.get(docId);
    const deleted = deletedMap.get(docId);
    const deletedAt = deleted?.deletedAt ? new Date(deleted.deletedAt).getTime() : 0;

    const localUpdated = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
    const remoteUpdated = remote?.updatedAt ? new Date(remote.updatedAt).getTime() : 0;

    if (deletedAt && deletedAt >= Math.max(localUpdated, remoteUpdated)) {
      deletedToApply.add(docId);
      continue;
    }

    if (local && !remote) {
      mergedArticles.push(local);
    } else if (remote && !local) {
      mergedArticles.push(remote);
      newArticlesToLocal.push(remote);
    } else if (local && remote) {
      if (localUpdated >= remoteUpdated) {
        mergedArticles.push(local);
      } else {
        mergedArticles.push(remote);
        newArticlesToLocal.push(remote);
      }
    }
  }

  for (const docId of deletedMap.keys()) {
    if (!allArticleIds.has(docId)) {
      deletedToApply.add(docId);
    }
  }

  // Progress 合并
  const localProgressMap = new Map(safeLocalProgress.map(p => [p.docId, p]));
  const remoteProgressMap = new Map(remoteProgress.map(p => [p.docId, p]));
  const allProgressIds = new Set([...localProgressMap.keys(), ...remoteProgressMap.keys()]);

  const mergedProgress = [];
  const newProgressToLocal = [];

  for (const docId of allProgressIds) {
    if (deletedMap.has(docId)) continue;
    const local = localProgressMap.get(docId);
    const remote = remoteProgressMap.get(docId);
    const localTime = local?.lastReadAt ? new Date(local.lastReadAt).getTime() : 0;
    const remoteTime = remote?.lastReadAt ? new Date(remote.lastReadAt).getTime() : 0;

    if (local && !remote) {
      mergedProgress.push(local);
    } else if (remote && !local) {
      mergedProgress.push(remote);
      newProgressToLocal.push(remote);
    } else if (local && remote) {
      if (localTime >= remoteTime) {
        mergedProgress.push(local);
      } else {
        mergedProgress.push(remote);
        newProgressToLocal.push(remote);
      }
    }
  }

  // RevealState 合并
  const localRevealMap = new Map(safeLocalRevealState.map(r => [r.sentenceId, r]));
  const remoteRevealMap = new Map(remoteRevealState.map(r => [r.sentenceId, r]));
  const allRevealIds = new Set([...localRevealMap.keys(), ...remoteRevealMap.keys()]);

  const mergedReveal = [];
  const newRevealToLocal = [];

  for (const sentenceId of allRevealIds) {
    const docId = sentenceId.split(':')[0];
    if (deletedMap.has(docId)) continue;

    const local = localRevealMap.get(sentenceId);
    const remote = remoteRevealMap.get(sentenceId);
    const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
    const remoteTime = remote?.updatedAt ? new Date(remote.updatedAt).getTime() : 0;

    if (local && !remote) {
      mergedReveal.push(local);
    } else if (remote && !local) {
      mergedReveal.push(remote);
      newRevealToLocal.push(remote);
    } else if (local && remote) {
      if (localTime >= remoteTime) {
        mergedReveal.push(local);
      } else {
        mergedReveal.push(remote);
        newRevealToLocal.push(remote);
      }
    }
  }

  onProgress?.('上传合并结果...');

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    articles: mergedArticles,
    progress: mergedProgress,
    revealState: mergedReveal,
    deleted: Array.from(deletedMap.values())
  };

  if (gist) {
    await updateArticlesGist(gist.id, payload);
  } else {
    gist = await createArticlesGist(payload);
  }

  return {
    success: true,
    totalCount: mergedArticles.length,
    newToLocal: {
      articles: newArticlesToLocal,
      progress: newProgressToLocal,
      revealState: newRevealToLocal
    },
    deletedToApply: Array.from(deletedToApply),
    deleted: Array.from(deletedMap.values()),
    localCount: localArticles.length,
    remoteCount: remoteArticles.length
  };
}
