const state = {
  clips: [],
  allTags: [],
  searchQuery: '',
  filters: {
    type: 'all',
    fav: false,
    pin: false,
    merge: false,
    tags: []
  },
  sort: 'time'
};

async function init() {
  try { Nav.init('search'); } catch (e) { console.warn('Nav init:', e); }
  try { await loadData(); } catch (e) { console.error('loadData:', e); }
  try { bindEvents(); } catch (e) { console.error('bindEvents:', e); }
  try { renderTagFilters(); } catch (e) { console.error('renderTagFilters:', e); }
  try { await doSearch(); } catch (e) { console.error('doSearch:', e); }
}

async function loadData() {
  const [tRes, cRes] = await Promise.all([
    UI.sendMessage('getTags'),
    UI.sendMessage('searchClips', { query: '', filters: {} })
  ]);
  if (tRes.success) state.allTags = tRes.data;
  if (cRes.success) state.clips = cRes.data;

  const urlParam = Nav.getParam('q');
  if (urlParam) {
    state.searchQuery = urlParam;
    document.getElementById('searchInput').value = urlParam;
  }
}

function renderTagFilters() {
  const container = document.getElementById('tagFilters');
  if (state.allTags.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';
  container.innerHTML = `<span style="font-weight:500;color:var(--text-secondary);font-size:13px;align-self:center;margin-right:4px;">标签:</span>` +
    state.allTags.map(tag => {
      const active = state.filters.tags.includes(tag);
      return `<span class="filter-chip ${active ? 'active' : ''}" data-filter-tag="${UI.escapeAttr(tag)}">#${UI.escapeHtml(tag)}</span>`;
    }).join('');

  container.querySelectorAll('[data-filter-tag]').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.filterTag;
      const idx = state.filters.tags.indexOf(tag);
      if (idx >= 0) state.filters.tags.splice(idx, 1);
      else state.filters.tags.push(tag);
      chip.classList.toggle('active');
      doSearch();
    });
  });
}

async function doSearch() {
  const searchFilters = {};
  if (state.filters.type !== 'all') searchFilters.type = state.filters.type;
  if (state.filters.fav) searchFilters.isFavorite = true;
  if (state.filters.pin) searchFilters.isPinned = true;
  if (state.filters.tags.length > 0) searchFilters.tags = state.filters.tags;

  const r = await UI.sendMessage('searchClips', { query: state.searchQuery, filters: searchFilters });
  let results = r.success ? r.data : [];

  if (state.sort === 'copy') {
    results.sort((a, b) => (b.copyCount || 0) - (a.copyCount || 0));
  } else if (state.sort === 'create') {
    results.sort((a, b) => b.timestamp - a.timestamp);
  }

  renderResults(results);
  if (state.filters.merge) renderSimilarGroups(results);
  else document.getElementById('similarGroups').style.display = 'none';
}

