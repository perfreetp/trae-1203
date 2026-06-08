const state = {
  clips: [],
  settings: null,
  sources: [],
  selectedIds: new Set(),
  selectMode: false,
  layout: 'grid',
  filters: {
    type: 'all',
    favOnly: false,
    pinOnly: false,
    source: null
  }
};

const els = {};

async function init() {
  Nav.init('timeline');
  cacheEls();
  await loadData();
  bindEvents();
  render();
}

function cacheEls() {
  els.statsGrid = document.getElementById('statsGrid');
  els.sourcesFilter = document.getElementById('sourcesFilter');
  els.timelineContent = document.getElementById('timelineContent');
  els.bulkActions = document.getElementById('bulkActions');
  els.selectedCount = document.getElementById('selectedCount');
  els.pauseToggle = document.getElementById('pauseToggle');
  els.exportBtn = document.getElementById('exportBtn');
  els.selectModeBtn = document.getElementById('selectModeBtn');
}

async function loadData() {
  const [clipsRes, settingsRes, sourcesRes] = await Promise.all([
    UI.sendMessage('searchClips', { query: '', filters: {} }),
    UI.sendMessage('getSettings'),
    UI.sendMessage('getSources')
  ]);

  if (clipsRes.success) state.clips = clipsRes.data;
  if (settingsRes.success) state.settings = settingsRes.data;
  if (sourcesRes.success) state.sources = sourcesRes.data;
}

function applyFilters() {
  let result = [...state.clips];

  if (state.filters.type !== 'all') {
    result = result.filter(c => c.type === state.filters.type);
  }
  if (state.filters.favOnly) {
    result = result.filter(c => c.isFavorite);
  }
  if (state.filters.pinOnly) {
    result = result.filter(c => c.isPinned);
  }
  if (state.filters.source) {
    result = result.filter(c => c.sourceHost === state.filters.source || c.sourceApp === state.filters.source);
  }

  return result;
}

