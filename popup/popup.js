const state = {
  currentTab: 'recent',
  searchQuery: '',
  settings: null,
  clips: []
};

const elements = {
  statusToggle: document.getElementById('statusToggle'),
  statusText: document.getElementById('statusText'),
  searchInput: document.getElementById('searchInput'),
  clipList: document.getElementById('clipList'),
  statsText: document.getElementById('statsText'),
  openFull: document.getElementById('openFull'),
  btnCapturePage: document.getElementById('btnCapturePage'),
  btnSearch: document.getElementById('btnSearch'),
  btnFavorites: document.getElementById('btnFavorites'),
  btnSettings: document.getElementById('btnSettings'),
  tabs: document.querySelectorAll('.popup-tab')
};

async function init() {
  await loadSettings();
  await loadClips();
  bindEvents();
  render();
}

async function loadSettings() {
  const r = await UI.sendMessage('getSettings');
  if (r.success) {
    state.settings = r.data;
    updateStatusUI();
  }
}

function updateStatusUI() {
  if (state.settings.isPaused) {
    elements.statusToggle.className = 'popup-status status-paused';
    elements.statusText.textContent = '已暂停';
  } else {
    elements.statusToggle.className = 'popup-status status-active';
    elements.statusText.textContent = '采集中';
  }
}

async function loadClips() {
  const filters = {};
  if (state.currentTab === 'pinned') filters.isPinned = true;
  else if (state.currentTab === 'favorite') filters.isFavorite = true;

  let results;
  if (state.currentTab === 'top') {
    const r = await UI.sendMessage('getTopClips', { limit: 20 });
    results = r.success ? r.data : [];
  } else {
    const r = await UI.sendMessage('searchClips', { query: state.searchQuery, filters });
    results = r.success ? r.data : [];
  }

  state.clips = results.slice(0, 30);
  updateStats();
}

function updateStats() {
  const all = state.searchQuery ? state.clips.length : state.clips.length;
  elements.statsText.textContent = `共 ${all} 条${state.searchQuery ? ' 搜索结果' : ''}`;
}

function render() {
  if (state.clips.length === 0) {
    elements.clipList.innerHTML = `
      <div class="empty-popup">
        <div class="empty-popup-icon">${state.searchQuery ? '🔍' : '📋'}</div>
        <div class="empty-popup-text">${state.searchQuery ? '没有找到匹配的内容' : '还没有任何剪切记录，复制点什么试试吧！'}</div>
      </div>`;
    return;
  }

  elements.clipList.innerHTML = state.clips.map((clip, idx) => renderClip(clip, idx)).join('');

  elements.clipList.querySelectorAll('.popup-clip').forEach((el, idx) => {
    const clip = state.clips[idx];

    el.onclick = async (e) => {
      if (e.target.closest('.mini-action')) return;
      await UI.sendMessage('incrementCopyCount', { id: clip.id });
      const ok = await UI.copyToClipboard(clip.imageData ? '(图片)' : clip.content);
      if (ok) UI.toast('已复制到剪贴板', 'success', 1500);
      setTimeout(() => window.close(), 200);
    };

    const favBtn = el.querySelector('.mini-fav');
    if (favBtn) {
      favBtn.onclick = async (e) => {
        e.stopPropagation();
        const r = await UI.sendMessage('toggleFavorite', { id: clip.id });
        if (r.success) {
          UI.toast(r.data.isFavorite ? '已收藏' : '已取消收藏', 'success', 1200);
          loadClips().then(render);
        }
      };
    }

    const pinBtn = el.querySelector('.mini-pin');
    if (pinBtn) {
      pinBtn.onclick = async (e) => {
        e.stopPropagation();
        const r = await UI.sendMessage('togglePin', { id: clip.id });
        if (r.success) {
          UI.toast(r.data.isPinned ? '已置顶' : '已取消置顶', 'success', 1200);
          loadClips().then(render);
        }
      };
    }

    const detailBtn = el.querySelector('.mini-detail');
    if (detailBtn) {
      detailBtn.onclick = (e) => {
        e.stopPropagation();
        chrome.tabs.create({ url: chrome.runtime.getURL(`pages/detail.html?id=${clip.id}`) });
      };
    }
  });
}

