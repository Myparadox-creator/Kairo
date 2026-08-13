# Kairo System Architecture

Kairo is a cross-browser extension built for Manifest V3 (MV3) that captures context from AI chat platforms (ChatGPT, Claude, Gemini, DeepSeek) and organizes them into reusable, portable **Capsules**.

---

## 1. High-Level System Design

```
+-------------------------------------------------------------------------------+
|                               Browser Web Pages                               |
|   [ChatGPT]               [Claude.ai]            [Gemini]        [DeepSeek]   |
+-------------------------------------------------------------------------------+
       |                         |                     |               |
       +-------------------------+---------------------+---------------+
                                 | DOM Extraction & Floating UI
                                 v
+-------------------------------------------------------------------------------+
|                            Content Script Layer                               |
|  - Platform Detection (content/extractors/index.js)                          |
|  - Extractors: chatgpt.js, claude.js, gemini.js, deepseek.js                  |
|  - In-Page Injector (content/injector.js): Floating capture button & dropzone |
|  - Context Matcher: Identifies thread continuity & active chat turns          |
+-------------------------------------------------------------------------------+
                                 | chrome.runtime.sendMessage
                                 v
+-------------------------------------------------------------------------------+
|                         Background Service Worker                             |
|  - Message Router (background/service-worker.js)                              |
|  - AI Enrichment Engine (background/enricher.js): Claude / Gemini API         |
|  - Shortcuts & Context Menus (chrome.commands, chrome.contextMenus)           |
|  - Omnibox Provider (chrome.omnibox)                                          |
+-------------------------------------------------------------------------------+
         |                                                       ^
         | Persistence                                           | Retrieval
         v                                                       |
+-----------------------------------+     +-------------------------------------+
|        Shared Storage Layer       |     |          Presentation Layer         |
|  - Mutex Queue (storage.js)       |     |  - Popup UI (popup/popup.js)        |
|  - Local Storage (kairo_capsules) |<--->|    * Search, Tagging, Folder Tree   |
|  - Sync Storage (pinned capsules) |     |    * Preact + HTM Reactive UI       |
|  - Canonical Schema (capsule.js)  |     |  - Settings UI (options/options.js) |
+-----------------------------------+     +-------------------------------------+
```

---

## 2. Core Modules & Directory Layout

```
Kairo/
├── background/             # Manifest V3 service worker & background operations
│   ├── enricher.js         # AI enrichment client (Claude & Gemini API)
│   └── service-worker.js   # Central message router, storage coordinator & commands
├── content/                # Content scripts injected into supported AI chat hosts
│   ├── extractors/         # Platform-specific DOM scrapers
│   │   ├── chatgpt.js      # Scrapes conversation turns from ChatGPT DOM
│   │   ├── claude.js       # Scrapes conversation turns from Claude.ai ProseMirror
│   │   ├── deepseek.js     # Scrapes conversation turns & reasoning from DeepSeek
│   │   ├── gemini.js       # Scrapes conversation turns from Gemini custom elements
│   │   └── index.js        # Hostname-to-extractor registry
│   ├── index.js            # Content script entrypoint & capture workflow
│   └── injector.js         # Floating capture button, dropzone & modal prompts
├── popup/                  # Extension browser action popup
│   ├── index.html          # Popup container & design tokens
│   └── popup.js            # Preact + HTM reactive interface for searching/managing capsules
├── options/                # Extension settings page
│   ├── index.html          # Options container
│   └── options.js          # API keys, appearance, and behavior settings
├── shared/                 # Shared utilities, models, and platform abstractions
│   ├── capsule.js          # Canonical Capsule data structure & validation
│   ├── i18n.js             # Internationalization dictionaries (EN/ES)
│   ├── inject.js           # Cross-platform editor injection strategies
│   ├── platforms.js        # Platform metadata & hostname resolution
│   ├── settings.js         # Default settings & schema normalization
│   ├── storage.js          # Mutex-protected chrome.storage wrapper & deduplication
│   ├── toast.js            # UI toast notifications
│   └── utils.js            # Text truncation, thread ID parsers & turn signatures
├── cli/                    # Experimental Python CLI & connection pooling subsystem
└── dist-chrome/            # Built Chrome extension artifacts (Vite output)
```

---

## 3. Key Lifecycles & Data Flows

### A. Context Capture & Deduplication Flow

1. **Trigger**: User clicks the floating button (`#kairo-container`), presses shortcut `Ctrl+Shift+S`, or selects the context menu item.
2. **Extraction**: The active platform's extractor runs DOM traversal strategies to extract turns (`{ role, text, reasoning }`).
3. **Turn Normalization**: Turns are sanitized with `getSafeText()` (stripping UI noise, action buttons, and icons) and capped to recent turns.
4. **Thread Matching**:
   - Checks tab-scoped pinned ID (`data-kairo-capsule-id`).
   - Evaluates a 4-layer matching cascade (`isSameThread`):
     - Direct ID match
     - Platform thread ID match (e.g. `chatgpt:<id>`, `claude:<id>`)
     - URL exact match
     - Turn fingerprint / content overlap (`hasUserTurnOverlap`, `getTurnSignature`)
5. **Persistence & Merge**:
   - **New thread**: Prompts for capsule name $\rightarrow$ creates capsule $\rightarrow$ saves to `chrome.storage.local`.
   - **Existing thread**: Merges newly captured turns into existing capsule $\rightarrow$ updates timestamp $\rightarrow$ notifies user.
6. **Optional AI Enrichment**: If enabled in settings, the background worker invokes Claude or Gemini API to summarize the context, extract goals, constraints, tech stack, and key decisions.

### B. Context Injection Flow

1. **Trigger**: User clicks "Inject" on a capsule in the popup or in-page menu.
2. **Payload Construction**: `buildInjectionText()` formats context using either the user's custom template or the default structured block.
3. **Editor Detection**: `insertTextIntoEditor()` queries the page composer:
   - **Native `<textarea>` / `<input>`**: Writes via property descriptor prototype and dispatches native `InputEvent`.
   - **Rich contenteditable (ProseMirror / Slate / Lexical)**: Dispatches synthetic `beforeinput` $\rightarrow$ synthetic `paste` $\rightarrow$ Range DOM insertion, ensuring cursor preservation without submitting the prompt.

---

## 4. Storage & Concurrency Model

Because `chrome.storage` lacks native atomic transactions, concurrent reads and writes can cause race conditions (last write wins).

- **Mutex Serialization**: All write operations in `shared/storage.js` (`saveCapsule`, `deleteCapsule`, `updateCapsule`, `compactDatabase`) are serialized through a promise-chain mutex (`enqueueMutation`).
- **Hybrid Storage Strategy**:
  - `chrome.storage.local`: Primary storage for full capsule data (`kairo_capsules`), raw turns, and transcripts.
  - `chrome.storage.sync`: Cross-device synchronization for user settings (`kairo_settings`) and pinned capsule references (`kairo_pinned_capsules`).

---

## 5. Architectural Principles

1. **Platform Independence**: All AI platform idiosyncrasies are isolated inside `content/extractors/`.
2. **Zero-Overhead DOM Interaction**: The floating UI uses `ResizeObserver` and mutation batching via `requestAnimationFrame` to avoid layout thrashing.
3. **Graceful Degradation**: If an AI platform updates its DOM structure and specific selectors fail, extractors fall back through tiered selector cascades and safe visible text recovery.
4. **Offline-First & Privacy**: Capsules are stored locally on the user's machine. AI APIs are called directly only if the user configures their own API key.