function groupByDate(clips) {
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

function render() {
  renderStats();
  renderSources();
  renderClips();
  updateBulkUI();
  updatePauseUI();
}

function renderStats() {
  const total = state.clips.length;
  const fav = state.clips.filter(c => c.isFavorite).length;
  const pinned = state.clips.filter(c => c.isPinned).length;
  const today = state.clips.filter(c => Date.now() - c.timestamp < 24 * 3600 * 1000).length;
  const totalCopies = state.clips.reduce((s, c) => s + (c.copyCount || 0), 0);

  els.statsGrid.innerHTML = `
    <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-value">${total}</div><div class="stat-label">总条目</div></div>
    <div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-value">${fav}</div><div class="stat-label">已收藏</div></div>
    <div class="stat-card"><div class="stat-icon">📌</div><div class="stat-value">${pinned}</div><div class="stat-label">已置顶</div></div>
    <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-value">${today}</div><div class="stat-label">今日新增</div></div>
    <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-value">${totalCopies}</div><div class="stat-label">累计复制次数</div></div>
    <div class="stat-card"><div class="stat-icon">🌐</div><div class="stat-value">${state.sources.length}</div><div class="stat-label">来源网站</div></div>
  `;
}

function renderSources() {
  if (state.sources.length === 0) {
    els.sourcesFilter.style.display = 'none';
    return;
  }
  els.sourcesFilter.style.display = 'flex';
  els.sourcesFilter.innerHTML = `<span style="font-weight:500;color:var(--text-secondary);font-size:13px;align-self:center;margin-right:4px;">来源:</span>` +
    `<span class="filter-chip ${state.filters.source === null ? 'active' : ''}" data-source-clear>全部来源</span>` +
    state.sources.slice(0, 12).map(s =>
      `<span class="filter-chip ${state.filters.source === s.name ? 'active' : ''}" data-source="${UI.escapeAttr(s.name)}">
        ${s.hostname ? '' : '🌐'} ${UI.escapeHtml(s.name)} <span style="opacity:0.7;">(${s.count})</span>
      </span>`
    ).join('');
}

function renderClips() {
  const filtered = applyFilters();

  if (filtered.length === 0) {
    els.timelineContent.innerHTML = `
      <div class="card" style="text-align:center;padding:60px 20px;">
        <div class="empty-icon">📭</div>
        <div class="empty-title">暂无内容</div>
        <div class="empty-desc">复制一些文本、链接或图片，它们会自动出现在这里</div>
      </div>`;
    return;
  }

  const groups = groupByDate(filtered);
  const layoutClass = state.layout === 'grid' ? 'grid-layout' : 'list-layout';

  els.timelineContent.innerHTML = groups.map(group => `
    <div class="timeline-group">
      <div class="timeline-header">
        <span class="timeline-date">${group.label}</span>
        <span class="timeline-count">${group.clips.length} 条</span>
      </div>
      <div class="${layoutClass}">
        ${group.clips.map(clip => renderClipCard(clip)).join('')}
      </div>
    </div>
  `).join('');

  attachClipEvents();
}

function renderClipCard(clip) {
  const selected = state.selectedIds.has(clip.id);
  const pinnedClass = clip.isPinned ? 'pinned' : '';
  const selectedClass = selected ? 'selected' : '';

  let contentHtml = '';
  if (clip.type === 'image' && clip.imageData) {
    contentHtml = `<div class="clip-content image-content"><img src="${clip.imageData}" alt="图片"></div>`;
  } else if (clip.type === 'code') {
    contentHtml = `<div class="clip-content code-content">${UI.escapeHtml(UI.truncate(clip.content, 300))}</div>`;
  } else if (clip.type === 'link') {
    contentHtml = `<div class="clip-content link-content"><a href="${UI.escapeAttr(clip.content)}" target="_blank" onclick="event.stopPropagation();">${UI.escapeHtml(UI.truncate(clip.content, 200))}</a></div>`;
  } else {
    let text = clip.content;
    if (state.settings?.enableSensitiveMask) {
      text = UI.maskSensitive(text, state.settings.sensitiveWords);
    } else {
      text = UI.escapeHtml(text);
    }
    contentHtml = `<div class="clip-content">${UI.truncate(text, 250)}</div>`;
  }

  const tagsHtml = clip.tags && clip.tags.length > 0
    ? `<div class="clip-tags">${clip.tags.slice(0, 5).map(t => `<span class="tag tag-clickable" data-tag="${UI.escapeAttr(t)}">#${UI.escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const favActive = clip.isFavorite ? 'active' : '';
  const pinActive = clip.isPinned ? 'active' : '';

  return `
    <div class="clip-card ${pinnedClass} ${selectedClass}" data-id="${clip.id}">
      ${state.selectMode ? `<input type="checkbox" class="clip-checkbox checkbox" data-id="${clip.id}" ${selected ? 'checked' : ''}>` : ''}
      <div class="clip-header">
        <span class="clip-type-badge type-${clip.type}">${UI.getTypeIcon(clip.type)} ${UI.getTypeLabel(clip.type)}</span>
        <div class="clip-actions">
          <button class="icon-btn pin ${pinActive}" data-action="pin" title="${clip.isPinned ? '取消置顶' : '置顶'}">📌</button>
          <button class="icon-btn favorite ${favActive}" data-action="fav" title="${clip.isFavorite ? '取消收藏' : '收藏'}">${clip.isFavorite ? '❤️' : '🤍'}</button>
          <button class="icon-btn" data-action="copy" title="复制">📋</button>
          <button class="icon-btn" data-action="detail" title="查看详情">ℹ️</button>
          <button class="icon-btn" data-action="delete" title="删除" style="color:var(--danger);">🗑️</button>
        </div>
      </div>
      <h3 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:8px;word-break:break-word;">${UI.escapeHtml(clip.title || '')}</h3>
      ${contentHtml}
      ${tagsHtml}
      <div class="clip-footer">
        <div class="clip-meta">
          <span class="clip-source">🌐 ${UI.escapeHtml(clip.sourceHost || clip.sourceApp || '未知来源')}</span>
          <span>🕐 ${UI.formatRelativeTime(clip.timestamp)}</span>
        </div>
        <div class="clip-stats">
          <span class="clip-stat">📋 ${clip.copyCount || 0}</span>
        </div>
      </div>
    </div>
  `;
}

function attachClipEvents() {
  document.querySelectorAll('.clip-card').forEach(card => {
    const id = card.dataset.id;

    card.querySelector('[data-action="copy"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const clip = state.clips.find(c => c.id === id);
      if (!clip) return;
      await UI.sendMessage('incrementCopyCount', { id });
      const ok = await UI.copyToClipboard(clip.imageData ? '(图片数据，需手动粘贴)' : clip.content);
      if (ok) UI.toast('已复制', 'success', 1500);
      await loadData();
      render();
    });

    card.querySelector('[data-action="fav"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await UI.sendMessage('toggleFavorite', { id });
      UI.toast('操作成功', 'success', 1200);
      await loadData();
      render();
    });

    card.querySelector('[data-action="pin"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await UI.sendMessage('togglePin', { id });
      UI.toast('操作成功', 'success', 1200);
      await loadData();
      render();
    });

    card.querySelector('[data-action="detail"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `detail.html?id=${id}`;
    });

    card.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await UI.confirm('确定要删除这条记录吗？')) {
        await UI.sendMessage('deleteClip', { id });
        UI.toast('已删除', 'success', 1200);
        state.selectedIds.delete(id);
        await loadData();
        render();
      }
    });

    card.querySelectorAll('[data-tag]').forEach(tag => {
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    const checkbox = card.querySelector('.clip-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (e.target.checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
        card.classList.toggle('selected', e.target.checked);
        updateBulkUI();
      });
    }
  });
}

