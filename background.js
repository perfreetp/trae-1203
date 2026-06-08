const STORAGE_KEYS = {
  CLIPS: 'clip_museum_clips',
  SETTINGS: 'clip_museum_settings',
  TAGS: 'clip_museum_tags',
  VERSIONS: 'clip_museum_versions',
  MERGE_MAP: 'clip_museum_merge_map'
};

const CLIP_TYPES = {
  TEXT: 'text',
  LINK: 'link',
  IMAGE: 'image',
  CODE: 'code'
};

const DEFAULT_SETTINGS = {
  isPaused: false,
  keepDays: 30,
  maxClips: 5000,
  enableSensitiveMask: false,
  sensitiveWords: ['密码', 'token', 'secret', 'key', 'password', '私钥'],
  blacklistSites: [],
  mergeSimilarContent: true,
  similarityThreshold: 0.85,
  autoDetectCode: true,
  quickPasteCount: 5
};

function generateId() {
  return 'clip_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

function isLikelyCode(text) {
  if (typeof text !== 'string') return false;
  const codeIndicators = [
    /\bfunction\s+\w*\s*\(/, /\bconst\s+\w+\s*=/, /\blet\s+\w+\s*=/,
    /\bvar\s+\w+\s*=/, /\bclass\s+\w+/, /^import\s+/m, /^export\s+/m,
    /\{[\s\S]*\}/, /;$/, /=>/, /def\s+\w+\s*\(/, /fn\s+\w+\s*\(/
  ];
  let score = 0;
  for (const pattern of codeIndicators) {
    if (pattern.test(text)) score++;
  }
  return score >= 2;
}

function similarity(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return 0;
  if (a === b) return 1;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.length === 0) return 1;
  const costs = [];
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (shorter.charAt(i - 1) !== longer.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[longer.length] = lastValue;
  }
  return 1 - costs[longer.length] / longer.length;
}

const DB = {
  async get(key, defaultValue = null) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] !== undefined ? result[key] : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  },
  async set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (e) {
      console.error('Storage set error:', e);
      return false;
    }
  },
  async getAllClips() { return await this.get(STORAGE_KEYS.CLIPS, []); },
  async saveAllClips(clips) { return await this.set(STORAGE_KEYS.CLIPS, clips); },
  async getSettings() {
    const settings = await this.get(STORAGE_KEYS.SETTINGS, {});
    return { ...DEFAULT_SETTINGS, ...settings };
  },
  async saveSettings(settings) { return await this.set(STORAGE_KEYS.SETTINGS, settings); },
  async getTags() { return await this.get(STORAGE_KEYS.TAGS, []); },
  async saveTags(tags) { return await this.set(STORAGE_KEYS.TAGS, tags); },
  async getVersions() { return await this.get(STORAGE_KEYS.VERSIONS, {}); },
  async saveVersions(versions) { return await this.set(STORAGE_KEYS.VERSIONS, versions); }
};

