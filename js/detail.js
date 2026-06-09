const state = {
  clip: null,
  versions: [],
  clipId: null,
  allTags: [],
  settings: null,
  isEditing: false,
  newTags: new Set(),
  quoteMode: 'full',
  diffMode: null,
  diffVersionIdx: -1
};

async function init() {
  Nav.init('search');
  state.clipId = Nav.getParam('id');
  if (!state.clipId) {
    document.body.innerHTML = '<div style="padding:100px;text-align:center;">未指定片段ID</div>';
    return;
  }
  await loadData();
  if (!state.clip) {
    document.body.innerHTML = '<div style="padding:100px;text-align:center;">未找到该片段，可能已被删除</div>';
    return;
  }
  bindEvents();
  render();
}

async function loadData() {
  const [clipRes, verRes, tagRes, setRes] = await Promise.all([
    UI.sendMessage('getClip', { id: state.clipId }),
    UI.sendMessage('getVersions', { id: state.clipId }),
    UI.sendMessage('getTags'),
    UI.sendMessage('getSettings')
  ]);
  if (clipRes.success) state.clip = clipRes.data;
  if (verRes.success) state.versions = verRes.data.reverse();
  if (tagRes.success) state.allTags = tagRes.data;
  if (setRes.success) state.settings = setRes.data;
}

function render() {
  document.getElementById('pageTitle').textContent = UI.getTypeIcon(state.clip.type) + ' ' + (state.clip.title || '片段详情');
  document.getElementById('pageSubtitle').textContent = `创建于 ${UI.formatTimestamp(state.clip.timestamp)}`;

  const badge = document.getElementById('detailTypeBadge');
  badge.className = `clip-type-badge type-${state.clip.type}`;
  badge.textContent = `${UI.getTypeIcon(state.clip.type)} ${UI.getTypeLabel(state.clip.type)}`;

  document.getElementById('detailTitle').textContent = state.clip.title || '';

  const favBtn = document.getElementById('favBtn');
  favBtn.textContent = state.clip.isFavorite ? '⭐ 已收藏' : '⭐ 收藏';
  favBtn.classList.toggle('btn-primary', state.clip.isFavorite);
  favBtn.classList.toggle('btn-secondary', !state.clip.isFavorite);

  const pinBtn = document.getElementById('pinBtn');
  pinBtn.textContent = state.clip.isPinned ? '📌 已置顶' : '📌 置顶';
  pinBtn.classList.toggle('btn-primary', state.clip.isPinned);
  pinBtn.classList.toggle('btn-secondary', !state.clip.isPinned);

  const contentEl = document.getElementById('detailContent');
  contentEl.className = 'detail-content';
  if (state.clip.type === 'image' && state.clip.imageData) {
    contentEl.innerHTML = `<img src="${state.clip.imageData}" alt="图片" style="max-width:100%;border-radius:var(--radius-md);">`;
  } else if (state.clip.type === 'code') {
    contentEl.classList.add('code-content');
    contentEl.textContent = state.clip.content;
  } else if (state.clip.type === 'link') {
    contentEl.innerHTML = `<a href="${UI.escapeAttr(state.clip.content)}" target="_blank" style="color:var(--primary);word-break:break-all;">${UI.escapeHtml(state.clip.content)}</a>`;
  } else {
    let text = state.clip.content;
    if (state.settings?.enableSensitiveMask) {
      text = UI.maskSensitive(text, state.settings.sensitiveWords);
    } else {
      text = UI.escapeHtml(text);
    }
    contentEl.innerHTML = text.replace(/\n/g, '<br>');
  }

  document.getElementById('createdTime').textContent = UI.formatTimestamp(state.clip.timestamp);
  document.getElementById('modifiedTime').textContent = UI.formatTimestamp(state.clip.lastModified || state.clip.timestamp);
  document.getElementById('accessedTime').textContent = UI.formatTimestamp(state.clip.lastAccessed || state.clip.timestamp);
  document.getElementById('copyCount').textContent = `${state.clip.copyCount || 0} 次`;
  document.getElementById('sourceInfo').textContent = state.clip.sourceApp || (state.clip.sourceHost || '未知来源');
  const urlEl = document.getElementById('sourceUrl');
  if (state.clip.sourceUrl) {
    urlEl.innerHTML = `<a href="${UI.escapeAttr(state.clip.sourceUrl)}" target="_blank" style="color:var(--primary);">${UI.escapeHtml(UI.truncate(state.clip.sourceUrl, 50))}</a>`;
  } else {
    urlEl.textContent = '无';
  }

  renderTagEditor();
  renderVersions();
  renderQuote();
}