function updateBulkUI() {
  const count = state.selectedIds.size;
  if (state.selectMode) {
    els.bulkActions.style.display = 'flex';
    els.selectedCount.textContent = count;
  } else {
    els.bulkActions.style.display = 'none';
  }
}

function updatePauseUI() {
  if (state.settings?.isPaused) {
    els.pauseToggle.innerHTML = '▶️ 开启';
  } else {
    els.pauseToggle.innerHTML = '⏸️ 暂停';
  }
}

function bindEvents() {
  document.querySelectorAll('[data-filter-type]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-type]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filters.type = chip.dataset.filterType;
      renderClips();
    });
  });

  document.querySelector('[data-filter-fav="only"]').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
    state.filters.favOnly = e.currentTarget.classList.contains('active');
    renderClips();
  });

  document.querySelector('[data-filter-pin="only"]').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
    state.filters.pinOnly = e.currentTarget.classList.contains('active');
    renderClips();
  });

  document.addEventListener('click', (e) => {
    const sourceClear = e.target.closest('[data-source-clear]');
    const sourceChip = e.target.closest('[data-source]');
    if (sourceClear) {
      state.filters.source = null;
      renderSources();
      renderClips();
    } else if (sourceChip) {
      state.filters.source = sourceChip.dataset.source;
      renderSources();
      renderClips();
    }
  });

  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.layout = btn.dataset.layout;
      renderClips();
    });
  });

  els.selectModeBtn.addEventListener('click', () => {
    state.selectMode = !state.selectMode;
    state.selectedIds.clear();
    els.selectModeBtn.textContent = state.selectMode ? '✅ 选择中' : '☑️ 批量选择';
    els.selectModeBtn.classList.toggle('btn-primary', state.selectMode);
    els.selectModeBtn.classList.toggle('btn-secondary', !state.selectMode);
    renderClips();
    updateBulkUI();
  });

  document.getElementById('bulkFavBtn').addEventListener('click', async () => {
    if (state.selectedIds.size === 0) return;
    await UI.sendMessage('bulkFavorite', { clipIds: [...state.selectedIds], favorite: true });
    UI.toast(`已收藏 ${state.selectedIds.size} 项`, 'success');
    state.selectedIds.clear();
    await loadData();
    render();
  });

  document.getElementById('bulkTagBtn').addEventListener('click', async () => {
    if (state.selectedIds.size === 0) return;
    const tagStr = await UI.prompt(`为 ${state.selectedIds.size} 项添加标签（多个标签用逗号分隔）`);
    if (!tagStr) return;
    const tags = tagStr.split(/[,，\s]+/).filter(Boolean);
    if (tags.length === 0) return;
    await UI.sendMessage('bulkAddTags', { clipIds: [...state.selectedIds], tags });
    UI.toast(`已添加标签到 ${state.selectedIds.size} 项`, 'success');
    state.selectedIds.clear();
    await loadData();
    render();
  });

  document.getElementById('bulkDelBtn').addEventListener('click', async () => {
    if (state.selectedIds.size === 0) return;
    if (!await UI.confirm(`确定要删除选中的 ${state.selectedIds.size} 项吗？此操作不可撤销！`)) return;
    const count = await UI.sendMessage('bulkDelete', { clipIds: [...state.selectedIds] });
    UI.toast(`已删除 ${count.data || state.selectedIds.size} 项`, 'success');
    state.selectedIds.clear();
    await loadData();
    render();
  });

  document.getElementById('cancelSelectBtn').addEventListener('click', () => {
    state.selectMode = false;
    state.selectedIds.clear();
    els.selectModeBtn.textContent = '☑️ 批量选择';
    els.selectModeBtn.classList.remove('btn-primary');
    els.selectModeBtn.classList.add('btn-secondary');
    renderClips();
    updateBulkUI();
  });

  els.pauseToggle.addEventListener('click', async () => {
    const r = await UI.sendMessage('togglePause');
    if (r.success) {
      state.settings.isPaused = r.data;
      updatePauseUI();
      UI.toast(r.data ? '已暂停采集' : '已开始采集', 'info', 1500);
    }
  });

  els.exportBtn.addEventListener('click', () => {
    window.location.href = 'cleanup.html';
  });
}

init();