const ClipManager = {
  async addClip(data) {
    const settings = await DB.getSettings();
    const clips = await DB.getAllClips();

    if (settings.isPaused) return null;

    if (settings.blacklistSites && data.sourceUrl) {
      try {
        const host = new URL(data.sourceUrl).hostname;
        if (settings.blacklistSites.some(site => host.includes(site))) return null;
      } catch (e) {}
    }

    let content = data.content || '';
    let type = data.type;

    if (data.type === CLIP_TYPES.IMAGE) {
      type = CLIP_TYPES.IMAGE;
    } else {
      if (settings.autoDetectCode && isLikelyCode(content)) {
        type = CLIP_TYPES.CODE;
      } else if (!type) {
        const urlPattern = /^(https?:\/\/|www\.)[^\s]+$/i;
        type = urlPattern.test(content.trim()) ? CLIP_TYPES.LINK : CLIP_TYPES.TEXT;
      }
    }

    if (!content && type !== CLIP_TYPES.IMAGE) return null;
    if (type === CLIP_TYPES.IMAGE && !data.imageData) return null;

    let merged = false;
    let mergedInto = null;

    if (settings.mergeSimilarContent && type !== CLIP_TYPES.IMAGE) {
      for (const existing of clips) {
        if (existing.type === type && similarity(content, existing.content) >= settings.similarityThreshold) {
          existing.copyCount = (existing.copyCount || 1) + 1;
          existing.lastAccessed = Date.now();
          const versions = await DB.getVersions();
          if (!versions[existing.id]) versions[existing.id] = [];
          versions[existing.id].push({
            content: existing.content,
            timestamp: existing.lastModified || existing.timestamp
          });
          if (versions[existing.id].length > 20) versions[existing.id] = versions[existing.id].slice(-20);
          await DB.saveVersions(versions);

          existing.content = content;
          existing.lastModified = Date.now();
          if (data.sourceUrl && !existing.sourceUrl) existing.sourceUrl = data.sourceUrl;
          if (data.sourceApp && !existing.sourceApp) existing.sourceApp = data.sourceApp;
          existing.sourceHost = data.sourceHost || existing.sourceHost;
          merged = true;
          mergedInto = existing;
          break;
        }
      }
    }

    let newClip;

    if (!merged) {
      newClip = {
        id: data.id || generateId(),
        content,
        type,
        imageData: data.imageData || null,
        title: data.title || this.extractTitle(content, type),
        timestamp: Date.now(),
        lastModified: Date.now(),
        lastAccessed: Date.now(),
        sourceUrl: data.sourceUrl || '',
        sourceApp: data.sourceApp || '浏览器',
        sourceHost: data.sourceHost || '',
        sourceFavicon: data.sourceFavicon || '',
        tags: data.tags || [],
        isFavorite: false,
        isPinned: false,
        copyCount: 1,
        viewCount: 0,
        isMerged: false,
        mergedIds: []
      };
      clips.unshift(newClip);
    }

    const maxClips = settings.maxClips || 5000;
    if (clips.length > maxClips) clips.length = maxClips;
    await DB.saveAllClips(clips);

    if (!merged) await this.cleanupByKeepDays();
    return merged ? mergedInto : newClip;
  },

  extractTitle(content, type) {
    if (type === CLIP_TYPES.LINK) {
      return content.length > 80 ? content.substring(0, 77) + '...' : content;
    }
    const firstLine = content.split('\n')[0].trim();
    return firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine || '无标题';
  },

  async getClip(id) {
    const clips = await DB.getAllClips();
    return clips.find(c => c.id === id) || null;
  },

  async updateClip(id, updates) {
    const clips = await DB.getAllClips();
    const idx = clips.findIndex(c => c.id === id);
    if (idx === -1) return null;

    const oldClip = clips[idx];
    if (updates.content !== undefined && updates.content !== oldClip.content) {
      const versions = await DB.getVersions();
      if (!versions[id]) versions[id] = [];
      versions[id].push({ content: oldClip.content, timestamp: oldClip.lastModified || oldClip.timestamp });
      if (versions[id].length > 20) versions[id] = versions[id].slice(-20);
      await DB.saveVersions(versions);
    }

    clips[idx] = { ...oldClip, ...updates, lastModified: Date.now() };
    await DB.saveAllClips(clips);
    return clips[idx];
  },

  async deleteClip(id) {
    const clips = await DB.getAllClips();
    const newClips = clips.filter(c => c.id !== id);
    await DB.saveAllClips(newClips);
    return clips.length !== newClips.length;
  },

  async toggleFavorite(id) {
    const clip = await this.getClip(id);
    if (!clip) return null;
    return await this.updateClip(id, { isFavorite: !clip.isFavorite });
  },

  async togglePin(id) {
    const clip = await this.getClip(id);
    if (!clip) return null;
    return await this.updateClip(id, { isPinned: !clip.isPinned });
  },

  async incrementCopyCount(id) {
    const clip = await this.getClip(id);
    if (!clip) return null;
    return await this.updateClip(id, { copyCount: (clip.copyCount || 0) + 1, lastAccessed: Date.now() });
  },

  async addTags(id, tagNames) {
    const clip = await this.getClip(id);
    if (!clip) return null;
    const newTags = [...new Set([...(clip.tags || []), ...tagNames])];
    await this.saveNewTags(tagNames);
    return await this.updateClip(id, { tags: newTags });
  },

  async removeTag(id, tagName) {
    const clip = await this.getClip(id);
    if (!clip) return null;
    return await this.updateClip(id, { tags: (clip.tags || []).filter(t => t !== tagName) });
  },

  async saveNewTags(tagNames) {
    const existing = await DB.getTags();
    const merged = [...new Set([...existing, ...tagNames])];
    await DB.saveTags(merged);
    return merged;
  },

  async deleteTag(tagName) {
    const clips = await DB.getAllClips();
    for (let i = 0; i < clips.length; i++) {
      if (clips[i].tags && clips[i].tags.includes(tagName)) {
        clips[i].tags = clips[i].tags.filter(t => t !== tagName);
      }
    }
    await DB.saveAllClips(clips);
    const tags = await DB.getTags();
    await DB.saveTags(tags.filter(t => t !== tagName));
  },

  async renameTag(oldName, newName) {
    if (oldName === newName) return;
    const clips = await DB.getAllClips();
    for (let i = 0; i < clips.length; i++) {
      if (clips[i].tags && clips[i].tags.includes(oldName)) {
        const tags = clips[i].tags.filter(t => t !== oldName);
        if (!tags.includes(newName)) tags.push(newName);
        clips[i].tags = tags;
      }
    }
    await DB.saveAllClips(clips);
    const tags = await DB.getTags();
    const idx = tags.indexOf(oldName);
    if (idx !== -1) {
      tags[idx] = newName;
      await DB.saveTags([...new Set(tags)]);
    }
  },

  async bulkAddTags(clipIds, tagNames) {
    const clips = await DB.getAllClips();
    await this.saveNewTags(tagNames);
    for (let i = 0; i < clips.length; i++) {
      if (clipIds.includes(clips[i].id)) {
        clips[i].tags = [...new Set([...(clips[i].tags || []), ...tagNames])];
        clips[i].lastModified = Date.now();
      }
    }
    await DB.saveAllClips(clips);
  },

  async bulkDelete(clipIds) {
    const clips = await DB.getAllClips();
    const newClips = clips.filter(c => !clipIds.includes(c.id));
    await DB.saveAllClips(newClips);
    return clips.length - newClips.length;
  },

  async bulkFavorite(clipIds, favorite = true) {
    const clips = await DB.getAllClips();
    for (let i = 0; i < clips.length; i++) {
      if (clipIds.includes(clips[i].id)) {
        clips[i].isFavorite = favorite;
        clips[i].lastModified = Date.now();
      }
    }
    await DB.saveAllClips(clips);
  },

  async cleanupByKeepDays() {
    const settings = await DB.getSettings();
    const keepDays = settings.keepDays;
    if (!keepDays || keepDays <= 0) return;
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    const clips = await DB.getAllClips();
    const newClips = clips.filter(c => c.isFavorite || c.isPinned || c.timestamp >= cutoff);
    if (newClips.length !== clips.length) await DB.saveAllClips(newClips);
  },

  async clearAll(favoritesOnly = false) {
    const clips = await DB.getAllClips();
    const toKeep = favoritesOnly ? clips.filter(c => c.isFavorite || c.isPinned) : [];
    await DB.saveAllClips(toKeep);
  },

  async getVersions(id) {
    const versions = await DB.getVersions();
    return versions[id] || [];
  },

  async restoreVersion(id, versionIndex) {
    const versions = await DB.getVersions();
    const clipVersions = versions[id] || [];
    if (versionIndex < 0 || versionIndex >= clipVersions.length) return null;
    const version = clipVersions[versionIndex];
    const clip = await this.getClip(id);
    if (!clip) return null;
    clipVersions.splice(versionIndex, 1);
    clipVersions.push({ content: clip.content, timestamp: clip.lastModified || Date.now() });
    versions[id] = clipVersions;
    await DB.saveVersions(versions);
    return await this.updateClip(id, { content: version.content });
  },

  async searchClips(query, filters = {}) {
    const clips = await DB.getAllClips();
    const lowerQuery = query.toLowerCase().trim();

    let results = clips.filter(clip => {
      if (filters.type && clip.type !== filters.type) return false;
      if (filters.isFavorite && !clip.isFavorite) return false;
      if (filters.isPinned && !clip.isPinned) return false;
      if (filters.tags && filters.tags.length > 0) {
        if (!clip.tags || !filters.tags.some(t => clip.tags.includes(t))) return false;
      }
      if (filters.source && clip.sourceApp !== filters.source && clip.sourceHost !== filters.source) {
        return false;
      }
      if (!lowerQuery) return true;
      if (clip.content && clip.content.toLowerCase().includes(lowerQuery)) return true;
      if (clip.title && clip.title.toLowerCase().includes(lowerQuery)) return true;
      if (clip.tags && clip.tags.some(t => t.toLowerCase().includes(lowerQuery))) return true;
      if (clip.sourceUrl && clip.sourceUrl.toLowerCase().includes(lowerQuery)) return true;
      if (clip.sourceApp && clip.sourceApp.toLowerCase().includes(lowerQuery)) return true;
      return false;
    });

    results.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
      return b.lastAccessed - a.lastAccessed;
    });

    return results;
  },

  async getTopClips(limit = 10) {
    const clips = await DB.getAllClips();
    return [...clips].sort((a, b) => (b.copyCount || 0) - (a.copyCount || 0)).slice(0, limit);
  },

  async getSources() {
    const clips = await DB.getAllClips();
    const sources = new Map();
    for (const clip of clips) {
      const key = clip.sourceHost || clip.sourceApp || '未知';
      if (!sources.has(key)) {
        sources.set(key, { name: key, count: 0, host: clip.sourceHost || '', app: clip.sourceApp || '' });
      }
      sources.get(key).count++;
    }
    return [...sources.values()].sort((a, b) => b.count - a.count);
  },

  async togglePause() {
    const settings = await DB.getSettings();
    settings.isPaused = !settings.isPaused;
    await DB.saveSettings(settings);
    return settings.isPaused;
  }
};