function renderTagEditor() {
  const container = document.getElementById('tagEditor');
  const clipTags = state.clip.tags || [];

  container.innerHTML = clipTags.map(t =>
    `<span class="tag">${UI.escapeHtml(t)}<span class="tag-remove" data-remove="${UI.escapeAttr(t)}">×</span></span>`
  ).join('') + `<input type="text" class="tag-input" id="tagInput" placeholder="输入标签后按回车添加...">`;

  const tagInput = document.getElementById('tagInput');

  const datalist = document.createElement('datalist');
  datalist.id = 'tagSuggestions';
  state.allTags.filter(t => !clipTags.includes(t)).forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    datalist.appendChild(opt);
  });
  tagInput.setAttribute('list', 'tagSuggestions');
  container.appendChild(datalist);

  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tag = btn.dataset.remove;
      await UI.sendMessage('removeTag', { id: state.clipId, tag });
      await loadData();
      render();
    });
  });

  tagInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.value.trim().replace(/,$/, '');
      if (!val) return;
      const tags = val.split(/[,，\s]+/).filter(Boolean);
      if (tags.length > 0) {
        await UI.sendMessage('addTags', { id: state.clipId, tags });
        UI.toast('已添加标签', 'success', 1200);
        await loadData();
        render();
      }
    }
  });
}

