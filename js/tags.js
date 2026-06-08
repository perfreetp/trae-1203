const state = {
  allTags: [],
  clips: [],
  tagCounts: {},
  searchQuery: '',
  currentTag: null,
  selectedClipIds: new Set()
};

async function init() {
  try {
    Nav.init('tags');
  } catch (e) { console.warn('Nav init error:', e); }
  await loadData();
  bindEvents();
  try { render(); }
  catch (e) {
    console.error('Render error:', e);
    document.body.innerHTML += `<div style="padding:20px;color:var(--danger);">页面渲染出错：${e.message}</div>`;
  }
}

async function loadData() {
  try {
    const [tRes, cRes] = await Promise.all([
      UI.sendMessage('getTags'),
      UI.sendMessage('searchClips', { query: '', filters: {} })
    ]);
    if (tRes && tRes.success) state.allTags = Array.isArray(tRes.data) ? tRes.data : [];
    if (cRes && cRes.success) state.clips = Array.isArray(cRes.data) ? cRes.data : [];
  } catch (e) {
    console.error('loadData error:', e);
    state.allTags = [];
    state.clips = [];
  }

  state.tagCounts = {};
  for (const clip of state.clips) {
    if (!clip || !clip.tags) continue;
    for (const tag of clip.tags) {
      state.tagCounts[tag] = (state.tagCounts[tag] || 0) + 1;
    }
  }
  for (const tag of state.allTags) {
    if (!state.tagCounts[tag]) state.tagCounts[tag] = 0;
  }
}

function render() {
  try { renderStats(); } catch (e) { console.error('renderStats:', e); }
  try { renderTagsList(); } catch (e) { console.error('renderTagsList:', e); }
  try { renderTagFilterChips(); } catch (e) { console.error('renderTagFilterChips:', e); }
  try { renderBulkTagClips(); } catch (e) { console.error('renderBulkTagClips:', e); }
}

