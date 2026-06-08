let lastTextContent = '';
let lastImageHash = '';
let lastCaptureTime = 0;

function getPageMeta() {
  try {
    return {
      title: document.title,
      sourceUrl: window.location.href,
      sourceHost: window.location.hostname,
      sourceApp: '浏览器 - ' + (window.location.hostname || '未知')
    };
  } catch (e) {
    return { title: '', sourceUrl: '', sourceHost: '', sourceApp: '浏览器' };
  }
}

function getFavicon() {
  try {
    const link = document.querySelector('link[rel*="icon"]');
    if (link) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('http')) return href;
      if (href && href.startsWith('//')) return window.location.protocol + href;
      if (href) return window.location.origin + (href.startsWith('/') ? '' : '/') + href;
    }
  } catch (e) {}
  return '';
}

async function captureClipboardData() {
  const now = Date.now();
  if (now - lastCaptureTime < 300) return;
  lastCaptureTime = now;

  const meta = getPageMeta();
  meta.sourceFavicon = getFavicon();

  try {
    const text = await navigator.clipboard.readText();
    if (text && text !== lastTextContent && text.trim().length > 0) {
      lastTextContent = text;
      chrome.runtime.sendMessage({
        action: 'addClip',
        payload: {
          ...meta,
          content: text
        }
      });
      return;
    }
  } catch (e) {}

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          try {
            const blob = await item.getType(type);
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result;
              const hash = dataUrl.substring(0, 200);
              if (hash !== lastImageHash) {
                lastImageHash = hash;
                chrome.runtime.sendMessage({
                  action: 'addClip',
                  payload: {
                    ...meta,
                    content: '',
                    type: 'image',
                    imageData: dataUrl
                  }
                });
              }
            };
            reader.readAsDataURL(blob);
          } catch (e) {}
          break;
        }
      }
    }
  } catch (e) {}
}

document.addEventListener('copy', () => {
  setTimeout(captureClipboardData, 50);
});

document.addEventListener('cut', () => {
  setTimeout(captureClipboardData, 50);
});

window.addEventListener('focus', () => {
  setTimeout(captureClipboardData, 200);
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C' || e.key === 'x' || e.key === 'X')) {
    setTimeout(captureClipboardData, 100);
  }
});

setInterval(captureClipboardData, 5000);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getContentInfo') {
    sendResponse({
      url: window.location.href,
      title: document.title,
      selection: window.getSelection()?.toString() || '',
      favicon: getFavicon()
    });
  } else if (request.action === 'captureSelection') {
    const selection = window.getSelection();
    const text = selection?.toString();
    if (text && text.trim().length > 0) {
      const meta = getPageMeta();
      chrome.runtime.sendMessage({
        action: 'addClip',
        payload: {
          ...meta,
          content: text
        }
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'no-selection' });
    }
  }
  return true;
});

setTimeout(captureClipboardData, 1000);
