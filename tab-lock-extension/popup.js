// Tab Lock - Popup Script
const btnLock = document.getElementById('btnLock');
const btnLabel = document.getElementById('btnLabel');
const btnIconDefault = document.getElementById('btnIconDefault');
const urlDisplay = document.getElementById('urlDisplay');
const urlText = document.getElementById('urlText');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusBadge = document.getElementById('statusBadge');
const mainContent = document.getElementById('mainContent');
const restrictedContent = document.getElementById('restrictedContent');

let currentTabId = null;
let currentUrl = null;
let currentlyLocked = false;

function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('brave://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('devtools://')
  );
}

function renderState(locked, url) {
  currentlyLocked = locked;

  if (locked) {
    urlDisplay.classList.add('locked');
    statusDot.classList.add('on');
    statusText.textContent = 'Tab is locked to this URL';
    statusBadge.textContent = 'LOCKED';
    statusBadge.classList.add('active');
    btnLock.classList.add('locked');
    btnIconDefault.style.display = 'none';
    btnLabel.textContent = 'Unlock This Tab';
  } else {
    urlDisplay.classList.remove('locked');
    statusDot.classList.remove('on');
    statusText.textContent = 'Tab is not locked';
    statusBadge.textContent = 'UNLOCKED';
    statusBadge.classList.remove('active');
    btnLock.classList.remove('locked');
    btnIconDefault.style.display = 'block';
    btnLabel.textContent = 'Lock This Tab';
  }

  if (url) {
    urlText.textContent = url;
  }
}

// Init
chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
  if (!response) return;

  currentTabId = response.tabId;
  currentUrl = response.url;

  if (isRestrictedUrl(currentUrl)) {
    mainContent.style.display = 'none';
    restrictedContent.style.display = 'block';
    return;
  }

  btnLock.disabled = false;
  renderState(response.locked, response.url);
});

// Toggle on click
btnLock.addEventListener('click', () => {
  if (!currentTabId || !currentUrl) return;

  chrome.runtime.sendMessage(
    { action: 'toggleLock', tabId: currentTabId, url: currentUrl },
    (response) => {
      renderState(response.locked, currentUrl);
    }
  );
});
