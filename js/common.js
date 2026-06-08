const CM_CONSTANTS = {
  STORAGE_KEYS: {
    CLIPS: 'clip_museum_clips',
    SETTINGS: 'clip_museum_settings',
    TAGS: 'clip_museum_tags',
    VERSIONS: 'clip_museum_versions',
    MERGE_MAP: 'clip_museum_merge_map'
  },
  CLIP_TYPES: {
    TEXT: 'text',
    LINK: 'link',
    IMAGE: 'image',
    CODE: 'code'
  },
  DEFAULT_SETTINGS: {
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
  }
};

function CM_generateId() {
  return 'clip_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

function CM_formatTimestamp(ts) {
  const date = new Date(ts);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function CM_formatRelativeTime(ts) {
  const now = Date.now();
  const diff = now - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return Math.floor(diff / minute) + '分钟前';
  if (diff < day) return Math.floor(diff / hour) + '小时前';
  if (diff < 30 * day) return Math.floor(diff / day) + '天前';
  return CM_formatTimestamp(ts).split(' ')[0];
}

function CM_detectType(content) {
  if (typeof content !== 'string') return 'text';
  const urlPattern = /^(https?:\/\/|www\.)[^\s]+$/i;
  if (urlPattern.test(content.trim())) return 'link';
  if (content.includes('://') && content.length < 2048) return 'link';
  return 'text';
}

function CM_isLikelyCode(text) {
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

function CM_similarity(a, b) {
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

function CM_maskSensitiveContent(text, sensitiveWords) {
  if (!text || !sensitiveWords || sensitiveWords.length === 0) return text;
  let result = text;
  for (const word of sensitiveWords) {
    const regex = new RegExp(word + '\\s*[:=]\\s*[\\S]+', 'gi');
    result = result.replace(regex, word + ': ******');
  }
  return result;
}

function CM_truncateText(text, maxLen = 200) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}

function CM_getHostname(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function CM_generateQuoteCard(clip) {
  const lines = [];
  lines.push('> 「' + CM_truncateText(clip.content || clip.title || '无内容', 100) + '」');
  lines.push('>');
  lines.push('> —— 来自 ' + (clip.sourceApp || '未知来源') + (clip.sourceUrl ? ` (${clip.sourceUrl})` : ''));
  lines.push('> 保存于 ' + CM_formatTimestamp(clip.timestamp));
  if (clip.tags && clip.tags.length > 0) {
    lines.push('> 标签: ' + clip.tags.map(t => '#' + t).join(' '));
  }
  return lines.join('\n');
}

function CM_escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function CM_debounce(fn, delay = 300) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function CM_downloadFile(filename, content, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function CM_copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch { return false; }
    finally { document.body.removeChild(textarea); }
  }
}

function CM_groupByDate(clips) {
  const groups = {};
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  for (const clip of clips) {
    const d = new Date(clip.timestamp);
    const dateKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    const diffDays = Math.floor((now - clip.timestamp) / day);
    let label;
    if (diffDays === 0) label = '今天';
    else if (diffDays === 1) label = '昨天';
    else if (diffDays < 7) label = diffDays + '天前';
    else if (diffDays < 30) label = Math.floor(diffDays / 7) + '周前';
    else label = dateKey;
    if (!groups[dateKey]) groups[dateKey] = { label, dateKey, clips: [] };
    groups[dateKey].clips.push(clip);
  }
  return Object.values(groups).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function CM_groupBySource(clips) {
  const groups = {};
  for (const clip of clips) {
    const source = clip.sourceApp || clip.sourceHost || '未知来源';
    if (!groups[source]) groups[source] = { source, clips: [] };
    groups[source].clips.push(clip);
  }
  return Object.values(groups).sort((a, b) => b.clips.length - a.clips.length);
}