function renderStats() {
  const tagCount = state.allTags.length;
  const taggedClipCount = state.clips.filter(c => c && c.tags && c.tags.length > 0).length;
  const totalTagRefs = state.clips.reduce((s, c) => s + ((c && c.tags) ? c.tags.length : 0), 0);
  const avgTags = taggedClipCount > 0 ? (totalTagRefs / taggedClipCount).toFixed(1) : 0;
  const tagEntries = Object.entries(state.tagCounts);
  const maxTag = tagEntries.length > 0 ? tagEntries.sort((a, b) => b[1] - a[1])[0] : null;

  const el = document.getElementById('tagStats');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-icon">🏷️</div><div class="stat-value">${tagCount}</div><div class="stat-label">标签总数</div></div>
    <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-value">${taggedClipCount}</div><div class="stat-label">已打标签的条目</div></div>
    <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-value">${avgTags}</div><div class="stat-label">平均每篇标签数</div></div>
    <div class="stat-card"><div class="stat-icon">🔥</div><div class="stat-value">${maxTag ? maxTag[1] : 0}</div><div class="stat-label">最热门标签: ${maxTag ? '#' + maxTag[0] : '无'}</div></div>
  `;
}

function renderTagsList() {
  const list = document.getElementById('tagsList');
  if (!list) return;
  const query = (state.searchQuery || '').toLowerCase();
  const filteredTags = state.allTags.filter(t => !query || String(t).toLowerCase().includes(query));

  if (filteredTags.length === 0) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🏷️</div><div class="empty-title">${state.searchQuery ? '没有找到匹配的标签' : '暂无标签'}</div><div class="empty-desc">${state.searchQuery ? '' : '点击右上角「创建新标签」开始组织素材'}</div></div>`;
    return;
  }

  list.innerHTML = filteredTags.map(tag => {
    const safeTag = String(tag);
    const count = state.tagCounts[safeTag] || 0;
    const clips = state.clips.filter(c => c && c.tags && c.tags.includes(safeTag));
    const recentTime = clips.length > 0 ? Math.max(...clips.map(c => c.timestamp || 0)) : 0;
    return `
      <div class="card" style="padding:16px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
          <span class="tag" style="font-size:14px;padding:5px 14px;">#${UI.escapeHtml(safeTag)}</span>
          <div style="display:flex;gap:4px;">
            <button class="icon-btn" data-action="rename" data-tag="${UI.escapeAttr(safeTag)}" title="重命名">✏️</button>
            <button class="icon-btn" data-action="delete" data-tag="${UI.escapeAttr(safeTag)}" title="删除" style="color:var(--danger);">🗑️</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-secondary);">
          <div style="display:flex;justify-content:space-between;"><span>📋 条目数量</span><strong style="color:var(--primary);">${count}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>🕐 最近使用</span><span>${recentTime ? UI.formatRelativeTime(recentTime) : '从未'}</span></div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" style="flex:1;" data-action="view" data-tag="${UI.escapeAttr(safeTag)}">查看内容</button>
          <button class="btn btn-primary btn-sm" data-action="merge" data-tag="${UI.escapeAttr(safeTag)}">合并</button>
        </div>
      </div>
    `;
  }).join('');

  try {
    list.querySelectorAll('[data-action="rename"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const oldName = btn.dataset.tag;
        const newName = await UI.prompt('重命名标签', oldName, '输入新的标签名称');
        if (!newName || newName === oldName) return;
        const trimmed = newName.trim();
        if (state.allTags.includes(trimmed)) {
          if (!await UI.confirm(`标签 "#${trimmed}" 已存在，要合并这两个标签吗？`)) return;
          const affected = state.clips.filter(c => c && c.tags && c.tags.includes(oldName));
          for (const clip of affected) {
            const tags = clip.tags.filter(t => t !== oldName);
            if (!tags.includes(trimmed)) tags.push(trimmed);
            await UI.sendMessage('updateClip', { id: clip.id, updates: { tags } });
          }
          await UI.sendMessage('deleteTag', { tag: oldName });
        } else {
          await UI.sendMessage('renameTag', { oldName, newName: trimmed });
        }
        UI.toast('操作成功', 'success');
        await loadData();
        render();
      });
    });

    list.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tag = btn.dataset.tag;
        if (!await UI.confirm(`确定删除标签 "#${tag}" 吗？（所有条目上的此标签都会被移除）`)) return;
        await UI.sendMessage('deleteTag', { tag });
        UI.toast('已删除标签', 'success');
        if (state.currentTag === tag) state.currentTag = null;
        await loadData();
        render();
      });
    });

    list.querySelectorAll('[data-action="view"]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.currentTag = btn.dataset.tag;
        state.selectedClipIds.clear();
        try { renderTagFilterChips(); } catch (e) {}
        try { renderBulkTagClips(); } catch (e) {}
        const area = document.getElementById('bulkTagArea');
        if (area) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    list.querySelectorAll('[data-action="merge"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fromTag = btn.dataset.tag;
        const toTag = await UI.prompt(`将 "#${fromTag}" 的内容合并到哪个标签？（输入标签名）`, '', '输入目标标签名称');
        if (!toTag || toTag === fromTag) return;
        const trimmed = toTag.trim();
        const affected = state.clips.filter(c => c && c.tags && c.tags.includes(fromTag));
        for (const clip of affected) {
          const tags = clip.tags.filter(t => t !== fromTag);
          if (!tags.includes(trimmed)) tags.push(trimmed);
          await UI.sendMessage('updateClip', { id: clip.id, updates: { tags } });
        }
        await UI.sendMessage('deleteTag', { tag: fromTag });
        if (!state.allTags.includes(trimmed)) await UI.sendMessage('saveNewTags', { tags: [trimmed] });
        UI.toast(`已合并到 #${trimmed}`, 'success');
        await loadData();
        render();
      });
    });
  } catch (e) {
    console.error('tag list event binding:', e);
  }
}

