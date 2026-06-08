const state = {
  clips: [],
  settings: null
};

async function init() {
  Nav.init('cleanup');
  await loadData();
  bindEvents();
  render();
}

async function loadData() {
  const [cRes, sRes] = await Promise.all([
    UI.sendMessage('searchClips', { query: '', filters: {} }),
    UI.sendMessage('getSettings')
  ]);
  if (cRes.success) state.clips = cRes.data;
  if (sRes.success) state.settings = sRes.data;
}

function estimateSize(clips) {
  let bytes = 0;
  for (const c of clips) {
    bytes += (c.content || '').length * 2;
    if (c.imageData) bytes += c.imageData.length;
    if (c.tags) bytes += c.tags.join('').length * 2;
  }
  return bytes;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function render() {
  const total = state.clips.length;
  const fav = state.clips.filter(c => c.isFavorite).length;
  const pinned = state.clips.filter(c => c.isPinned).length;
  const textCount = state.clips.filter(c => c.type === 'text').length;
  const codeCount = state.clips.filter(c => c.type === 'code').length;
  const linkCount = state.clips.filter(c => c.type === 'link').length;
  const imageCount = state.clips.filter(c => c.type === 'image').length;
  const totalSize = estimateSize(state.clips);
  const avgCopy = total > 0 ? (state.clips.reduce((s, c) => s + (c.copyCount || 0), 0) / total).toFixed(1) : 0;

  document.getElementById('storageStats').innerHTML = `
    <div class="stat-card"><div class="stat-icon">📦</div><div class="stat-value">${formatSize(totalSize)}</div><div class="stat-label">数据总量 (估算)</div></div>
    <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-value">${total}</div><div class="stat-label">总条目</div></div>
    <div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-value">${fav}</div><div class="stat-label">已收藏</div></div>
    <div class="stat-card"><div class="stat-icon">📌</div><div class="stat-value">${pinned}</div><div class="stat-label">已置顶</div></div>
    <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-value">${avgCopy}</div><div class="stat-label">平均复制次数</div></div>
    <div class="stat-card"><div class="stat-icon">🖼️</div><div class="stat-value">${imageCount}</div><div class="stat-label">图片 (${formatSize(estimateSize(state.clips.filter(c => c.type === 'image')))})</div></div>
  `;

  const typeData = [
    { label: '文本', count: textCount, color: '#3b82f6', icon: '📝' },
    { label: '代码', count: codeCount, color: '#f59e0b', icon: '💻' },
    { label: '链接', count: linkCount, color: '#22c55e', icon: '🔗' },
    { label: '图片', count: imageCount, color: '#ec4899', icon: '🖼️' }
  ];
  const maxCount = Math.max(...typeData.map(d => d.count), 1);

  document.getElementById('analysisArea').innerHTML = `
    <h4 style="font-size:14px;margin-bottom:14px;color:var(--text-secondary);">内容类型分布</h4>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
      ${typeData.map(d => `
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;">
            <span>${d.icon} ${d.label}</span>
            <strong>${d.count} (${total ? ((d.count / total) * 100).toFixed(1) : 0}%)</strong>
          </div>
          <div style="height:10px;background:var(--bg-tertiary);border-radius:5px;overflow:hidden;">
            <div style="height:100%;width:${(d.count / maxCount) * 100}%;background:${d.color};border-radius:5px;transition:width 0.5s;"></div>
          </div>
        </div>
      `).join('')}
    </div>

    <h4 style="font-size:14px;margin-bottom:14px;color:var(--text-secondary);">使用建议</h4>
    <div style="padding:14px;background:var(--primary-light);border-radius:var(--radius-md);font-size:13px;line-height:1.8;color:var(--text-primary);">
      ${generateTips(total, fav, pinned, imageCount, totalSize)}
    </div>
  `;
}

function generateTips(total, fav, pinned, imageCount, size) {
  const tips = [];
  if (total === 0) tips.push('💡 开始复制内容吧！剪切板博物馆会自动记录你的每一次复制。');
  if (total > 0 && fav === 0) tips.push('⭐ 建议收藏重要片段，它们不会被自动清理。');
  if (total > 0 && pinned === 0) tips.push('📌 置顶常用的3-5个片段，可通过快捷键快速粘贴。');
  if (imageCount > 10 && size > 5 * 1024 * 1024) tips.push('🖼️ 图片内容占用空间较大，建议定期清理不需要的图片。');
  if (size > 50 * 1024 * 1024) tips.push('📦 数据量已超过50MB，建议导出备份后清理旧数据。');
  if (total > 1000) tips.push('📊 数据量超过1000条，可使用标签和搜索更好地组织内容。');
  if (tips.length === 0) tips.push('✅ 你的使用习惯很好，继续保持！');
  return tips.map(t => `• ${t}`).join('<br>');
}

async function doCleanup(kind) {
  let toDelete = [];
  let msg = '';
  const now = Date.now();

  switch (kind) {
    case '7d':
      toDelete = state.clips.filter(c => !c.isFavorite && !c.isPinned && (now - c.timestamp) > 7 * 24 * 3600 * 1000).map(c => c.id);
      msg = `确定删除 ${toDelete.length} 条7天前的未收藏内容吗？`;
      break;
    case '30d':
      toDelete = state.clips.filter(c => !c.isFavorite && !c.isPinned && (now - c.timestamp) > 30 * 24 * 3600 * 1000).map(c => c.id);
      msg = `确定删除 ${toDelete.length} 条30天前的未收藏内容吗？`;
      break;
    case 'copy1':
      toDelete = state.clips.filter(c => !c.isFavorite && !c.isPinned && (c.copyCount || 0) <= 1).map(c => c.id);
      msg = `确定删除 ${toDelete.length} 条从未使用过的内容吗？`;
      break;
    case 'images':
      toDelete = state.clips.filter(c => c.type === 'image' && !c.isFavorite && !c.isPinned).map(c => c.id);
      msg = `确定删除 ${toDelete.length} 条图片内容吗？`;
      break;
    case 'unfav':
      toDelete = state.clips.filter(c => !c.isFavorite && !c.isPinned).map(c => c.id);
      msg = `确定清空 ${toDelete.length} 条未收藏内容吗？`;
      break;
    case 'all':
      msg = `⚠️ 确定删除所有 ${state.clips.length} 条记录吗？包括收藏和置顶内容！此操作不可撤销！`;
      break;
  }

  if (toDelete.length === 0 && kind !== 'all') {
    UI.toast('没有需要清理的内容', 'info', 1500);
    return;
  }
  if (!await UI.confirm(msg)) return;

  if (kind === 'all') {
    await UI.sendMessage('clearAll', { favoritesOnly: false });
  } else {
    await UI.sendMessage('bulkDelete', { clipIds: toDelete });
  }
  UI.toast(`已清理 ${kind === 'all' ? state.clips.length : toDelete.length} 条`, 'success');
  await loadData();
  render();
}

function getExportData(scope, format) {
  let data = [...state.clips];

  switch (scope) {
    case 'favorites': data = data.filter(c => c.isFavorite); break;
    case 'pinned': data = data.filter(c => c.isPinned); break;
    case 'tagged': data = data.filter(c => c.tags && c.tags.length > 0); break;
    case 'recent':
      const week = 7 * 24 * 3600 * 1000;
      data = data.filter(c => Date.now() - c.timestamp < week);
      break;
  }

  let content = '';
  let mimeType = 'text/plain';
  let ext = 'txt';
  const now = new Date();
  const ts = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
  let filename = `剪切板博物馆_${scope}_${ts}`;

  switch (format) {
    case 'json':
      content = JSON.stringify(data.map(c => ({
        id: c.id, title: c.title, content: c.content,
        type: c.type, tags: c.tags, isFavorite: c.isFavorite, isPinned: c.isPinned,
        copyCount: c.copyCount, sourceUrl: c.sourceUrl, sourceApp: c.sourceApp, sourceHost: c.sourceHost,
        timestamp: c.timestamp, timestampStr: UI.formatTimestamp(c.timestamp), imageData: c.imageData
      })), null, 2);
      mimeType = 'application/json';
      ext = 'json';
      break;
    case 'markdown':
      content = `# 剪切板博物馆 - 导出报告\n\n导出时间: ${UI.formatTimestamp(Date.now())}\n导出条目: ${data.length}\n\n---\n\n` +
        data.map((c, i) => {
          let body = `## ${i + 1}. ${c.title || '无标题'}\n\n`;
          body += `- **类型**: ${UI.getTypeLabel(c.type)}\n`;
          body += `- **标签**: ${(c.tags || []).map(t => '#' + t).join(' ') || '无'}\n`;
          body += `- **来源**: ${c.sourceHost || c.sourceApp || '未知'}${c.sourceUrl ? ` (${c.sourceUrl})` : ''}\n`;
          body += `- **收藏**: ${c.isFavorite ? '是' : '否'} | **置顶**: ${c.isPinned ? '是' : '否'}\n`;
          body += `- **复制次数**: ${c.copyCount || 0}\n`;
          body += `- **保存时间**: ${UI.formatTimestamp(c.timestamp)}\n\n`;
          if (c.type === 'image' && c.imageData) body += `![图片](${c.imageData})\n\n`;
          else if (c.type === 'code') body += `\`\`\`\n${c.content}\n\`\`\`\n\n`;
          else if (c.type === 'link') body += `<${c.content}>\n\n`;
          else body += `${c.content}\n\n`;
          body += `---\n\n`;
          return body;
        }).join('\n');
      mimeType = 'text/markdown';
      ext = 'md';
      break;
    case 'txt':
      content = data.map((c, i) =>
        `${i + 1}. [${UI.getTypeLabel(c.type)}] ${c.title || '无标题'}\n保存时间: ${UI.formatTimestamp(c.timestamp)}\n标签: ${(c.tags || []).join(', ') || '无'}\n来源: ${c.sourceHost || c.sourceApp || '未知'}\n\n${c.content}\n\n${'='.repeat(60)}\n\n`
      ).join('\n');
      ext = 'txt';
      break;
    case 'csv':
      content = '序号,类型,标题,内容,标签,来源,来源网址,收藏,置顶,复制次数,保存时间\n';
      data.forEach((c, i) => {
        const row = [
          i + 1,
          UI.getTypeLabel(c.type),
          `"${(c.title || '').replace(/"/g, '""')}"`,
          `"${(c.content || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
          `"${(c.tags || []).join('; ')}"`,
          `"${(c.sourceHost || c.sourceApp || '').replace(/"/g, '""')}"`,
          `"${(c.sourceUrl || '').replace(/"/g, '""')}"`,
          c.isFavorite ? '是' : '否',
          c.isPinned ? '是' : '否',
          c.copyCount || 0,
          UI.formatTimestamp(c.timestamp)
        ];
        content += row.join(',') + '\n';
      });
      mimeType = 'text/csv';
      ext = 'csv';
      break;
    case 'html':
      content = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>剪切板博物馆导出</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:900px;margin:40px auto;padding:20px;color:#1f2937;}
h1{border-bottom:3px solid #6366f1;padding-bottom:10px;}
.card{border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;}
.meta{font-size:12px;color:#6b7280;margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap;}
.tag{background:#eef2ff;color:#6366f1;padding:2px 8px;border-radius:12px;font-size:11px;}
.content{line-height:1.7;white-space:pre-wrap;word-break:break-word;}
pre{background:#1e293b;color:#e2e8f0;padding:12px;border-radius:6px;overflow-x:auto;}
img{max-width:100%;border-radius:6px;}
.type-badge{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;}
</style></head>
<body>
<h1>📋 剪切板博物馆 - 导出报告</h1>
<p><strong>导出时间：</strong>${UI.formatTimestamp(Date.now())} &nbsp;|&nbsp; <strong>总条目：</strong>${data.length}</p>
<hr style="margin:20px 0;">
${data.map((c, i) => {
        let body = `<div class="card"><div class="meta">`;
        body += `<span class="type-badge" style="background:${c.type === 'code' ? '#fef3c7;color:#92400e' : c.type === 'link' ? '#dcfce7;color:#166534' : c.type === 'image' ? '#fce7f3;color:#9f1239' : '#dbeafe;color:#1e40af'}">${UI.getTypeIcon(c.type)} ${UI.getTypeLabel(c.type)}</span>`;
        body += `<span>#${i + 1}</span><span>📋 ${c.copyCount || 0}次</span><span>🕐 ${UI.formatTimestamp(c.timestamp)}</span>`;
        if (c.isFavorite) body += `<span>⭐ 已收藏</span>`;
        if (c.isPinned) body += `<span>📌 已置顶</span>`;
        if (c.tags && c.tags.length) body += c.tags.map(t => `<span class="tag">#${t}</span>`).join('');
        body += `</div><h3 style="margin:8px 0;">${UI.escapeHtml(c.title || '无标题')}</h3>`;
        if (c.type === 'image' && c.imageData) body += `<img src="${c.imageData}" alt="图片">`;
        else if (c.type === 'code') body += `<pre>${UI.escapeHtml(c.content)}</pre>`;
        else if (c.type === 'link') body += `<a href="${UI.escapeAttr(c.content)}" target="_blank" style="color:#6366f1;">${UI.escapeHtml(c.content)}</a>`;
        else body += `<div class="content">${UI.escapeHtml(c.content)}</div>`;
        body += `<div style="margin-top:8px;font-size:12px;color:#6b7280;">🌐 ${UI.escapeHtml(c.sourceHost || c.sourceApp || '未知')}${c.sourceUrl ? ` · <a href="${UI.escapeAttr(c.sourceUrl)}" target="_blank">查看来源</a>` : ''}</div>`;
        body += `</div>`;
        return body;
      }).join('\n')}
</body></html>`;
      mimeType = 'text/html';
      ext = 'html';
      break;
  }

  return { content: content || '', mimeType, filename: `${filename}.${ext}` };
}

async function showExportPicker() {
  const clips = [...state.clips].sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
  if (clips.length === 0) {
    UI.toast('暂无内容可导出', 'warning');
    return;
  }

  const selected = new Set();
  const { modal, close } = UI.createModal(`
    <div class="modal-header">
      <div class="modal-title">🎯 选择要导出的内容</div>
      <button class="modal-close" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <div style="display:flex;gap:10px;margin-bottom:12px;">
        <button class="btn btn-sm btn-secondary" id="selAll">全选</button>
        <button class="btn btn-sm btn-secondary" id="selFav">选择已收藏</button>
        <button class="btn btn-sm btn-secondary" id="selNone">取消全选</button>
        <span style="font-size:13px;color:var(--text-muted);align-self:center;">已选 <strong id="selCount" style="color:var(--primary);">0</strong> 项</span>
      </div>
      <div style="max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px;">
        ${clips.map(c => `
          <label style="display:flex;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;align-items:flex-start;" class="pick-item">
            <input type="checkbox" class="checkbox" data-pick="${c.id}">
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:500;">${c.isFavorite ? '⭐ ' : ''}${c.isPinned ? '📌 ' : ''}${UI.escapeHtml(UI.truncate(c.title || c.content, 60))}</div>
              <div style="font-size:11px;color:var(--text-muted);">${UI.getTypeIcon(c.type)} ${UI.getTypeLabel(c.type)} · ${UI.formatRelativeTime(c.timestamp)} · ${c.sourceHost || c.sourceApp || ''}</div>
            </div>
          </label>
        `).join('')}
      </div>
      <div style="margin-top:14px;">
        <label class="form-label">导出格式</label>
        <select class="form-select" id="pickFormat" style="width:180px;">
          <option value="json">JSON</option>
          <option value="markdown">Markdown</option>
          <option value="txt">纯文本</option>
          <option value="html">HTML网页</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-close>取消</button>
      <button class="btn btn-primary" id="doExportPick">📤 导出选中</button>
    </div>
  `, 'modal-lg');

  const updateCount = () => {
    document.getElementById('selCount').textContent = selected.size;
  };

  modal.querySelectorAll('[data-pick]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(cb.dataset.pick);
      else selected.delete(cb.dataset.pick);
      updateCount();
    });
  });

  document.getElementById('selAll').addEventListener('click', () => {
    clips.forEach(c => selected.add(c.id));
    modal.querySelectorAll('[data-pick]').forEach(cb => cb.checked = true);
    updateCount();
  });
  document.getElementById('selFav').addEventListener('click', () => {
    selected.clear();
    clips.filter(c => c.isFavorite).forEach(c => selected.add(c.id));
    modal.querySelectorAll('[data-pick]').forEach(cb => {
      cb.checked = selected.has(cb.dataset.pick);
    });
    updateCount();
  });
  document.getElementById('selNone').addEventListener('click', () => {
    selected.clear();
    modal.querySelectorAll('[data-pick]').forEach(cb => cb.checked = false);
    updateCount();
  });

  document.getElementById('doExportPick').addEventListener('click', () => {
    if (selected.size === 0) {
      UI.toast('请至少选择一项', 'warning');
      return;
    }
    const picked = clips.filter(c => selected.has(c.id));
    const format = document.getElementById('pickFormat').value;
    const originalClips = state.clips;
    state.clips = picked;
    const data = getExportData('all', format);
    state.clips = originalClips;
    UI.downloadFile(data.filename, data.content, data.mimeType);
    UI.toast(`已导出 ${picked.length} 项`, 'success');
    close();
  });
}

function bindEvents() {
  document.querySelectorAll('[data-clean]').forEach(btn => {
    btn.addEventListener('click', () => doCleanup(btn.dataset.clean));
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    const scope = document.getElementById('exportScope').value;
    const format = document.getElementById('exportFormat').value;
    const data = getExportData(scope, format);
    UI.downloadFile(data.filename, data.content, data.mimeType);
    UI.toast('导出成功', 'success', 2000);
  });

  document.getElementById('exportSelectedBtn').addEventListener('click', showExportPicker);
}

init();
