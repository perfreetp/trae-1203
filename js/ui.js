const UI = {
  toast(message, type = 'info', duration = 2500) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.25s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  },

  confirm(message) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">确认操作</div>
            <button class="modal-close" data-action="close">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size: 15px; color: var(--text-primary); line-height: 1.7;">${UI.escapeHtml(message)}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-action="cancel">取消</button>
            <button class="btn btn-danger" data-action="confirm">确认</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const close = (result) => {
        backdrop.remove();
        resolve(result);
      };

      backdrop.querySelector('[data-action="close"]').onclick = () => close(false);
      backdrop.querySelector('[data-action="cancel"]').onclick = () => close(false);
      backdrop.querySelector('[data-action="confirm"]').onclick = () => close(true);
      backdrop.onclick = (e) => {
        if (e.target === backdrop) close(false);
      };
    });
  },

  prompt(title, defaultValue = '', placeholder = '') {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">${UI.escapeHtml(title)}</div>
            <button class="modal-close" data-action="close">&times;</button>
          </div>
          <div class="modal-body">
            <input type="text" class="form-input" id="prompt-input" value="${UI.escapeAttr(defaultValue)}" placeholder="${UI.escapeAttr(placeholder)}" />
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-action="cancel">取消</button>
            <button class="btn btn-primary" data-action="confirm">确定</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const input = backdrop.querySelector('#prompt-input');
      input.focus();
      input.select();

      const close = (result) => {
        backdrop.remove();
        resolve(result);
      };

      backdrop.querySelector('[data-action="close"]').onclick = () => close(null);
      backdrop.querySelector('[data-action="cancel"]').onclick = () => close(null);
      backdrop.querySelector('[data-action="confirm"]').onclick = () => close(input.value.trim());
      input.onkeydown = (e) => {
        if (e.key === 'Enter') close(input.value.trim());
        if (e.key === 'Escape') close(null);
      };
      backdrop.onclick = (e) => {
        if (e.target === backdrop) close(null);
      };
    });
  },

  createModal(content, maxWidthClass = '') {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal ${maxWidthClass}"></div>`;
    const modal = backdrop.querySelector('.modal');
    modal.innerHTML = content;
    document.body.appendChild(backdrop);

    backdrop.onclick = (e) => {
      if (e.target === backdrop) backdrop.remove();
    };
    const closeBtn = modal.querySelector('[data-close]');
    if (closeBtn) closeBtn.onclick = () => backdrop.remove();

    return { backdrop, modal, close: () => backdrop.remove() };
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  escapeAttr(text) {
    if (!text) return '';
    return String(text).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  },

  formatTimestamp(ts) {
    const date = new Date(ts);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  formatRelativeTime(ts) {
    const now = Date.now();
    const diff = now - ts;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return '刚刚';
    if (diff < hour) return Math.floor(diff / minute) + '分钟前';
    if (diff < day) return Math.floor(diff / hour) + '小时前';
    if (diff < 30 * day) return Math.floor(diff / day) + '天前';
    return this.formatTimestamp(ts).split(' ')[0];
  },

  truncate(text, maxLen = 150) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
  },

  getTypeLabel(type) {
    const labels = { text: '文本', link: '链接', image: '图片', code: '代码' };
    return labels[type] || '文本';
  },

  getTypeIcon(type) {
    const icons = { text: '📝', link: '🔗', image: '🖼️', code: '💻' };
    return icons[type] || '📝';
  },

  debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  copyToClipboard(text) {
    return new Promise(async (resolve) => {
      try {
        await navigator.clipboard.writeText(text);
        resolve(true);
      } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          resolve(true);
        } catch {
          resolve(false);
        } finally {
          document.body.removeChild(textarea);
        }
      }
    });
  },

  downloadFile(filename, content, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  sendMessage(action, payload = {}, { timeout = 10000, retries = 1 } = {}) {
    const sendOnce = () => new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve({ success: false, error: 'timeout' }); }
      }, timeout);
      try {
        chrome.runtime.sendMessage({ action, payload }, (response) => {
          clearTimeout(timer);
          if (done) return;
          done = true;
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message || 'runtime-error' });
            return;
          }
          resolve(response || { success: false, error: 'no-response' });
        });
      } catch (e) {
        clearTimeout(timer);
        if (!done) { done = true; resolve({ success: false, error: e.message || 'exception' }); }
      }
    });

    return (async () => {
      let last = null;
      for (let i = 0; i <= retries; i++) {
        const r = await sendOnce();
        if (r && r.success) return r;
        last = r;
        if (i < retries) {
          await new Promise(res => setTimeout(res, 150 + i * 200));
        }
      }
      return last || { success: false, error: 'unknown' };
    })();
  },

  generateQuoteCard(clip, mode = 'full') {
    const safeTitle = clip.title || '';
    const safeContent = clip.content || safeTitle || '无内容';
    const safeSourceApp = clip.sourceApp || '未知来源';
    const safeSourceHost = clip.sourceHost || '';
    const safeSourceUrl = clip.sourceUrl || '';
    const saveTime = UI.formatTimestamp(clip.timestamp);

    if (mode === 'simple') {
      const lines = [];
      lines.push('> 「' + UI.truncate(safeContent, 120) + '」');
      lines.push('>');
      lines.push('> —— ' + (safeTitle ? safeTitle + ' ' : '') + saveTime);
      return lines.join('\n');
    }

    if (mode === 'source') {
      const lines = [];
      lines.push('> 「' + UI.truncate(safeContent, 120) + '」');
      lines.push('>');
      lines.push('> —— 来自 ' + safeSourceApp + (safeSourceHost ? ` (${safeSourceHost})` : ''));
      if (safeSourceUrl) lines.push('> 🔗 ' + safeSourceUrl);
      lines.push('> 保存于 ' + saveTime);
      return lines.join('\n');
    }

    const lines = [];
    lines.push('> 「' + UI.truncate(safeContent, 120) + '」');
    lines.push('>');
    lines.push('> —— 来自 ' + safeSourceApp + (safeSourceHost ? ` (${safeSourceHost})` : ''));
    lines.push('> 保存于 ' + saveTime);
    if (safeSourceUrl) lines.push('> 🔗 ' + safeSourceUrl);
    if (clip.tags && clip.tags.length > 0) {
      lines.push('> 🏷️ 标签: ' + clip.tags.map(t => '#' + t).join(' '));
    }
    if (safeTitle) lines.push('> 📝 标题: ' + safeTitle);
    return lines.join('\n');
  },

  diffText(oldText, newText) {
    const oldLines = (oldText || '').split('\n');
    const newLines = (newText || '').split('\n');
    const dp = Array.from({ length: oldLines.length + 1 }, () => new Array(newLines.length + 1).fill(0));

    for (let i = 1; i <= oldLines.length; i++) {
      for (let j = 1; j <= newLines.length; j++) {
        dp[i][j] = oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    const diff = [];
    let i = oldLines.length, j = newLines.length;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        diff.unshift({ type: 'equal', text: oldLines[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diff.unshift({ type: 'add', text: newLines[j - 1] });
        j--;
      } else {
        diff.unshift({ type: 'del', text: oldLines[i - 1] });
        i--;
      }
    }

    return diff.map(d => {
      if (d.type === 'equal') return `<div style="padding:2px 8px;color:var(--text-secondary);font-family:monospace;font-size:12px;white-space:pre-wrap;">  ${UI.escapeHtml(d.text || ' ')}</div>`;
      if (d.type === 'add') return `<div style="padding:2px 8px;background:rgba(22,163,74,0.1);border-left:3px solid #16a34a;color:var(--text-primary);font-family:monospace;font-size:12px;white-space:pre-wrap;">+ ${UI.escapeHtml(d.text || ' ')}</div>`;
      return `<div style="padding:2px 8px;background:rgba(239,68,68,0.1);border-left:3px solid #ef4444;color:var(--text-primary);font-family:monospace;font-size:12px;white-space:pre-wrap;opacity:0.9;">- ${UI.escapeHtml(d.text || ' ')}</div>`;
    }).join('');
  },

  maskSensitive(text, sensitiveWords) {
    if (!text || !sensitiveWords || sensitiveWords.length === 0) return UI.escapeHtml(text);
    let result = UI.escapeHtml(text);
    for (const word of sensitiveWords) {
      if (!word) continue;
      const escapedWord = UI.escapeHtml(word);
      const safeWord = escapedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = '(' + safeWord + ')(\\s*[:=]\\s*)([^\\s&;"\'<>]{2,})';
      const regex = new RegExp(pattern, 'gi');
      result = result.replace(regex, (_, kw, sep, val) => {
        const maskedVal = '*'.repeat(Math.max(6, Math.min(12, val.length)));
        return '<span class="sensitive-mask" title="敏感内容已遮罩">' + kw + sep + maskedVal + '</span>';
      });
    }
    return result;
  },

  highlightMatches(htmlContent, searchQuery) {
    if (!searchQuery) return htmlContent || '';
    const text = htmlContent || '';
    const safeQuery = String(searchQuery).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const qRegex = new RegExp('(' + safeQuery + ')(?![^<]*>)', 'gi');
    return text.replace(qRegex, '<mark style="background:#fef08a;padding:0 2px;border-radius:2px;">$1</mark>');
  },
};

const Nav = {
  init(currentPage) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    const items = [
      { page: 'timeline', icon: '⏱️', label: '时间轴', href: 'timeline.html' },
      { page: 'favorites', icon: '⭐', label: '收藏夹', href: 'favorites.html' },
      { page: 'tags', icon: '🏷️', label: '标签管理', href: 'tags.html' },
      { page: 'search', icon: '🔍', label: '搜索', href: 'search.html' },
      { page: 'settings', icon: '⚙️', label: '隐私设置', href: 'settings.html' },
      { page: 'cleanup', icon: '🗑️', label: '清理中心', href: 'cleanup.html' }
    ];

    let totalClips = 0;
    UI.sendMessage('getClips').then(r => {
      if (r.success) totalClips = r.data.length;
      render();
    });

    function render() {
      const navMenu = sidebar.querySelector('.nav-menu') || document.createElement('div');
      navMenu.className = 'nav-menu';
      navMenu.innerHTML = items.map(item => {
        const isActive = item.page === currentPage ? 'active' : '';
        const badge = item.page === 'timeline' && totalClips > 0
          ? `<span class="nav-badge">${totalClips}</span>`
          : item.page === 'favorites'
            ? '' : '';
        return `<div class="nav-item ${isActive}" data-href="${item.href}">
          <span class="nav-icon">${item.icon}</span>
          <span>${item.label}</span>
          ${badge}
        </div>`;
      }).join('');

      navMenu.querySelectorAll('.nav-item').forEach(el => {
        el.onclick = () => {
          const href = el.getAttribute('data-href');
          window.location.href = href;
        };
      });

      if (!sidebar.querySelector('.nav-menu')) {
        sidebar.appendChild(navMenu);
      }
    }
  },

  getParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }
};