function renderTagFilterChips() {
  const container = document.getElementById('tagFilterChips');
  if (!container) return;

  const activeChips = [];
  activeChips.push('<span class="filter-chip ' + (state.currentTag === null ? 'active' : '') + '" data-view-all>全部 (查看所有内容以批量打标签)</span>');
  for (const t of state.allTags) {
    const count = state.tagCounts[t] || 0;
    if (count <= 0) continue;
    activeChips.push(
      `<span class="filter-chip ${state.currentTag === t ? 'active' : ''}" data-view-tag="${UI.escapeAttr(t)}">#${UI.escapeHtml(t)} (${count})</span>`
    );
  }
  container.innerHTML = activeChips.join('');

  const allBtn = container.querySelector('[data-view-all]');
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      state.currentTag = null;
      state.selectedClipIds.clear();
      try { renderTagFilterChips(); } catch (e) {}
      try { renderBulkTagClips(); } catch (e) {}
    });
  }

  container.querySelectorAll('[data-view-tag]').forEach(chip => {
    chip.addEventListener('click', () => {
      state.currentTag = chip.dataset.viewTag;
      state.selectedClipIds.clear();
      try { renderTagFilterChips(); } catch (e) {}
      try { renderBulkTagClips(); } catch (e) {}
    });
  });
}

function renderBulkTagClips() {
  const container = document.getElementById('bulkTagClips');
  if (!container) return;

  let clips = state.currentTag
    ? state.clips.filter(c => c && c.tags && c.tags.includes(state.currentTag))
    : state.clips.slice(0, 50);

  if (clips.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">没有内容</div><div class="empty-desc">${state.currentTag ? '此标签下没有内容' : '先复制一些内容吧'}</div></div>`;
    return;
  }

  const selectAllChecked = clips.length > 0 && clips.every(c => state.selectedClipIds.has(c.id));
  container.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;padding:10px;background:var(--bg-secondary);border-radius:var(--radius-sm);flex-wrap:wrap;">
      <input type="checkbox" class="checkbox" id="tagSelectAll" ${selectAllChecked ? 'checked' : ''}>
      <label for="tagSelectAll" style="cursor:pointer;font-size:13px;">全选 (${clips.length} 项)</label>
      <div style="flex:1;"></div>
      <span style="font-size:13px;color:var(--text-muted);">已选 ${state.selectedClipIds.size} 项</span>
      <button class="btn btn-secondary btn-sm" id="tagAddBtn" ${state.selectedClipIds.size === 0 ? 'disabled' : ''}>➕ 添加标签</button>
      <button class="btn btn-secondary btn-sm" id="tagRemoveBtn" ${!state.currentTag || state.selectedClipIds.size === 0 ? 'disabled' : ''}>➖ 移除当前标签</button>
    </div>
    <div class="grid-layout">
      ${clips.map(clip => {
        const typeIcon = UI.getTypeIcon(clip.type);
        const typeLabel = UI.getTypeLabel(clip.type);
        const contentText = clip.type === 'image' ? '🖼️ 图片内容' : UI.escapeHtml(UI.truncate(clip.content || '', 100));
        const tagsHtml = clip.tags && clip.tags.length > 0
          ? clip.tags.map(t => `<span class="tag">#${UI.escapeHtml(t)}</span>`).join('')
          : '';
        return `
          <div class="clip-card ${state.selectedClipIds.has(clip.id) ? 'selected' : ''}" style="position:relative;">
            <input type="checkbox" class="checkbox" style="position:absolute;top:12px;right:12px;z-index:3;" data-clip-check="${clip.id}" ${state.selectedClipIds.has(clip.id) ? 'checked' : ''}>
            <div style="padding-right:36px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span class="clip-type-badge type-${clip.type}">${typeIcon} ${typeLabel}</span>
                <span style="font-size:12px;color:var(--text-muted);">${UI.formatRelativeTime(clip.timestamp || Date.now())}</span>
              </div>
              <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;word-break:break-word;max-height:80px;overflow:hidden;">${contentText}</div>
              ${tagsHtml ? `<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">${tagsHtml}</div>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  const selAll = document.getElementById('tagSelectAll');
  if (selAll) {
    selAll.addEventListener('change', (e) => {
      if (e.target.checked) clips.forEach(c => state.selectedClipIds.add(c.id));
      else clips.forEach(c => state.selectedClipIds.delete(c.id));
      try { renderBulkTagClips(); } catch (e) { console.error(e); }
    });
  }

  container.querySelectorAll('[data-clip-check]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const id = cb.dataset.clipCheck;
      if (cb.checked) state.selectedClipIds.add(id);
      else state.selectedClipIds.delete(id);
      try { renderBulkTagClips(); } catch (e) { console.error(e); }
    });
  });

  const addBtn = document.getElementById('tagAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      if (state.selectedClipIds.size === 0) return;
      const tagStr = await UI.prompt(`为 ${state.selectedClipIds.size} 项添加标签（多个用逗号分隔）`);
      if (!tagStr) return;
      const tags = tagStr.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean);
      if (tags.length === 0) return;
      await UI.sendMessage('bulkAddTags', { clipIds: [...state.selectedClipIds], tags });
      UI.toast(`已为 ${state.selectedClipIds.size} 项添加标签`, 'success');
      state.selectedClipIds.clear();
      await loadData();
      render();
    });
  }

  const removeBtn = document.getElementById('tagRemoveBtn');
  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      if (!state.currentTag || state.selectedClipIds.size === 0) return;
      if (!await UI.confirm(`确定从这 ${state.selectedClipIds.size} 项中移除标签 "#${state.currentTag}" 吗？`)) return;
      for (const id of state.selectedClipIds) {
        await UI.sendMessage('removeTag', { id, tag: state.currentTag });
      }
      UI.toast('已移除标签', 'success');
      state.selectedClipIds.clear();
      await loadData();
      render();
    });
  }
}

