const state = {
  settings: null,
  sensitiveWords: [],
  blacklist: []
};

async function init() {
  Nav.init('settings');
  await loadData();
  bindEvents();
  render();
}

async function loadData() {
  const r = await UI.sendMessage('getSettings');
  if (r.success) {
    state.settings = r.data;
    state.sensitiveWords = [...r.data.sensitiveWords];
    state.blacklist = [...r.data.blacklistSites];
  }
}

function render() {
  setToggle('toggleEnabled', !state.settings.isPaused);
  setToggle('toggleDetectCode', state.settings.autoDetectCode);
  setToggle('toggleMerge', state.settings.mergeSimilarContent);
  setToggle('toggleMask', state.settings.enableSensitiveMask);

  document.getElementById('maxClips').value = state.settings.maxClips;
  document.getElementById('keepDays').value = state.settings.keepDays;
  document.getElementById('thresholdSlider').value = state.settings.similarityThreshold;
  document.getElementById('thresholdValue').textContent = state.settings.similarityThreshold.toFixed(2);
  document.getElementById('thresholdRow').style.opacity = state.settings.mergeSimilarContent ? '1' : '0.5';
  document.getElementById('thresholdRow').style.pointerEvents = state.settings.mergeSimilarContent ? 'auto' : 'none';

  renderSensitiveWords();
  renderBlacklist();
}

function setToggle(id, on) {
  const el = document.getElementById(id);
  el.classList.toggle('on', on);
}

function getToggle(id) {
  return document.getElementById(id).classList.contains('on');
}

function renderSensitiveWords() {
  const container = document.getElementById('sensitiveWordsArea');
  const existing = container.querySelector('.tag-input');
  container.innerHTML = state.sensitiveWords.map(w =>
    `<span class="tag">${UI.escapeHtml(w)}<span class="tag-remove" data-sw="${UI.escapeAttr(w)}">×</span></span>`
  ).join('') + `<input type="text" class="tag-input" id="sensitiveInput" placeholder="输入敏感词后按回车添加">`;

  container.querySelectorAll('[data-sw]').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = btn.dataset.sw;
      state.sensitiveWords = state.sensitiveWords.filter(x => x !== w);
      renderSensitiveWords();
    });
  });

  const input = document.getElementById('sensitiveInput');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.value.trim().replace(/[,，]/g, '');
      if (val) {
        const words = val.split(/\s+/).filter(Boolean);
        words.forEach(w => { if (!state.sensitiveWords.includes(w)) state.sensitiveWords.push(w); });
        renderSensitiveWords();
      }
    }
  });
}

function renderBlacklist() {
  const container = document.getElementById('blacklistTags');
  if (state.blacklist.length === 0) {
    container.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:10px 0;">暂无黑名单网站</div>`;
    return;
  }
  container.innerHTML = state.blacklist.map(site =>
    `<span class="blacklist-tag">🚫 ${UI.escapeHtml(site)}<span class="tag-remove" data-bl="${UI.escapeAttr(site)}">×</span></span>`
  ).join('');

  container.querySelectorAll('[data-bl]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.blacklist = state.blacklist.filter(x => x !== btn.dataset.bl);
      renderBlacklist();
    });
  });
}

function bindEvents() {
  ['toggleEnabled', 'toggleDetectCode', 'toggleMerge', 'toggleMask'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('on');
      if (id === 'toggleMerge') {
        const on = e.currentTarget.classList.contains('on');
        document.getElementById('thresholdRow').style.opacity = on ? '1' : '0.5';
        document.getElementById('thresholdRow').style.pointerEvents = on ? 'auto' : 'none';
      }
    });
  });

  document.getElementById('thresholdSlider').addEventListener('input', (e) => {
    document.getElementById('thresholdValue').textContent = parseFloat(e.target.value).toFixed(2);
  });

  document.getElementById('addBlacklistBtn').addEventListener('click', () => {
    const input = document.getElementById('blacklistInput');
    const val = input.value.trim();
    if (!val) return;
    const sites = val.split(/[,，\s]+/).map(s => s.replace(/^https?:\/\//, '').split('/')[0]).filter(Boolean);
    sites.forEach(s => { if (!state.blacklist.includes(s)) state.blacklist.push(s); });
    input.value = '';
    renderBlacklist();
  });

  document.getElementById('blacklistInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('addBlacklistBtn').click();
    }
  });

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const newSettings = {
      isPaused: !getToggle('toggleEnabled'),
      autoDetectCode: getToggle('toggleDetectCode'),
      mergeSimilarContent: getToggle('toggleMerge'),
      similarityThreshold: parseFloat(document.getElementById('thresholdSlider').value),
      enableSensitiveMask: getToggle('toggleMask'),
      sensitiveWords: [...state.sensitiveWords],
      blacklistSites: [...state.blacklist],
      maxClips: parseInt(document.getElementById('maxClips').value) || 5000,
      keepDays: parseInt(document.getElementById('keepDays').value) || 30
    };
    const r = await UI.sendMessage('saveSettings', { settings: newSettings });
    if (r.success) {
      state.settings = newSettings;
      UI.toast('设置已保存', 'success', 2000);
    }
  });

  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (!await UI.confirm('确定恢复为默认设置吗？当前所有设置将被重置')) return;
    const DEFAULTS = {
      isPaused: false, keepDays: 30, maxClips: 5000,
      enableSensitiveMask: false,
      sensitiveWords: ['密码', 'token', 'secret', 'key', 'password', '私钥'],
      blacklistSites: [], mergeSimilarContent: true,
      similarityThreshold: 0.85, autoDetectCode: true, quickPasteCount: 5
    };
    await UI.sendMessage('saveSettings', { settings: DEFAULTS });
    state.settings = DEFAULTS;
    state.sensitiveWords = [...DEFAULTS.sensitiveWords];
    state.blacklist = [];
    UI.toast('已恢复默认设置', 'success');
    render();
  });
}

init();
