const state = {
  clips: [],
  pinned: [],
  favorites: [],
  tags: [],
  selectedIds: new Set(),
  selectMode: false,
  layout: 'grid',
  currentTag: 'all'
};

async function init() {
  Nav.init('favorites');
  await loadData();
  bindEvents();
  render();
}

async function loadData() {
  const r = await UI.sendMessage('searchClips', { query: '', filters: {} });
  if (r.success) {
    state.clips = r.data;
    state.pinned = r.data.filter(c => c.isPinned).sort((a, b) => b.lastAccessed - a.lastAccessed);
    state.favorites = r.data.filter(c => c.isFavorite && !c.isPinned).sort((a, b) => b.lastAccessed - a.lastAccessed);
  }
  const t = await UI.sendMessage('getTags');
  if (t.success) state.tags = t.data;
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
    contentHtml = `<div class="clip-content">${UI.escapeHtml(UI.truncate(clip.content, 250))}</div>`;
  }

  const tagsHtml = clip.tags && clip.tags.length > 0
    ? `<div class="clip-tags">${clip.tags.slice(0, 5).map(t => `<span class="tag tag-clickable">#${UI.escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const maxCopy = Math.max(...state.clips.map(c => c.copyCount || 0), 1);
  const barWidth = Math.min(100, ((clip.copyCount || 0) / maxCopy) * 100);

  return `
    <div class="clip-card ${pinnedClass} ${selectedClass}" data-id="${clip.id}">
      ${state.selectMode ? `<input type="checkbox" class="clip-checkbox checkbox" data-id="${clip.id}" ${selected ? 'checked' : ''}>` : ''}
      <div class="clip-header">
        <span class="clip-type-badge type-${clip.type}">${UI.getTypeIcon(clip.type)} ${UI.getTypeLabel(clip.type)}</span>
        <div class="clip-actions">
          <button class="icon-btn ${clip.isPinned ? 'active' : ''}" data-action="pin" title="${clip.isPinned ? '取消置顶' : '置顶'}">📌</button>
          <button class="icon-btn favorite active" data-action="fav" title="取消收藏">❤️</button>
          <button class="icon-btn" data-action="copy" title="复制">📋</button>
          <button class="icon-btn" data-action="detail" title="详情">ℹ️</button>
          <button class="icon-btn" data-action="delete" title="移除" style="color:var(--danger);">🗑️</button>
        </div>
      </div>
      <h3 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:8px;word-break:break-word;">${UI.escapeHtml(clip.title || '')}</h3>
      ${contentHtml}
      ${tagsHtml}
      <div class="view-count-bar"><div class="view-count-fill" style="width:${barWidth}%;"></div></div>
      <div class="clip-footer" style="margin-top:8px;">
        <div class="clip-meta">
          <span>🌐 ${UI.escapeHtml(clip.sourceHost || clip.sourceApp || '未知')}</span>
          <span>🕐 ${UI.formatRelativeTime(clip.timestamp)}</span>
        </div>
        <div class="clip-stats">
          <span class="clip-stat">📋 ${clip.copyCount || 0}</span>
        </div>
      </div>
    </div>
  `;
}