function renderVersions() {
  const container = document.getElementById('versionsList');
  if (state.versions.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📜</div><div class="empty-title">暂无历史版本</div><div class="empty-desc">每次修改内容时都会自动保存历史版本</div></div>`;
    return;
  }

  let diffHtml = '';
  if (state.diffMode && state.diffVersionIdx >= -1 && state.versions.length > 0) {
    let oldContent = '', oldLabel = '', newContent = '', newLabel = '';
    if (state.diffMode === 'prev') {
      if (state.diffVersionIdx >= state.versions.length - 1) {
        oldContent = state.versions[state.versions.length - 1]?.content || '';
        oldLabel = UI.formatTimestamp(state.versions[state.versions.length - 1]?.timestamp || Date.now());
      } else {
        const idx = state.diffVersionIdx + 1;
        oldContent = state.versions[idx]?.content || '';
        oldLabel = UI.formatTimestamp(state.versions[idx]?.timestamp || Date.now());
      }
      if (state.diffVersionIdx === -1) {
        newContent = state.clip.content || '';
        newLabel = `当前版本（${UI.formatTimestamp(state.clip.lastModified || state.clip.timestamp)}）`;
      } else {
        newContent = state.versions[state.diffVersionIdx]?.content || '';
        newLabel = UI.formatTimestamp(state.versions[state.diffVersionIdx]?.timestamp || Date.now());
      }
    } else if (state.diffMode === 'current') {
      const target = state.versions[state.diffVersionIdx];
      oldContent = target?.content || '';
      oldLabel = `历史版本（${UI.formatTimestamp(target?.timestamp || Date.now())}）`;
      newContent = state.clip.content || '';
      newLabel = `当前版本（${UI.formatTimestamp(state.clip.lastModified || state.clip.timestamp)}）`;
    }
    if (oldContent !== newContent || oldLabel) {
      diffHtml = `
        <div class="card" style="margin:14px 0;border:1px solid var(--primary);">
          <div class="card-header">
            <div class="card-title" style="font-size:13px;">📊 版本差异 <span style="font-weight:400;">${oldLabel} → ${newLabel}</span></div>
            <button class="btn btn-ghost btn-sm" id="closeDiffBtn">关闭对比</button>
          </div>
          <div style="padding:10px 12px;max-height:360px;overflow:auto;">
            ${oldContent === newContent ? '<div style="text-align:center;padding:20px;color:var(--text-muted);">两个版本内容完全相同</div>' : UI.diffText(oldContent, newContent)}
          </div>
        </div>
      `;
    }
  }

  container.innerHTML = `
    <div style="padding:10px 12px;border:1px solid var(--primary);border-radius:var(--radius-sm);background:var(--primary-light);margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div><strong>当前版本</strong> · ${UI.formatTimestamp(state.clip.lastModified || state.clip.timestamp)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <span style="font-size:12px;color:var(--primary);">共 ${state.versions.length + 1} 个版本</span>
          <button class="btn btn-sm btn-secondary" id="clearDiffBtn" style="${state.diffMode ? '' : 'display:none;'}">❌ 退出对比</button>
        </div>
      </div>
      <div style="margin-top:6px;font-size:13px;color:var(--text-secondary);word-break:break-word;">${UI.escapeHtml(UI.truncate(state.clip.content || '', 150))}</div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-muted);">💡 点击历史版本的「对比当前」或「对比前版」查看改动差异</div>
    </div>
    ${diffHtml}
  ` + state.versions.map((v, idx) => `
    <div class="version-item">
      <div class="version-time">${UI.formatTimestamp(v.timestamp)}</div>
      <div class="version-preview" style="flex:1;">${UI.escapeHtml(UI.truncate(v.content || '', 120))}</div>
      <div style="flex-shrink:0;display:flex;gap:6px;align-items:center;">
        <button class="btn btn-sm btn-secondary" data-diff-current="${idx}" title="与当前版本对比">🔍 对比当前</button>
        <button class="btn btn-sm btn-secondary" data-diff-prev="${idx}" title="与前一版本对比">↔ 对比前版</button>
        <button class="btn btn-sm btn-primary" data-restore="${idx}">还原</button>
      </div>
    </div>
  `).join('');

  const closeDiff = container.querySelector('#closeDiffBtn');
  if (closeDiff) closeDiff.addEventListener('click', () => {
    state.diffMode = null;
    state.diffVersionIdx = -1;
    renderVersions();
  });
  const clearDiff = container.querySelector('#clearDiffBtn');
  if (clearDiff) clearDiff.addEventListener('click', () => {
    state.diffMode = null;
    state.diffVersionIdx = -1;
    renderVersions();
  });

  container.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await UI.confirm('确定要还原到此版本吗？当前版本将保存到历史记录')) return;
      const idx = parseInt(btn.dataset.restore);
      const r = await UI.sendMessage('restoreVersion', { id: state.clipId, index: idx });
      if (r.success) {
        UI.toast('已还原', 'success');
        state.diffMode = null;
        state.diffVersionIdx = -1;
        await loadData();
        render();
      }
    });
  });

  container.querySelectorAll('[data-diff-current]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.diffMode = 'current';
      state.diffVersionIdx = parseInt(btn.dataset.diffCurrent);
      renderVersions();
    });
  });

  container.querySelectorAll('[data-diff-prev]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.diffMode = 'prev';
      state.diffVersionIdx = parseInt(btn.dataset.diffPrev);
      renderVersions();
    });
  });
}

function renderQuote() {
  const quote = UI.generateQuoteCard(state.clip, state.quoteMode);
  document.getElementById('quoteOutput').textContent = quote;
  document.querySelectorAll('[data-quote-mode]').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.quoteMode === state.quoteMode);
  });
}

function bindEvents() {
  document.getElementById('copyBtn').addEventListener('click', async () => {
    await UI.sendMessage('incrementCopyCount', { id: state.clipId });
    const ok = await UI.copyToClipboard(state.clip.imageData ? '' : state.clip.content);
    if (ok) {
      UI.toast('已复制到剪贴板', 'success', 1500);
      await loadData();
      render();
    }
  });

  document.getElementById('favBtn').addEventListener('click', async () => {
    await UI.sendMessage('toggleFavorite', { id: state.clipId });
    UI.toast(state.clip.isFavorite ? '已取消收藏' : '已收藏', 'success', 1200);
    await loadData();
    render();
  });

  document.getElementById('pinBtn').addEventListener('click', async () => {
    await UI.sendMessage('togglePin', { id: state.clipId });
    UI.toast(state.clip.isPinned ? '已取消置顶' : '已置顶', 'success', 1200);
    await loadData();
    render();
  });

  document.getElementById('editBtn').addEventListener('click', async () => {
    if (state.isEditing) return;
    state.isEditing = true;
    const oldTitle = state.clip.title || '';
    const oldContent = state.clip.content || '';

    const { modal, close } = UI.createModal(`
      <div class="modal-header">
        <div class="modal-title">✏️ 编辑片段</div>
        <button class="modal-close" data-close>&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">标题</label>
          <input type="text" class="form-input" id="editTitle" value="${UI.escapeAttr(oldTitle)}">
        </div>
        <div class="form-group">
          <label class="form-label">内容</label>
          <textarea class="form-textarea" id="editContent" style="min-height:300px;">${UI.escapeHtml(oldContent)}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close>取消</button>
        <button class="btn btn-primary" id="saveEdit">💾 保存</button>
      </div>
    `);

    const finishEdit = async () => {
      state.isEditing = false;
    };

    const origClose = close;
    const wrappedClose = () => {
      try { finishEdit(); } catch (e) { console.warn(e); }
      try { origClose(); } catch (e) { console.warn(e); }
    };

    modal.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrappedClose();
      });
    });

    if (modal.parentElement) {
      modal.parentElement.addEventListener('click', (e) => {
        if (e.target === modal.parentElement) {
          wrappedClose();
        }
      });
    }

    document.getElementById('saveEdit').addEventListener('click', async () => {
      const newTitle = document.getElementById('editTitle').value.trim();
      const newContent = document.getElementById('editContent').value;
      await UI.sendMessage('updateClip', { id: state.clipId, updates: { title: newTitle, content: newContent } });
      UI.toast('已保存', 'success');
      wrappedClose();
      await loadData();
      render();
    });
  });

  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      document.getElementById('versionsPanel').style.display = which === 'versions' ? 'block' : 'none';
      document.getElementById('quotePanel').style.display = which === 'quote' ? 'block' : 'none';
    });
  });

  document.querySelectorAll('[data-quote-mode]').forEach(chip => {
    chip.addEventListener('click', () => {
      state.quoteMode = chip.dataset.quoteMode;
      renderQuote();
    });
  });

  document.getElementById('copyQuoteBtn').addEventListener('click', async () => {
    const quote = UI.generateQuoteCard(state.clip, state.quoteMode);
    await UI.copyToClipboard(quote);
    UI.toast('引用卡片已复制', 'success', 1500);
  });

  document.getElementById('downloadQuoteBtn').addEventListener('click', () => {
    const quote = UI.generateQuoteCard(state.clip, state.quoteMode);
    const safeTitle = (state.clip.title || '引用卡片').replace(/[\\/:*?"<>|]/g, '_');
    UI.downloadFile(`${safeTitle}_引用.md`, quote, 'text/markdown');
  });
}

init();