function bindEvents() {
  const createBtn = document.getElementById('createTagBtn');
  const createHandler = async () => {
    try {
      const tag = await UI.prompt('创建新标签', '', '输入标签名称');
      if (!tag) return;
      const trimmed = tag.trim();
      if (!trimmed) return;
      if (state.allTags.includes(trimmed)) {
        UI.toast('标签已存在', 'warning');
        return;
      }
      await UI.sendMessage('saveNewTags', { tags: [trimmed] });
      UI.toast('已创建标签', 'success');
      await loadData();
      render();
    } catch (e) {
      console.error('create tag error:', e);
      UI.toast('创建失败：' + e.message, 'error');
    }
  };
  if (createBtn) createBtn.addEventListener('click', createHandler);

  const searchInput = document.getElementById('tagSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', UI.debounce((e) => {
      state.searchQuery = e.target.value || '';
      try { renderTagsList(); } catch (err) { console.error(err); }
    }, 200));
  }

  const mergeBtn = document.getElementById('mergeBtn');
  if (mergeBtn) {
    mergeBtn.addEventListener('click', async () => {
      try {
        const fromStr = await UI.prompt('从哪个标签合并？', '', '输入源标签名');
        if (!fromStr) return;
        const fromTrimmed = fromStr.trim();
        const toStr = await UI.prompt('合并到哪个标签？', '', '输入目标标签名');
        if (!toStr) return;
        const toTrimmed = toStr.trim();
        if (!fromTrimmed || !toTrimmed || toTrimmed === fromTrimmed) return;
        if (!state.allTags.includes(fromTrimmed)) {
          UI.toast(`标签 #${fromTrimmed} 不存在`, 'warning');
          return;
        }
        const affected = state.clips.filter(c => c && c.tags && c.tags.includes(fromTrimmed));
        for (const clip of affected) {
          const tags = clip.tags.filter(t => t !== fromTrimmed);
          if (!tags.includes(toTrimmed)) tags.push(toTrimmed);
          await UI.sendMessage('updateClip', { id: clip.id, updates: { tags } });
        }
        if (!state.allTags.includes(toTrimmed)) await UI.sendMessage('saveNewTags', { tags: [toTrimmed] });
        await UI.sendMessage('deleteTag', { tag: fromTrimmed });
        UI.toast(`已合并 ${affected.length} 项到 #${toTrimmed}`, 'success');
        await loadData();
        render();
      } catch (e) {
        console.error('merge error:', e);
      }
    });
  }

  const addNewBtn = document.getElementById('addNewBtn');
  if (addNewBtn) addNewBtn.addEventListener('click', createHandler);
}

init();
