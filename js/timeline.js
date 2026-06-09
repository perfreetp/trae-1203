const FILTERS_KEY = 'clip_museum_timeline_filters';
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
    sources: [],
    dateRange: 'all',
    contentKinds: []
  }
};

const els = {};

async function init() {
  try { Nav.init('timeline'); } catch (e) { console.warn('Nav init:', e); }
  cacheEls();
  try { await loadData(); } catch (e) { console.error('loadData:', e); }
  try { bindEvents(); } catch (e) { console.error('bindEvents:', e); }
  try { restoreFilterUI(); } catch (e) { console.error('restoreFilterUI:', e); }
  try { renderExtraFilters(); } catch (e) { console.error('renderExtraFilters:', e); }
  try { render(); } catch (e) { console.error('render:', e); document.body.innerHTML += `<div style="padding:20px;color:var(--danger);">页面渲染出错：${e.message}</div>`; }
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
  let saved = null;
  try { saved = await chrome.storage.local.get(FILTERS_KEY); } catch (e) {}
  if (saved && saved[FILTERS_KEY] && typeof saved[FILTERS_KEY] === 'object') {
    state.filters = Object.assign(state.filters, saved[FILTERS_KEY]);
    if (!Array.isArray(state.filters.sources)) state.filters.sources = [];
    if (!Array.isArray(state.filters.contentKinds)) state.filters.contentKinds = [];
  }

  const [clipsRes, settingsRes, sourcesRes] = await Promise.all([
    UI.sendMessage('searchClips', { query: '', filters: {} }),
    UI.sendMessage('getSettings'),
    UI.sendMessage('getSources')
  ]);

  if (clipsRes.success) state.clips = clipsRes.data;
  if (settingsRes.success) state.settings = settingsRes.data;
  if (sourcesRes.success) state.sources = sourcesRes.data;
}

async function persistFilters() {
  try { await chrome.storage.local.set({ [FILTERS_KEY]: state.filters }); }
  catch (e) { console.warn('persist filters failed:', e); }
}

function restoreFilterUI() {
  document.querySelectorAll('[data-filter-type]').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filterType === state.filters.type);
  });
  const favChip = document.querySelector('[data-filter-fav="only"]');
  if (favChip) favChip.classList.toggle('active', state.filters.favOnly);
  const pinChip = document.querySelector('[data-filter-pin="only"]');
  if (pinChip) pinChip.classList.toggle('active', state.filters.pinOnly);
}

function applyFilters() {
  let result = [...state.clips];
  const now = Date.now();
  const ranges = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000
  };

  if (state.filters.type !== 'all') {
    result = result.filter(c => c.type === state.filters.type);
  }
  if (state.filters.favOnly) {
    result = result.filter(c => c.isFavorite);
  }
  if (state.filters.pinOnly) {
    result = result.filter(c => c.isPinned);
  }
  if (state.filters.dateRange !== 'all' && ranges[state.filters.dateRange]) {
    result = result.filter(c => now - (c.timestamp || 0) <= ranges[state.filters.dateRange]);
  }
  if (state.filters.sources && state.filters.sources.length > 0) {
    result = result.filter(c => {
      const s = c.sourceHost || c.sourceApp || '';
      return state.filters.sources.includes(s);
    });
  }
  if (state.filters.contentKinds && state.filters.contentKinds.length > 0) {
    result = result.filter(c => {
      const kinds = [];
      if (c.type === 'image') kinds.push('hasImage');
      if (c.type === 'code') kinds.push('hasCode');
      if (c.tags && c.tags.length > 0) kinds.push('hasTags');
      if (c.isFavorite) kinds.push('hasFav');
      for (const k of state.filters.contentKinds) if (kinds.includes(k)) return true;
      return false;
    });
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
    `<span class="filter-chip ${state.filters.sources.length === 0 ? 'active' : ''}" data-source-all>全部来源</span>` +
    state.sources.slice(0, 12).map(s => {
      const active = state.filters.sources.includes(s.name);
      return `<span class="filter-chip ${active ? 'active' : ''}" data-source="${UI.escapeAttr(s.name)}">
        ${s.hostname ? '' : '🌐'} ${UI.escapeHtml(s.name)} <span style="opacity:0.7;">(${s.count})</span>
      </span>`;
    }).join('');
}