function renderClip(clip, idx) {
  const typeClass = `type-${clip.type}`;
  const typeLabel = UI.getTypeLabel(clip.type);
  const typeIcon = UI.getTypeIcon(clip.type);

  let contentPreview = '';
  if (clip.type === 'image') {
    contentPreview = `<div class="popup-clip-content image-preview">${typeIcon} 图片 (${clip.imageData ? '已保存' : '无数据'})</div>`;
  } else if (clip.type === 'code') {
    contentPreview = `<div class="popup-clip-content">${UI.escapeHtml(UI.truncate(clip.content, 120))}</div>`;
  } else if (clip.type === 'link') {
    contentPreview = `<div class="popup-clip-content" style="color: var(--primary);">${UI.escapeHtml(UI.truncate(clip.content, 120))}</div>`;
  } else {
    let text = clip.content;
    if (state.settings?.enableSensitiveMask) {
      text = UI.maskSensitive(text, state.settings.sensitiveWords);
    }
    contentPreview = `<div class="popup-clip-content">${state.settings?.enableSensitiveMask ? UI.truncate(UI.maskSensitive(clip.content, state.settings.sensitiveWords), 120) : UI.escapeHtml(UI.truncate(clip.content, 120))}</div>`;
  }

  const tagsHtml = clip.tags && clip.tags.length > 0
    ? `<div class="popup-clip-tags">${clip.tags.slice(0, 3).map(t => `<span class="popup-tag">#${UI.escapeHtml(t)}</span>`).join('')}${clip.tags.length > 3 ? `<span class="popup-tag">+${clip.tags.length - 3}</span>` : ''}</div>`
    : '';

  return `
    <div class="popup-clip">
      <div class="popup-clip-header">
        <span class="popup-clip-type ${typeClass}">${typeIcon} ${typeLabel}</span>
        <div class="popup-clip-icons">
          <span class="mini-action mini-pin popup-mini-icon" title="${clip.isPinned ? '取消置顶' : '置顶'}">${clip.isPinned ? '📌' : '📍'}</span>
          <span class="mini-action mini-fav popup-mini-icon" title="${clip.isFavorite ? '取消收藏' : '收藏'}">${clip.isFavorite ? '❤️' : '🤍'}</span>
          <span class="mini-action mini-detail popup-mini-icon" title="查看详情">ℹ️</span>
        </div>
      </div>
      ${contentPreview}
      ${tagsHtml}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
        <span class="popup-clip-time">${UI.formatRelativeTime(clip.timestamp)} · 复制${clip.copyCount || 1}次</span>
        <span class="popup-clip-time">${clip.sourceHost || clip.sourceApp || ''}</span>
      </div>
    </div>
  `;
}

function bindEvents() {
  elements.statusToggle.onclick = async () => {
    const r = await UI.sendMessage('togglePause');
    if (r.success) {
      state.settings.isPaused = r.data;
      updateStatusUI();
      UI.toast(r.data ? '已暂停采集' : '已开始采集', 'info', 1500);
    }
  };

  elements.searchInput.oninput = UI.debounce(async (e) => {
    state.searchQuery = e.target.value;
    await loadClips();
    render();
  }, 200);

  elements.tabs.forEach(tab => {
    tab.onclick = async () => {
      elements.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentTab = tab.dataset.tab;
      await loadClips();
      render();
    };
  });

  elements.openFull.onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/timeline.html') });
  };

  elements.btnCapturePage.onclick = async () => {
    const r = await UI.sendMessage('captureCurrentPage');
    if (r.success && r.data) {
      UI.toast('已保存当前页面', 'success', 1500);
      await loadClips();
      render();
    } else {
      UI.toast('保存失败', 'error');
    }
  };

  elements.btnSearch.onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/search.html') });
  };

  elements.btnFavorites.onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/favorites.html') });
  };

  elements.btnSettings.onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings.html') });
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.searchQuery) {
      state.searchQuery = '';
      elements.searchInput.value = '';
      loadClips().then(render);
    }
    if (e.key === '/' && document.activeElement !== elements.searchInput) {
      e.preventDefault();
      elements.searchInput.focus();
    }
  });
}

init();