function attachEvents(container) {
  container.querySelectorAll('.clip-card').forEach(card => {
    const id = card.dataset.id;

    card.querySelector('[data-action="copy"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const clip = state.clips.find(c => c.id === id);
      if (!clip) return;
      await UI.sendMessage('incrementCopyCount', { id });
      await UI.copyToClipboard(clip.imageData ? '' : clip.content);
      UI.toast('已复制', 'success', 1500);
      await loadData();
      render();
    });

    card.querySelector('[data-action="fav"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await UI.sendMessage('toggleFavorite', { id });
      UI.toast('已取消收藏', 'success', 1200);
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
      if (await UI.confirm('确定要从收藏中移除吗？（数据不会被删除，仅取消收藏）')) {
        await UI.sendMessage('toggleFavorite', { id });
        UI.toast('已移除', 'success', 1200);
        state.selectedIds.delete(id);
        await loadData();
        render();
      }
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

function filterFavsByTag(clips) {
  if (state.currentTag === 'all') return clips;
  return clips.filter(c => c.tags && c.tags.includes(state.currentTag));
}

function render() {
  document.getElementById('pinnedCount').textContent = `${state.pinned.length} 条置顶`;

  const pinnedEl = document.getElementById('pinnedSection');
  if (state.pinned.length === 0) {
    pinnedEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📌</div><div class="empty-title">暂无置顶内容</div><div class="empty-desc">在时间轴中将重要的片段置顶，它们会显示在这里</div></div>`;
  } else {
    const layoutClass = state.layout === 'grid' ? 'grid-layout' : 'list-layout';
    pinnedEl.innerHTML = `<div class="${layoutClass}">${state.pinned.map(renderClipCard).join('')}</div>`;
    attachEvents(pinnedEl);
  }

  const filterBar = document.querySelector('.filters-bar');
  filterBar.innerHTML = `<span class="filter-chip ${state.currentTag === 'all' ? 'active' : ''}" data-tag-chip="all">全部标签 (${state.favorites.length})</span>` +
    state.tags.map(tag => {
      const count = state.favorites.filter(c => c.tags && c.tags.includes(tag)).length;
      if (count === 0) return '';
      return `<span class="filter-chip ${state.currentTag === tag ? 'active' : ''}" data-tag-chip="${UI.escapeAttr(tag)}">#${UI.escapeHtml(tag)} (${count})</span>`;
    }).join('');

  filterBar.querySelectorAll('[data-tag-chip]').forEach(chip => {
    chip.addEventListener('click', () => {
      state.currentTag = chip.dataset.tagChip;
      render();
    });
  });

  const filtered = filterFavsByTag(state.favorites);
  const favEl = document.getElementById('favoritesContent');
  if (filtered.length === 0) {
    favEl.innerHTML = `<div class="empty-state" style="margin-top:20px;"><div class="empty-icon">⭐</div><div class="empty-title">${state.currentTag === 'all' ? '暂无收藏内容' : '该标签下没有收藏内容'}</div><div class="empty-desc">在时间轴中收藏你喜欢的片段，它们会出现在这里</div></div>`;
  } else {
    const layoutClass = state.layout === 'grid' ? 'grid-layout' : 'list-layout';
    favEl.innerHTML = `<div class="${layoutClass}">${filtered.map(renderClipCard).join('')}</div>`;
    attachEvents(favEl);
  }

  updateBulkUI();
}

function updateBulkUI() {
  const el = document.getElementById('bulkActions');
  const count = state.selectedIds.size;
  if (state.selectMode) {
    el.style.display = 'flex';
    document.getElementById('selectedCount').textContent = count;
  } else {
    el.style.display = 'none';
  }
}

function bindEvents() {
  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.layout = btn.dataset.layout;
      render();
    });
  });

  document.getElementById('selectModeBtn').addEventListener('click', () => {
    state.selectMode = !state.selectMode;
    state.selectedIds.clear();
    const btn = document.getElementById('selectModeBtn');
    btn.textContent = state.selectMode ? '✅ 选择中' : '☑️ 批量管理';
    btn.classList.toggle('btn-primary', state.selectMode);
    btn.classList.toggle('btn-secondary', !state.selectMode);
    render();
  });

  document.getElementById('cancelSelectBtn').addEventListener('click', () => {
    state.selectMode = false;
    state.selectedIds.clear();
    document.getElementById('selectModeBtn').textContent = '☑️ 批量管理';
    document.getElementById('selectModeBtn').classList.remove('btn-primary');
    render();
  });

  document.getElementById('bulkUnfavBtn').addEventListener('click', async () => {
    if (state.selectedIds.size === 0) return;
    if (!await UI.confirm(`确定取消收藏这 ${state.selectedIds.size} 项吗？`)) return;
    await UI.sendMessage('bulkFavorite', { clipIds: [...state.selectedIds], favorite: false });
    UI.toast('已取消收藏', 'success');
    state.selectedIds.clear();
    state.selectMode = false;
    await loadData();
    render();
  });

  document.getElementById('bulkPinBtn').addEventListener('click', async () => {
    if (state.selectedIds.size === 0) return;
    for (const id of state.selectedIds) {
      await UI.sendMessage('togglePin', { id });
    }
    UI.toast('操作完成', 'success');
    state.selectedIds.clear();
    await loadData();
    render();
  });

  document.getElementById('bulkTagBtn').addEventListener('click', async () => {
    if (state.selectedIds.size === 0) return;
    const tagStr = await UI.prompt(`为 ${state.selectedIds.size} 项添加标签（逗号分隔）`);
    if (!tagStr) return;
    const tags = tagStr.split(/[,，\s]+/).filter(Boolean);
    await UI.sendMessage('bulkAddTags', { clipIds: [...state.selectedIds], tags });
    UI.toast('已添加标签', 'success');
    state.selectedIds.clear();
    await loadData();
    render();
  });

  document.getElementById('bulkExportBtn').addEventListener('click', () => {
    if (state.selectedIds.size === 0) {
      UI.toast('请先选择要导出的项目', 'warning');
      return;
    }
    const selected = state.clips.filter(c => state.selectedIds.has(c.id));
    exportClips(selected, `收藏精选_${Date.now()}.json`, 'json');
    UI.toast(`已导出 ${selected.length} 项`, 'success');
  });

  document.getElementById('exportAllFavBtn').addEventListener('click', () => {
    const all = [...state.pinned, ...state.favorites];
    exportClips(all, `收藏精选集_${Date.now()}.json`, 'json');
  });

  document.getElementById('exportFavBtn').addEventListener('click', () => {
    window.location.href = 'cleanup.html';
  });

  document.getElementById('backHome').addEventListener('click', () => {
    window.location.href = 'timeline.html';
  });
}

function exportClips(clips, filename, format) {
  let content = '';
  let mimeType = 'application/json';
  if (format === 'json') {
    content = JSON.stringify(clips.map(c => ({
      title: c.title, content: c.content, type: c.type,
      tags: c.tags, source: c.sourceApp || c.sourceHost,
      timestamp: UI.formatTimestamp(c.timestamp), copyCount: c.copyCount
    })), null, 2);
  } else if (format === 'markdown') {
    content = clips.map((c, i) => `## ${i + 1}. ${c.title}\n\n类型: ${UI.getTypeLabel(c.type)} | 标签: ${(c.tags || []).join(', ')}\n\n${c.content}\n\n---\n`).join('\n');
    mimeType = 'text/markdown';
  } else {
    content = clips.map(c => c.content).join('\n\n=== === ===\n\n');
    mimeType = 'text/plain';
  }
  UI.downloadFile(filename, content, mimeType);
}

init();
