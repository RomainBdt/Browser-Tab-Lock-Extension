# 🔒 Tab Lock

A chromium extension that locks a tab to a specific URL. Any navigation attempt — link click, form submission, address bar change — opens in a new tab instead of leaving the locked page. Closing a locked tab triggers a confirmation dialog.

---

## Features

- **URL lock** — pin any tab to its current URL with one click
- **Redirect on navigate** — all navigation from a locked tab opens in a new tab automatically
- **Close confirmation** — the browser prompts before allowing a locked tab to close
- **Tab title prefix** — locked tabs display a `🔒` prefix so they're instantly recognizable
- **Persistent state** — lock state survives browser restarts (stored via `chrome.storage.local`)
- **SPA-aware** — a `MutationObserver` keeps the title prefix in place even when JavaScript updates the page title dynamically
- **Clean unlock** — unlocking restores the original title and removes all injected handlers

---

## Installation

This extension is not published on the Chrome Web Store. Install it in developer mode:

1. Download or clone this repository
2. Open `brave://extensions/` (or `chrome://extensions/`)
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the repository folder
5. The Tab Lock icon appears in your toolbar

To update after pulling changes, click the **↺ Reload** button on the extension card.

---

## Usage

1. Navigate to the page you want to lock
2. Click the **Tab Lock** icon in the toolbar
3. Click **Lock This Tab** — the badge changes to `LOCKED` and the tab title gains a `🔒` prefix
4. Any link or navigation on that tab now opens in a new tab
5. To unlock, click the icon again and click **Unlock This Tab**

---

## How It Works

The extension uses three browser APIs working together:

**`chrome.webNavigation.onBeforeNavigate`** — intercepts navigation events on the main frame. When a locked tab attempts to navigate to a different URL, the extension immediately redirects the tab back to the locked URL and opens the intended destination in a new tab.

**`chrome.tabs.onUpdated`** — acts as a fallback snap-back in case a navigation slips past the above listener, and re-injects content scripts after each full page load (handles manual refreshes).

**`chrome.scripting.executeScript`** — injects two behaviors directly into the page context:
- A `MutationObserver` on the `<title>` element to maintain the `🔒` prefix
- A `beforeunload` event listener that triggers the browser's native close-confirmation dialog

> **Note on Manifest V3:** MV3 service workers cannot cancel navigation before it starts. The extension detects the navigation and performs an immediate redirect + new tab open. On slow connections this may cause a brief flash. This is a platform-level constraint shared by all MV3 extensions.

---

## File Structure

```
tab-lock-extension/
├── manifest.json       # Extension manifest (MV3), permissions declaration
├── background.js       # Service worker — lock logic, navigation interception
├── popup.html          # Toolbar popup UI
├── popup.js            # Popup state management
└── icons/
    ├── icon16.png          # Default state icons
    ├── icon48.png
    ├── icon128.png
    ├── icon16_locked.png   # Locked state icons (yellow-green tint)
    └── icon48_locked.png
```

---

## Permissions

| Permission | Reason |
|---|---|
| `tabs` | Read the current tab's URL and update tab properties |
| `storage` | Persist lock state across sessions |
| `webNavigation` | Intercept navigation events before they commit |
| `scripting` | Inject title prefix and close-confirmation into page context |
| `<all_urls>` | Required for `scripting` to work on any page |

---

## Known Limitations

- Does not work on browser-internal pages (`brave://`, `chrome://`, `about:`) — these pages block content script injection by design
- The close-confirmation dialog shows the browser's generic message, not a custom one — Chromium ignores the `returnValue` string for security reasons
- Lock state is stored by `tabId`, which is not stable across browser restarts. If the browser is closed and reopened, previously locked tabs are no longer tracked (the stored state is cleaned up automatically)

---

## License

MIT
