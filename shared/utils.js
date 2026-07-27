// shared/utils.js — Utility functions for date formatting, text truncation, etc.

/**
 * Format a Unix timestamp into a human-readable relative string.
 * @param {number} timestamp
 * @returns {string}
 */
export function timeAgo(timestamp, locale = 'en') {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  const isEs = locale === 'es';

  if (seconds < 60) return isEs ? 'hace un momento' : 'just now';
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return isEs ? `hace ${mins}m` : `${mins}m ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return isEs ? `hace ${hours}h` : `${hours}h ago`;
  }
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return isEs ? `hace ${days}d` : `${days}d ago`;
  }

  return new Date(timestamp).toLocaleDateString(isEs ? 'es-ES' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Truncate text to a maximum length with ellipsis.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
export function truncate(text, maxLen = 120) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

/**
 * Get a platform display name from the source key.
 * @param {string} source
 * @returns {string}
 */
export function platformName(source) {
  const names = {
    claude: 'Claude',
    chatgpt: 'ChatGPT',
    gemini: 'Gemini',
    deepseek: 'DeepSeek',
  };
  return names[source] || source || 'Unknown';
}

/**
 * Clean text for robust content comparison by stripping UI noise words
 * (like action buttons, icon text, "edit", "copy") and non-alphanumeric junk.
 * @param {string} str
 * @returns {string}
 */
export function cleanTextForMatching(str = '') {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    // Strip UI button labels and SVG icon names commonly rendered near message text
    .replace(/\b(edit|copy|content_copy|share|retry|thumbs?_up|thumbs?_down|more_vert|expand_more|read_aloud|modify|drafts?)\b/g, '')
    // Replace non-alphanumeric with spaces
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Recursively gather text nodes from a DOM element, skipping scripts, styles, iframes,
 * and UI action buttons/icons that can contaminate conversation turn text.
 *
 * @param {Element} el
 * @returns {string}
 */
export function getSafeText(el) {
  if (!el) return '';

  let target = el;
  // If running in browser environment with Element DOM available, strip UI action controls first
  if (typeof Element !== 'undefined' && el instanceof Element) {
    try {
      const clone = el.cloneNode(true);
      const selectorsToRemove = 'button, svg, [role="button"], .aria-label, [data-testid*="button"], [class*="action"], [class*="icon"], [class*="copy"], [class*="edit"]';
      clone.querySelectorAll(selectorsToRemove).forEach((node) => node.remove());
      target = clone;
    } catch (e) {
      target = el;
    }
  }

  // 1. innerText flattens Shadow DOM & returns only visible text
  if (typeof target.innerText === 'string' && target.innerText.trim().length > 0) {
    return target.innerText.trim();
  }

  // 2. textContent fallback
  if (typeof target.textContent === 'string' && target.textContent.trim().length > 0) {
    return target.textContent.trim();
  }

  // 3. Manual recursive walk that descends into shadowRoot
  let text = '';
  function walkNode(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const val = node.textContent?.trim();
      if (val) text += val + ' ';
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;
      if (['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'BUTTON', 'SVG'].includes(tag)) return;
      if (node.shadowRoot) {
        for (const child of node.shadowRoot.childNodes) walkNode(child);
      }
      for (const child of node.childNodes) walkNode(child);
    }
  }

  walkNode(target);
  return text.trim();
}

/**
 * Extract a unique thread identifier from a URL for supported AI platforms.
 * Returns '' when no thread ID is present in the URL (e.g. Gemini /app/).
 * @param {string} url - The full location URL
 * @returns {string} The normalized thread ID, or '' if none can be extracted
 */
export function extractThreadId(url = '') {
  if (!url || typeof url !== 'string') return '';

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname;

    // ChatGPT (chatgpt.com / chat.openai.com)
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) {
      const match = pathname.match(/\/(?:g\/[^/]+\/)?c\/([a-zA-Z0-9-]+)/);
      if (match && match[1]) {
        return `chatgpt:${match[1]}`;
      }
      return '';
    }

    // Claude (claude.ai)
    if (host.includes('claude.ai')) {
      const match = pathname.match(/\/(?:project\/[^/]+\/)?chat\/([a-zA-Z0-9-]+)/);
      if (match && match[1]) {
        return `claude:${match[1]}`;
      }
      return '';
    }

    // Gemini (gemini.google.com)
    if (host.includes('gemini.google.com')) {
      const match = pathname.match(/\/app\/([a-zA-Z0-9-_]+)/);
      if (match && match[1] && match[1] !== 'app') {
        return `gemini:${match[1]}`;
      }
      const paramId = parsed.searchParams.get('c') || parsed.searchParams.get('id');
      if (paramId) {
        return `gemini:${paramId}`;
      }
      const hashMatch = parsed.hash.match(/#(?:\/)?(?:c\/)?([a-zA-Z0-9-_]+)/);
      if (hashMatch && hashMatch[1]) {
        return `gemini:${hashMatch[1]}`;
      }
      return '';
    }

    // DeepSeek (chat.deepseek.com)
    if (host.includes('deepseek.com')) {
      const match = pathname.match(/\/(?:a\/)?(?:chat\/)?(?:s\/)?([a-zA-Z0-9-_]+)/);
      if (match && match[1] && !['chat', 'coder', 's', 'a'].includes(match[1].toLowerCase())) {
        return `deepseek:${match[1]}`;
      }
      return '';
    }

    return '';
  } catch (err) {
    return '';
  }
}

/**
 * Create a normalized text signature from the earliest user conversation turn.
 * @param {Array<{role: string, text: string}>} turns
 * @returns {string}
 */
export function getTurnSignature(turns = []) {
  if (!Array.isArray(turns) || !turns.length) return '';
  const userTurn = turns.find((t) => t && t.role === 'user' && t.text && t.text.trim().length > 0);
  if (userTurn) {
    return cleanTextForMatching(userTurn.text).slice(0, 150);
  }
  const firstTurn = turns.find((t) => t && t.text && t.text.trim().length > 0);
  return firstTurn ? cleanTextForMatching(firstTurn.text).slice(0, 150) : '';
}

/**
 * Check if two sets of conversation turns share any overlapping content.
 * @param {Array<{role: string, text: string}>} turnsA
 * @param {Array<{role: string, text: string}>} turnsB
 * @returns {boolean}
 */
export function hasTurnOverlap(turnsA = [], turnsB = []) {
  if (!Array.isArray(turnsA) || !Array.isArray(turnsB)) return false;
  if (!turnsA.length || !turnsB.length) return false;

  const cleanedA = turnsA
    .filter((t) => t && t.text)
    .map((t) => cleanTextForMatching(t.text))
    .filter((txt) => txt.length >= 8);

  const cleanedB = turnsB
    .filter((t) => t && t.text)
    .map((t) => cleanTextForMatching(t.text))
    .filter((txt) => txt.length >= 8);

  if (!cleanedA.length || !cleanedB.length) return false;

  for (const a of cleanedA) {
    for (const b of cleanedB) {
      if (a === b) return true;
      const subA = a.slice(0, 120);
      const subB = b.slice(0, 120);
      if (subA.length >= 12 && subB.length >= 12) {
        if (subA.includes(subB) || subB.includes(subA)) return true;
      }
    }
  }

  return false;
}

/**
 * Check if two sets of conversation turns share any identical or overlapping USER prompts.
 * Uses cleaned text and substring matching to withstand action button text & DOM variances.
 * @param {Array<{role: string, text: string}>} turnsA
 * @param {Array<{role: string, text: string}>} turnsB
 * @returns {boolean}
 */
export function hasUserTurnOverlap(turnsA = [], turnsB = []) {
  if (!Array.isArray(turnsA) || !Array.isArray(turnsB)) return false;
  if (!turnsA.length || !turnsB.length) return false;

  const userTurnsA = turnsA
    .filter((t) => t && (t.role === 'user' || !t.role) && t.text)
    .map((t) => cleanTextForMatching(t.text))
    .filter((txt) => txt.length >= 5);

  const userTurnsB = turnsB
    .filter((t) => t && (t.role === 'user' || !t.role) && t.text)
    .map((t) => cleanTextForMatching(t.text))
    .filter((txt) => txt.length >= 5);

  if (!userTurnsA.length || !userTurnsB.length) return false;

  for (const a of userTurnsA) {
    for (const b of userTurnsB) {
      if (a === b) return true;
      const subA = a.slice(0, 100);
      const subB = b.slice(0, 100);
      if (subA.length >= 10 && subB.length >= 10) {
        if (subA.includes(subB) || subB.includes(subA)) return true;
      }
    }
  }

  return false;
}
