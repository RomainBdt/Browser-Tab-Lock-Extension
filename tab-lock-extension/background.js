// Tab Lock - Background Service Worker
// Stores locked tabs: { tabId: { url, lockedAt } }
let lockedTabs = {};

// Load persisted locked tabs on startup
chrome.storage.local.get(['lockedTabs'], (result) => {
  if (result.lockedTabs) {
    lockedTabs = result.lockedTabs;
    updateAllIcons();
    // Re-apply all indicators on already-loaded locked tabs
    Object.keys(lockedTabs).forEach(tabId => {
      applyLockIndicators(Number(tabId));
    });
  }
});

function persist() {
  chrome.storage.local.set({ lockedTabs });
}

function updateIcon(tabId, locked) {
  const path = locked
    ? { 16: 'icons/icon16_locked.png', 48: 'icons/icon48_locked.png' }
    : { 16: 'icons/icon16.png', 48: 'icons/icon48.png' };
  chrome.action.setIcon({ tabId, path }).catch(() => {});
}

function updateAllIcons() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => updateIcon(tab.id, !!lockedTabs[tab.id]));
  });
}

// ─── Content script injection ────────────────────────────────────────────────

// Inject title prefix + beforeunload confirmation into the page
function applyLockIndicators(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // --- 🔒 Title prefix ---
      const PREFIX = '🔒 ';
      if (!document.title.startsWith(PREFIX)) {
        document.title = PREFIX + document.title;
      }
      // Watch for dynamic title changes (SPAs)
      if (window.__tabLockObserver) window.__tabLockObserver.disconnect();
      const observer = new MutationObserver(() => {
        if (!document.title.startsWith(PREFIX)) {
          document.title = PREFIX + document.title;
        }
      });
      observer.observe(
        document.querySelector('title') || document.head,
        { childList: true, characterData: true, subtree: true }
      );
      window.__tabLockObserver = observer;

      // --- Close confirmation ---
      // Deregister any stale handler before adding a fresh one
      if (window.__tabLockBeforeUnload) {
        window.removeEventListener('beforeunload', window.__tabLockBeforeUnload);
      }
      window.__tabLockBeforeUnload = (e) => {
        e.preventDefault();
        e.returnValue = 'This tab is locked. Are you sure you want to close it?';
        return e.returnValue;
      };
      window.addEventListener('beforeunload', window.__tabLockBeforeUnload);
    },
  }).catch(() => {}); // silently fail on restricted/internal pages
}

// Remove all lock indicators from the page
function removeLockIndicators(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const PREFIX = '🔒 ';
      if (window.__tabLockObserver) {
        window.__tabLockObserver.disconnect();
        window.__tabLockObserver = null;
      }
      if (document.title.startsWith(PREFIX)) {
        document.title = document.title.slice(PREFIX.length);
      }
      if (window.__tabLockBeforeUnload) {
        window.removeEventListener('beforeunload', window.__tabLockBeforeUnload);
        window.__tabLockBeforeUnload = null;
      }
    },
  }).catch(() => {});
}

// ─── Lock / Unlock ───────────────────────────────────────────────────────────

function lockTab(tabId, url) {
  lockedTabs[tabId] = { url, lockedAt: Date.now() };
  persist();
  updateIcon(tabId, true);
  applyLockIndicators(tabId);
}

function unlockTab(tabId) {
  removeLockIndicators(tabId);
  delete lockedTabs[tabId];
  persist();
  updateIcon(tabId, false);
}

function toggleLock(tabId, currentUrl) {
  if (lockedTabs[tabId]) {
    unlockTab(tabId);
    return false;
  } else {
    lockTab(tabId, currentUrl);
    return true;
  }
}

function isLocked(tabId) {
  return !!lockedTabs[tabId];
}

function getLockedUrl(tabId) {
  return lockedTabs[tabId]?.url || null;
}

// ─── Navigation interception ─────────────────────────────────────────────────

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return; // main frame only

  const tabId = details.tabId;
  if (!isLocked(tabId)) return;

  const lockedUrl = getLockedUrl(tabId);
  const newUrl = details.url;
  const normalize = (u) => u.replace(/\/$/, '');
  if (normalize(newUrl) === normalize(lockedUrl)) return;

  // Redirect tab back and open intended URL in a new tab
  chrome.tabs.update(tabId, { url: lockedUrl }, () => {
    chrome.tabs.create({ url: newUrl, active: true });
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!isLocked(tabId)) return;

  // Fallback URL snap-back
  if (changeInfo.status === 'loading' && changeInfo.url) {
    const lockedUrl = getLockedUrl(tabId);
    const normalize = (u) => u.replace(/\/$/, '');
    if (normalize(changeInfo.url) !== normalize(lockedUrl)) {
      chrome.tabs.update(tabId, { url: lockedUrl }).catch(() => {});
    }
  }

  // Re-inject indicators after full page load (handles refresh)
  if (changeInfo.status === 'complete') {
    applyLockIndicators(tabId);
  }
});

// ─── Cleanup & housekeeping ───────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  if (lockedTabs[tabId]) {
    delete lockedTabs[tabId];
    persist();
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateIcon(tabId, !!lockedTabs[tabId]);
});

// ─── Popup message handler ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getState') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return sendResponse({ locked: false, url: null });
      sendResponse({
        locked: isLocked(tab.id),
        url: tab.url,
        lockedUrl: getLockedUrl(tab.id),
        tabId: tab.id,
      });
    });
    return true;
  }

  if (message.action === 'toggleLock') {
    const { tabId, url } = message;
    const nowLocked = toggleLock(tabId, url);
    sendResponse({ locked: nowLocked, lockedUrl: nowLocked ? url : null });
    return true;
  }

  if (message.action === 'unlock') {
    unlockTab(message.tabId);
    sendResponse({ locked: false });
    return true;
  }
});
