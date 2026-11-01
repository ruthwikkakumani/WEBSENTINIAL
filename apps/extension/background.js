// WebSentinel Guard — Background Service Worker (Manifest V3)
// ============================================================
// Responsibilities:
//   - Context menu "Check this link with WebSentinel"
//   - Badge (green check / red warning) on the active tab
//   - Auto-check on navigation (debounced)
//   - Cache last result per domain
//   - Alarm to recheck watched domains every 5 minutes
//   - Notification on high-risk findings
//   - Port connection to popup for real-time results
//   - Keyboard shortcut Ctrl+Shift+S

const API = 'http://127.0.0.1:8080/api/v1/assess';
const SITE_URL = 'http://127.0.0.1:5173/?check=';
const CHECK_ALARM = 'websentinel-recheck';
const DEBOUNCE_MS = 800;

// ── In-memory caches ────────────────────────────────────────────────
const resultCache = new Map();       // domain → { data, timestamp }
const watchedDomains = new Set();    // domains to recheck periodically
const pendingNavigations = new Map();// tabId → timeoutId

// ── Context Menu ───────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'check-link',
      title: 'Check this link with WebSentinel',
      contexts: ['link'],
    });
    chrome.contextMenus.create({
      id: 'check-page',
      title: 'Check this page with WebSentinel',
      contexts: ['page'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl || (tab && tab.url);
  if (!url) return;
  checkUrl(url, tab && tab.id);
});

// ── Keyboard Shortcut (handled by commands in manifest) ────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'check-site') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (tab && tab.url) checkUrl(tab.url, tab.id);
    });
  }
});

// ── Navigation Auto-Check (debounced) ──────────────────────────────
chrome.webNavigation.onCompleted.addListener((details) => {
  // Only top-level frames
  if (details.frameId !== 0) return;

  const tabId = details.tabId;
  const url = details.url;

  // Clear any pending debounce for this tab
  const existing = pendingNavigations.get(tabId);
  if (existing) clearTimeout(existing);

  const timeoutId = setTimeout(() => {
    pendingNavigations.delete(tabId);
    checkUrl(url, tabId, { auto: true });
  }, DEBOUNCE_MS);

  pendingNavigations.set(tabId, timeoutId);
});

// ── Alarm — Recheck watched domains ────────────────────────────────
chrome.alarms.create(CHECK_ALARM, { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM) {
    for (const domain of watchedDomains) {
      checkUrl(`https://${domain}`, null, { silent: true });
    }
  }
});

// ── Core check function ────────────────────────────────────────────
async function checkUrl(url, tabId, options = {}) {
  const { auto = false, silent = false } = options;
  const origin = extractOrigin(url);
  if (!origin) return;

  // Check cache first (fresh within 60 seconds)
  const cached = resultCache.get(origin);
  if (cached && (Date.now() - cached.timestamp < 60_000) && !silent) {
    // Still broadcast to popup
    broadcastResult(origin, cached.data);
    if (tabId) updateBadge(tabId, cached.data);
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: origin }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();
    if (!res.ok) {
      if (tabId) setBadgeError(tabId);
      return;
    }

    // Cache result
    resultCache.set(origin, { data, timestamp: Date.now() });

    // Track domain for rechecking if high risk or suspicious
    if (data.verdict === 'high_risk' || data.verdict === 'suspicious') {
      const domain = extractDomain(origin);
      if (domain) watchedDomains.add(domain);
    }

    // Update badge
    if (tabId) updateBadge(tabId, data);

    // Broadcast to any connected popup
    broadcastResult(origin, data);

    // Show notification for high-risk (not on auto-check to avoid spam)
    if (data.verdict === 'high_risk' && !auto && !silent) {
      showRiskNotification(origin, data);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`[WebSentinel] Check timed out for ${origin}`);
    } else {
      console.warn(`[WebSentinel] Check failed for ${origin}:`, err.message);
    }
    if (tabId) setBadgeError(tabId);
  }
}

// ── Badge Management ───────────────────────────────────────────────
function updateBadge(tabId, data) {
  if (!tabId) return;

  let text = '';
  let color = '';

  if (data.verdict === 'safe') {
    text = '\u2713';  // checkmark
    color = '#2ecc71'; // green
  } else if (data.verdict === 'suspicious') {
    text = '!';
    color = '#f39c12'; // amber
  } else if (data.verdict === 'high_risk') {
    text = '\u26A0';  // warning sign
    color = '#e74c3c'; // red
  } else {
    text = '?';
    color = '#95a5a6'; // grey
  }

  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
  chrome.action.setTitle({ tabId, title: `WebSentinel: ${data.verdictLabel || data.verdict}` });
}

function setBadgeError(tabId) {
  if (!tabId) return;
  chrome.action.setBadgeText({ tabId, text: '?' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#7f8c8d' });
  chrome.action.setTitle({ tabId, title: 'WebSentinel: Could not check' });
}

// ── Port Connection (popup) ────────────────────────────────────────
const popupPorts = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'websentinel-popup') {
    popupPorts.add(port);

    port.onMessage.addListener((msg) => {
      if (msg.type === 'CHECK') {
        checkUrl(msg.url, null, { auto: false });
      }
      if (msg.type === 'GET_CACHED' && msg.origin) {
        const cached = resultCache.get(msg.origin);
        port.postMessage({
          type: 'CACHED_RESULT',
          origin: msg.origin,
          data: cached ? cached.data : null,
        });
      }
    });

    port.onDisconnect.addListener(() => {
      popupPorts.delete(port);
    });
  }
});

function broadcastResult(origin, data) {
  for (const port of popupPorts) {
    try {
      port.postMessage({ type: 'RESULT', origin, data });
    } catch {
      popupPorts.delete(port);
    }
  }
}

// ── Notification ───────────────────────────────────────────────────
function showRiskNotification(origin, data) {
  const domain = extractDomain(origin) || origin;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${data.verdictLabel || 'High Risk'} — ${domain}`,
    message: data.summary || 'This site has concerning indicators. Open your browser for details.',
    priority: 2,
    buttons: [{ title: 'Open Case File' }],
    requireInteraction: true,
  });
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // Extract origin from notificationId or just open the app
    chrome.tabs.create({ url: SITE_URL });
  }
});

// ── Utility functions ──────────────────────────────────────────────
function extractOrigin(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.origin;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

function extractDomain(origin) {
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch {
    return null;
  }
}

// ── Message from popup / other parts ───────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CHECK_URL') {
    checkUrl(msg.url, sender.tab && sender.tab.id);
    sendResponse({ accepted: true });
  }
  if (msg.type === 'GET_CACHE') {
    const cached = resultCache.get(msg.origin);
    sendResponse({ data: cached ? cached.data : null, timestamp: cached ? cached.timestamp : null });
  }
  return true; // keep channel open for async response
});