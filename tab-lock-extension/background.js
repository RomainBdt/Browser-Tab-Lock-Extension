// Tab Lock - Background Service Worker
// Stores locked tabs: { tabId: { url, origin } }
let lockedTabs = {};
let lastClosedLockedUrl = null;

// Load persisted locked tabs on startup
chrome.storage.local.get(['lockedTabs'], (result) => {
  if (result.lockedTabs) {
    lockedTabs = result.lockedTabs;
    updateAllIcons();
    // Re-apply title prefix on all currently-loaded locked tabs
    Object.keys(lockedTabs).forEach(tabId => {
      applyTitlePrefix(Number(tabId));
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
    tabs.forEach(tab => {
      updateIcon(tab.id, !!lockedTabs[tab.id]);
    });
  });
}

// Inject a content script that prefixes the document.title with 🔒
function applyTitlePrefix(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const PREFIX = '🔒 ';
      if (!document.title.startsWith(PREFIX)) {
        document.title = PREFIX + document.title;
      }
      // Also watch for dynamic title changes (SPAs, etc.)
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
    },
  }).catch(() => {}); // silently fail on restricted pages
}

// Remove the 🔒 prefix and stop the observer
function removeTitlePrefix(tabId) {
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
    },
  }).catch(() => {});
}

// Lock a tab to its current URL
function lockTab(tabId, url) {
  lockedTabs[tabId] = { url, lockedAt: Date.now() };
  persist();
  updateIcon(tabId, true);
  applyTitlePrefix(tabId);
}

// Unlock a tab
function unlockTab(tabId) {
  removeTitlePrefix(tabId);
  delete lockedTabs[tabId];
  persist();
  updateIcon(tabId, false);
}

// Toggle lock state
function toggleLock(tabId, currentUrl) {
  if (lockedTabs[tabId]) {
    unlockTab(tabId);
    return false;
  } else {
    lockTab(tabId, currentUrl);
    return true;
  }
}

// Check if a tab is locked
function isLocked(tabId) {
  return !!lockedTabs[tabId];
}

function getLockedUrl(tabId) {
  return lockedTabs[tabId]?.url || null;
}

// --- Navigation interception ---

// Fires before navigation commits — cancel and open new tab instead
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // Only handle main frame navigations (not iframes, subresources)
  if (details.frameId !== 0) return;

  const tabId = details.tabId;
  if (!isLocked(tabId)) return;

  const lockedUrl = getLockedUrl(tabId);
  const newUrl = details.url;

  // Normalize: strip trailing slash for comparison
  const normalize = (u) => u.replace(/\/$/, '');
  if (normalize(newUrl) === normalize(lockedUrl)) return;

  // It's a different URL — cancel is not possible via webNavigation API,
  // so we redirect back immediately and open new tab.
  chrome.tabs.update(tabId, { url: lockedUrl }, () => {
    chrome.tabs.get(tabId, (tab) => {
      const createDetails = { url: newUrl, active: true };
      if (tab && !chrome.runtime.lastError) {
        createDetails.index = tab.index + 1;
        createDetails.windowId = tab.windowId;
      }
      chrome.tabs.create(createDetails);
    });
  });
});

// Extra safety: if the tab somehow changed URL, snap it back.
// Also re-apply title prefix once the page finishes loading.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isLocked(tabId)) return;

  if (changeInfo.status === 'loading' && changeInfo.url) {
    const lockedUrl = getLockedUrl(tabId);
    const normalize = (u) => u.replace(/\/$/, '');
    if (normalize(changeInfo.url) !== normalize(lockedUrl)) {
      chrome.tabs.update(tabId, { url: lockedUrl }).catch(() => {});
    }
  }

  // Re-inject prefix after page fully loads (handles refresh, SPA nav, etc.)
  if (changeInfo.status === 'complete') {
    applyTitlePrefix(tabId);
  }
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (lockedTabs[tabId]) {
    lastClosedLockedUrl = lockedTabs[tabId].url;
    delete lockedTabs[tabId];
    persist();
    // Show notification to warn about closed locked tab
    chrome.notifications.create('lockedTabClosed', {
      type: 'basic',
      iconUrl: 'icons/icon48_locked.png',
      title: 'Locked Tab Closed',
      message: 'A locked tab was closed. Click to reopen it.',
      buttons: [{ title: 'Reopen Tab' }],
      requireInteraction: true
    });
  }
});

// Update icon when tab becomes active (in case icon state drifted)
chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateIcon(tabId, !!lockedTabs[tabId]);
});

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === 'lockedTabClosed' && buttonIndex === 0 && lastClosedLockedUrl) {
    chrome.tabs.create({ url: lastClosedLockedUrl });
    lastClosedLockedUrl = null;
    chrome.notifications.clear(notificationId);
  }
});

// Handle notification click (if no button)
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'lockedTabClosed' && lastClosedLockedUrl) {
    chrome.tabs.create({ url: lastClosedLockedUrl });
    lastClosedLockedUrl = null;
    chrome.notifications.clear(notificationId);
  }
});

// Message handler for popup
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
    return true; // async
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