function renderResults(results) {
  const container = document.getElementById('searchResults');

  if (results.length === 0) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:60px 20px;margin-top:20px;"><div class="empty-icon">🔍</div><div class="empty-title">没有找到匹配的内容</div><div class="empty-desc">试试其他关键词，或者调整筛选条件</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="card" style="margin-top:20px;">
      <div class="card-header">
        <div class="card-title">搜索结果 <span style="font-weight:400;font-size:13px;color:var(--text-muted);margin-left:6px;">共 ${results.length} 条</span></div>
      </div>
      <div class="grid-layout">
        ${results.map(clip => renderClipCard(clip)).join('')}
      </div>
    </div>
  `;

  attachClipEvents(container);
}

function renderClipCard(clip) {
  let contentHtml = '';
  if (clip.type === 'image' && clip.imageData) {
    contentHtml = `<div class="clip-content image-content"><img src="${clip.imageData}" alt="图片"></div>`;
  } else if (clip.type === 'code') {
    contentHtml = `<div class="clip-content code-content">${UI.highlightMatches(UI.truncate(clip.content, 300), state.searchQuery)}</div>`;
  } else if (clip.type === 'link') {
    contentHtml = `<div class="clip-content link-content"><a href="${UI.escapeAttr(clip.content)}" target="_blank" onclick="event.stopPropagation();">${UI.highlightMatches(UI.truncate(clip.content, 200), state.searchQuery)}</a></div>`;
  } else {
    contentHtml = `<div class="clip-content">${UI.highlightMatches(UI.truncate(clip.content, 250), state.searchQuery)}</div>`;
  }

  const tagsHtml = clip.tags && clip.tags.length > 0
    ? `<div class="clip-tags">${clip.tags.slice(0, 5).map(t => `<span class="tag tag-clickable">#${UI.highlightMatches(t, state.searchQuery)}</span>`).join('')}</div>`
    : '';

  return `
    <div class="clip-card ${clip.isPinned ? 'pinned' : ''}" data-id="${clip.id}">
      <div class="clip-header">
        <span class="clip-type-badge type-${clip.type}">${UI.getTypeIcon(clip.type)} ${UI.getTypeLabel(clip.type)}</span>
        <div class="clip-actions">
          <button class="icon-btn ${clip.isPinned ? 'active' : ''}" data-action="pin">📌</button>
          <button class="icon-btn favorite ${clip.isFavorite ? 'active' : ''}" data-action="fav">${clip.isFavorite ? '❤️' : '🤍'}</button>
          <button class="icon-btn" data-action="copy">📋</button>
          <button class="icon-btn" data-action="detail">ℹ️</button>
        </div>
      </div>
      <h3 style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:8px;word-break:break-word;">${UI.highlightMatches(clip.title || '', state.searchQuery)}</h3>
      ${contentHtml}
      ${tagsHtml}
      <div class="clip-footer">
        <div class="clip-meta">
          <span class="clip-source">🌐 ${UI.highlightMatches(UI.escapeHtml(clip.sourceHost || clip.sourceApp || '未知来源'), state.searchQuery)}</span>
          <span>🕐 ${UI.formatRelativeTime(clip.timestamp)}</span>
        </div>
        <div class="clip-stats">
          <span class="clip-stat">📋 ${clip.copyCount || 0}</span>
        </div>
      </div>
    </div>
  `;
}

function attachClipEvents(container) {
  container.querySelectorAll('.clip-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('[data-action="copy"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const clip = state.clips.find(c => c.id === id);
      if (!clip) return;
      await UI.sendMessage('incrementCopyCount', { id });
      await UI.copyToClipboard(clip.imageData ? '' : clip.content);
      UI.toast('已复制', 'success', 1500);
      doSearch();
    });
    card.querySelector('[data-action="fav"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await UI.sendMessage('toggleFavorite', { id });
      doSearch();
    });
    card.querySelector('[data-action="pin"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await UI.sendMessage('togglePin', { id });
      doSearch();
    });
    card.querySelector('[data-action="detail"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `detail.html?id=${id}`;
    });
  });
}

function calcSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.length === 0) return 1;
  if (longer.length > 500) {
    a = a.substring(0, 500);
    b = b.substring(0, 500);
  }
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  let common = 0;
  for (const w of setA) if (setB.has(w)) common++;
  const jaccard = common / (setA.size + setB.size - common || 1);
  return jaccard;
}

function renderSimilarGroups(clips) {
  const textClips = clips.filter(c => c.type !== 'image' && c.content.length > 20);
  const groups = [];
  const used = new Set();

  for (let i = 0; i < textClips.length; i++) {
    if (used.has(textClips[i].id)) continue;
    const group = [textClips[i]];
    used.add(textClips[i].id);
    for (let j = i + 1; j < textClips.length; j++) {
      if (used.has(textClips[j].id)) continue;
      if (textClips[i].type !== textClips[j].type) continue;
      const sim = calcSimilarity(textClips[i].content, textClips[j].content);
      if (sim >= 0.6) {
        group.push(textClips[j]);
        used.add(textClips[j].id);
      }
    }
    if (group.length >= 2) groups.push(group);
  }

  const section = document.getElementById('similarGroups');
  if (groups.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  document.getElementById('similarGroupList').innerHTML = groups.map((group, gIdx) => `
    <div style="border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:14px;overflow:hidden;">
      <div style="padding:12px 16px;background:var(--primary-light);display:flex;align-items:center;justify-content:space-between;">
        <div>
          <strong style="color:var(--primary);">相似分组 #${gIdx + 1}</strong>
          <span style="margin-left:8px;font-size:13px;color:var(--text-secondary);">${group.length} 条相似内容</span>
        </div>
        <button class="btn btn-sm btn-secondary" data-merge-group="${gIdx}">🔗 合并为一条</button>
      </div>
      <div style="padding:12px;">
        ${group.map((clip, idx) => `
          <div style="padding:10px 12px;border-bottom:1px solid var(--border-light);${idx === group.length - 1 ? 'border-bottom:none;' : ''}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span class="clip-type-badge type-${clip.type}" style="font-size:10px;">${UI.getTypeIcon(clip.type)}</span>
              <span style="font-size:12px;color:var(--text-muted);">${UI.formatRelativeTime(clip.timestamp)} · 来自 ${UI.escapeHtml(clip.sourceHost || clip.sourceApp || '')}</span>
              <a href="detail.html?id=${clip.id}" style="margin-left:auto;font-size:12px;">查看详情 →</a>
            </div>
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;word-break:break-word;">${UI.escapeHtml(UI.truncate(clip.content, 150))}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-merge-group]').forEach(btn => {
    btn.addEventListener('click', async () => {
      UI.toast('相似内容已在采集时自动合并，可在详情页查看历史版本', 'info', 3000);
    });
  });
}

function bindEvents() {
  document.getElementById('searchInput').addEventListener('input', UI.debounce((e) => {
    state.searchQuery = e.target.value;
    doSearch();
  }, 250));

  document.querySelectorAll('[data-type]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-type]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filters.type = chip.dataset.type;
      doSearch();
    });
  });

  document.querySelector('[data-fav="1"]').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
    state.filters.fav = e.currentTarget.classList.contains('active');
    doSearch();
  });

  document.querySelector('[data-pin="1"]').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
    state.filters.pin = e.currentTarget.classList.contains('active');
    doSearch();
  });

  document.querySelector('[data-merge="1"]').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
    state.filters.merge = e.currentTarget.classList.contains('active');
    doSearch();
  });

  document.querySelectorAll('[data-sort]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-sort]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.sort = chip.dataset.sort;
      doSearch();
    });
  });

  document.getElementById('resetFilters').addEventListener('click', () => {
    state.searchQuery = '';
    state.filters = { type: 'all', fav: false, pin: false, merge: false, tags: [] };
    state.sort = 'time';
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-type="all"]').classList.add('active');
    document.querySelector('[data-sort="time"]').classList.add('active');
    renderTagFilters();
    doSearch();
  });

  document.getElementById('similarBtn').addEventListener('click', () => {
    const chip = document.querySelector('[data-merge="1"]');
    chip.classList.add('active');
    state.filters.merge = true;
    doSearch();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('searchInput').focus();
      document.getElementById('searchInput').select();
    }
  });
}

init();