async function copyToClipboardSW(text) {
  const clipboardData = new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }) });
  await navigator.clipboard.write([clipboardData]);
}

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    if (details.reason === 'install') {
      const settings = await DB.getSettings();
      await DB.saveSettings(settings);
      await DB.saveTags(await DB.getTags());
    }
    await ClipManager.cleanupByKeepDays();

    try {
      const alarm = await chrome.alarms.get('cleanup-old-clips');
      if (!alarm) {
        chrome.alarms.create('cleanup-old-clips', {
          delayInMinutes: 60,
          periodInMinutes: 360
        });
      }
    } catch (e) {
      console.warn('alarms init failed:', e);
    }
  } catch (e) {
    console.error('onInstalled error:', e);
  }
});

try {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'cleanup-old-clips') {
      try { await ClipManager.cleanupByKeepDays(); }
      catch (e) { console.error('cleanup alarm error:', e); }
    }
  });
} catch (e) { console.warn('alarms listener failed:', e); }

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      const { action, payload } = request;
      switch (action) {
        case 'addClip': sendResponse({ success: true, data: await ClipManager.addClip(payload) }); break;
        case 'getClips': sendResponse({ success: true, data: await DB.getAllClips() }); break;
        case 'getClip': sendResponse({ success: true, data: await ClipManager.getClip(payload.id) }); break;
        case 'updateClip': sendResponse({ success: true, data: await ClipManager.updateClip(payload.id, payload.updates) }); break;
        case 'deleteClip': sendResponse({ success: true, data: await ClipManager.deleteClip(payload.id) }); break;
        case 'toggleFavorite': sendResponse({ success: true, data: await ClipManager.toggleFavorite(payload.id) }); break;
        case 'togglePin': sendResponse({ success: true, data: await ClipManager.togglePin(payload.id) }); break;
        case 'incrementCopyCount': sendResponse({ success: true, data: await ClipManager.incrementCopyCount(payload.id) }); break;
        case 'addTags': sendResponse({ success: true, data: await ClipManager.addTags(payload.id, payload.tags) }); break;
        case 'removeTag': sendResponse({ success: true, data: await ClipManager.removeTag(payload.id, payload.tag) }); break;
        case 'getTags': sendResponse({ success: true, data: await DB.getTags() }); break;
        case 'saveNewTags': sendResponse({ success: true, data: await ClipManager.saveNewTags(payload.tags) }); break;
        case 'deleteTag': await ClipManager.deleteTag(payload.tag); sendResponse({ success: true }); break;
        case 'renameTag': await ClipManager.renameTag(payload.oldName, payload.newName); sendResponse({ success: true }); break;
        case 'bulkAddTags': await ClipManager.bulkAddTags(payload.clipIds, payload.tags); sendResponse({ success: true }); break;
        case 'bulkDelete': sendResponse({ success: true, data: await ClipManager.bulkDelete(payload.clipIds) }); break;
        case 'bulkFavorite': await ClipManager.bulkFavorite(payload.clipIds, payload.favorite); sendResponse({ success: true }); break;
        case 'getVersions': sendResponse({ success: true, data: await ClipManager.getVersions(payload.id) }); break;
        case 'restoreVersion': sendResponse({ success: true, data: await ClipManager.restoreVersion(payload.id, payload.index) }); break;
        case 'searchClips': sendResponse({ success: true, data: await ClipManager.searchClips(payload.query, payload.filters || {}) }); break;
        case 'getSettings': sendResponse({ success: true, data: await DB.getSettings() }); break;
        case 'saveSettings': await DB.saveSettings(payload.settings); sendResponse({ success: true }); break;
        case 'togglePause': sendResponse({ success: true, data: await ClipManager.togglePause() }); break;
        case 'clearAll': await ClipManager.clearAll(payload.favoritesOnly); sendResponse({ success: true }); break;
        case 'getTopClips': sendResponse({ success: true, data: await ClipManager.getTopClips(payload.limit) }); break;
        case 'getSources': sendResponse({ success: true, data: await ClipManager.getSources() }); break;
        case 'captureCurrentPage': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) {
            try {
              const clip = await ClipManager.addClip({
                content: tab.url, type: CLIP_TYPES.LINK, title: tab.title,
                sourceUrl: tab.url, sourceHost: new URL(tab.url).hostname, sourceApp: '浏览器'
              });
              sendResponse({ success: true, data: clip });
            } catch (e) { sendResponse({ success: false, error: e.message }); }
          } else sendResponse({ success: false, error: 'no-tab' });
          break;
        }
        case 'openPage': chrome.tabs.create({ url: payload.url }); sendResponse({ success: true }); break;
        default: sendResponse({ success: false, error: 'unknown-action' });
      }
    } catch (e) {
      console.error('Handler error:', e);
      sendResponse({ success: false, error: e.message });
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (command === 'toggle-capture') {
      const isPaused = await ClipManager.togglePause();
      chrome.action.setBadgeText({ text: isPaused ? 'OFF' : '' });
      chrome.action.setBadgeBackgroundColor({ color: isPaused ? '#ef4444' : '#22c55e' });
      return;
    }

    if (command === 'open-search') {
      chrome.tabs.create({ url: chrome.runtime.getURL('pages/search.html') });
      return;
    }

    if (command.startsWith('quick-paste-')) {
      const idx = parseInt(command.split('-').pop()) - 1;
      const clips = await DB.getAllClips();
      const pinnedOrFav = clips.filter(c => c.isPinned || c.isFavorite);
      const target = pinnedOrFav[idx] || clips[idx];
      if (target && target.content) {
        try { await copyToClipboardSW(target.content); } catch (e) {}
        await ClipManager.incrementCopyCount(target.id);
        if (tab) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (text) => {
                const el = document.activeElement;
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
                  if (el.isContentEditable) document.execCommand('insertText', false, text);
                  else {
                    const s = el.selectionStart || 0, e = el.selectionEnd || 0;
                    el.value = el.value.slice(0, s) + text + el.value.slice(e);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }
              },
              args: [target.content]
            });
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.error('Command error:', e);
  }
});

chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