function renderExtraFilters() {
  const dateContainer = document.getElementById('dateRangeFilters');
  if (dateContainer) {
    const ranges = [
      { key: 'all', label: '全部时间' },
      { key: '1h', label: '1小时内' },
      { key: '24h', label: '24小时内' },
      { key: '7d', label: '7天内' },
      { key: '30d', label: '30天内' },
      { key: '90d', label: '90天内' }
    ];
    dateContainer.innerHTML = `<span style="font-weight:500;color:var(--text-secondary);font-size:13px;align-self:center;margin-right:4px;">时间:</span>` +
      ranges.map(r => `<span class="filter-chip ${state.filters.dateRange === r.key ? 'active' : ''}" data-date-range="${r.key}">${r.label}</span>`).join('');
    dateContainer.querySelectorAll('[data-date-range]').forEach(chip => {
      chip.addEventListener('click', async () => {
        dateContainer.querySelectorAll('[data-date-range]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filters.dateRange = chip.dataset.dateRange;
        await persistFilters();
        renderClips();
      });
    });
  }

  const kindsContainer = document.getElementById('kindFilters');
  if (kindsContainer) {
    const kinds = [
      { key: 'hasImage', label: '🖼️ 含图片' },
      { key: 'hasCode', label: '💻 含代码' },
      { key: 'hasTags', label: '🏷️ 带标签' },
      { key: 'hasFav', label: '⭐ 已收藏' }
    ];
    kindsContainer.innerHTML = `<span style="font-weight:500;color:var(--text-secondary);font-size:13px;align-self:center;margin-right:4px;">内容:</span>` +
      kinds.map(k => `<span class="filter-chip ${state.filters.contentKinds.includes(k.key) ? 'active' : ''}" data-content-kind="${k.key}">${k.label}</span>`).join('');
    kindsContainer.querySelectorAll('[data-content-kind]').forEach(chip => {
      chip.addEventListener('click', async () => {
        const k = chip.dataset.contentKind;
        const i = state.filters.contentKinds.indexOf(k);
        if (i >= 0) state.filters.contentKinds.splice(i, 1);
        else state.filters.contentKinds.push(k);
        chip.classList.toggle('active');
        await persistFilters();
        renderClips();
      });
    });
  }
}

function renderClips() {
  const filtered = applyFilters();
  const settingsInfo = state.settings
    ? (state.settings.enableSensitiveMask ? '隐私遮罩：开启' : '隐私遮罩：关闭')
    : '设置读取中';
  const filterDesc = describeFilters();

  if (filtered.length === 0) {
    els.timelineContent.innerHTML = `
      <div class="card" style="text-align:center;padding:60px 20px;">
        <div class="empty-icon">📭</div>
        <div class="empty-title">暂无内容</div>
        <div class="empty-desc">${filterDesc ? filterDesc + '<br>' : ''}复制一些文本、链接或图片，它们会自动出现在这里<br><span style="font-size:12px;color:var(--text-muted);margin-top:8px;display:block;">✅ ${settingsInfo}</span></div>
      </div>`;
    return;
  }

  const groups = groupByDate(filtered);
  const layoutClass = state.layout === 'grid' ? 'grid-layout' : 'list-layout';

  els.timelineContent.innerHTML = `
    ${filterDesc ? `<div class="card" style="margin-bottom:14px;padding:10px 16px;font-size:13px;color:var(--text-secondary);">${filterDesc} · 共 ${filtered.length} 条结果</div>` : ''}
    ${groups.map(group => `
      <div class="timeline-group">
        <div class="timeline-header">
          <span class="timeline-date">${group.label}</span>
          <span class="timeline-count">${group.clips.length} 条</span>
        </div>
        <div class="${layoutClass}">
          ${group.clips.map(clip => renderClipCard(clip)).join('')}
        </div>
      </div>
    `).join('')}
  `;

  attachClipEvents();
}

function describeFilters() {
  const parts = [];
  const rangesLabel = { '1h': '1小时内', '24h': '24小时内', '7d': '7天内', '30d': '30天内', '90d': '90天内' };
  const kindsLabel = { hasImage: '含图片', hasCode: '含代码', hasTags: '带标签', hasFav: '已收藏' };
  const typeLabel = { text: '文本', link: '链接', code: '代码', image: '图片' };
  if (state.filters.type !== 'all') parts.push(`类型: ${typeLabel[state.filters.type] || state.filters.type}`);
  if (state.filters.dateRange !== 'all') parts.push(`时间: ${rangesLabel[state.filters.dateRange]}`);
  if (state.filters.sources.length > 0) parts.push(`来源: ${state.filters.sources.join(' / ')}`);
  if (state.filters.contentKinds.length > 0) parts.push(`内容: ${state.filters.contentKinds.map(k => kindsLabel[k] || k).join(' / ')}`);
  if (state.filters.favOnly) parts.push('仅收藏');
  if (state.filters.pinOnly) parts.push('仅置顶');
  return parts.length > 0 ? '当前筛选 → ' + parts.join(' · ') : '';
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
    chip.addEventListener('click', async () => {
      document.querySelectorAll('[data-filter-type]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filters.type = chip.dataset.filterType;
      await persistFilters();
      renderClips();
    });
  });

  document.querySelector('[data-filter-fav="only"]').addEventListener('click', async (e) => {
    e.currentTarget.classList.toggle('active');
    state.filters.favOnly = e.currentTarget.classList.contains('active');
    await persistFilters();
    renderClips();
  });

  document.querySelector('[data-filter-pin="only"]').addEventListener('click', async (e) => {
    e.currentTarget.classList.toggle('active');
    state.filters.pinOnly = e.currentTarget.classList.contains('active');
    await persistFilters();
    renderClips();
  });

  document.addEventListener('click', (e) => {
    const sourceAll = e.target.closest('[data-source-all]');
    const sourceChip = e.target.closest('[data-source]');
    if (sourceAll) {
      state.filters.sources = [];
      renderSources();
      renderClips();
    } else if (sourceChip) {
      const s = sourceChip.dataset.source;
      const i = state.filters.sources.indexOf(s);
      if (i >= 0) state.filters.sources.splice(i, 1);
      else state.filters.sources.push(s);
      (async () => {
        await persistFilters();
        renderSources();
        renderClips();
      })();
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
