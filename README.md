# 🔒 Tab Lock

A chromium extension that locks a tab to a specific URL. Any navigation attempt — link click, form submission, address bar change — opens in a new tab instead of leaving the locked page. Closing a locked tab shows a notification to reopen it if closed accidentally.

---

## Features

- **URL lock** — pin any tab to its current URL with one click
- **Redirect on navigate** — all navigation from a locked tab opens in a new tab automatically
- **Adjacent tab placement** — redirected pages open immediately next to the locked source tab instead of at the end
- **Close warning** — closing a locked tab shows a notification with an option to reopen it
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

**`chrome.webNavigation.onBeforeNavigate`** — intercepts navigation events on the main frame. When a locked tab attempts to navigate to a different URL, the extension immediately redirects the tab back to the locked URL and opens the intended destination in a new tab adjacent to the locked source.

**`chrome.tabs.onUpdated`** — acts as a fallback snap-back in case a navigation slips past the above listener, and re-injects content scripts after each full page load (handles manual refreshes).

**`chrome.scripting.executeScript`** — injects a `MutationObserver` on the `<title>` element to maintain the `🔒` prefix

**`chrome.tabs.onRemoved`** — detects when a locked tab is closed and shows a notification with a reopen option

**`chrome.notifications`** — handles user interaction with the notification to reopen the closed tab

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
| `scripting` | Inject title prefix into page context |
| `notifications` | Show warning when a locked tab is closed |
| `<all_urls>` | Required for `scripting` to work on any page |

---

## Known Limitations

- Does not work on browser-internal pages (`brave://`, `chrome://`, `about:`) — these pages block content script injection by design
- Lock state is stored by `tabId`, which is not stable across browser restarts. If the browser is closed and reopened, previously locked tabs are no longer tracked (the stored state is cleaned up automatically)

---

## License

MIT
