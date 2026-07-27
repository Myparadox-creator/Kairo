// content/extractors/chatgpt.js — ChatGPT DOM extractor
// Serves chatgpt.com (the legacy OpenAI chat host permanently redirects here)
// Selectors verified: May 2026

import { getSafeText } from '../../shared/utils.js';

/**
 * Best-effort per-element role detection for the fallback strategies, replacing
 * blind positional (i % 2) alternation. Inspects the element (and, for explicit
 * role attributes, its descendants) for the same signals the primary strategies
 * rely on — author-role / data-role / data-testid attributes and user vs
 * assistant class-name patterns. Returns 'unknown' when no reliable signal
 * exists, so ambiguous turns are flagged rather than mislabeled.
 *
 * @param {Element} el
 * @returns {'user'|'assistant'|'unknown'}
 */
function detectRole(el) {
  // 1. Explicit author-role attribute (element or descendant) — most reliable.
  const authorEl = el.matches('[data-message-author-role]')
    ? el
    : el.querySelector('[data-message-author-role]');
  if (authorEl) {
    return authorEl.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
  }

  // 2. Explicit data-role attribute (element or descendant).
  const dataRoleEl = el.matches('[data-role]') ? el : el.querySelector('[data-role]');
  if (dataRoleEl) {
    const r = (dataRoleEl.getAttribute('data-role') || '').toLowerCase();
    if (r === 'user' || r === 'human') return 'user';
    if (r) return 'assistant';
  }

  // 3. Claude-style data-testid turn markers (element or descendant).
  const testidEl = el.matches('[data-testid]') ? el : el.querySelector('[data-testid]');
  if (testidEl) {
    const t = (testidEl.getAttribute('data-testid') || '').toLowerCase();
    if (t.includes('human') || t.includes('user')) return 'user';
    if (t.includes('ai-turn') || t.includes('assistant')) return 'assistant';
  }

  // 4. Class-name signals — the element's own classes, then any descendant's.
  //    Substring matching mirrors this codebase's existing convention
  //    (e.g. classList.toString().includes('user')).
  const selfCls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
  if (selfCls.includes('user') || selfCls.includes('human')) return 'user';
  if (selfCls.includes('assistant') || selfCls.includes('bot') || selfCls.includes('model')) {
    return 'assistant';
  }
  for (const child of el.querySelectorAll('[class]')) {
    const c = (typeof child.className === 'string' ? child.className : '').toLowerCase();
    if (c.includes('user') || c.includes('human')) return 'user';
    if (c.includes('assistant') || c.includes('bot') || c.includes('model')) return 'assistant';
  }

  // 5. No reliable signal.
  return 'unknown';
}

export default {
  platform: 'chatgpt',

  extract() {
    let turns;

    // ── Scope to the active conversation thread only ──────────────────────
    // ChatGPT renders a sidebar with conversation history that also contains
    // [data-message-author-role] elements — we must exclude that.
    const threadSelectors = [
      '[class*="ConversationPanel"]',
      '[class*="conversation-panel"]',
      'main [class*="Thread"]',
      'main [class*="thread"]',
      '#__next main',
      'main',
    ];

    let threadEl = null;
    for (const sel of threadSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        threadEl = el;
        break;
      }
    }

    const root = threadEl || document.body;

    // Strategy 1: data-message-author-role — scoped to thread
    turns = [...root.querySelectorAll('[data-message-author-role]')];
    if (turns.length) {
      // Filter out anything that might be from nav/sidebar (no meaningful text)
      const filtered = turns.filter((el) => getSafeText(el).length > 0);
      console.log(
        `[Kairo Extractor] ChatGPT: ${filtered.length} turns (data-message-author-role, thread-scoped)`,
      );
      return filtered.map((el) => ({
        role: el.dataset.messageAuthorRole === 'user' ? 'user' : 'assistant',
        text: getSafeText(el),
      }));
    }

    // Strategy 1.5: data-message-id — stable in newer ChatGPT UI
    turns = [...root.querySelectorAll('[data-message-id]')];
    if (turns.length) {
      console.log(`[Kairo Extractor] ChatGPT: ${turns.length} turns (data-message-id)`);
      return turns
        .map((el) => ({
          role: detectRole(el),
          text: getSafeText(el),
        }))
        .filter((t) => t.text.length > 0 && t.role !== 'unknown');
    }

    // Strategy 2: article[data-testid="conversation-turn-*"]
    turns = [...root.querySelectorAll('article[data-testid^="conversation-turn"]')];
    if (turns.length) {
      console.log(`[Kairo Extractor] ChatGPT: ${turns.length} turns (article[data-testid])`);
      return turns
        .map((el) => ({
          role:
            el.querySelector('[data-message-author-role="user"]') !== null ? 'user' : 'assistant',
          text: getSafeText(el),
        }))
        .filter((t) => t.text.length > 0);
    }

    // Strategy 3: .group containers inside main (older ChatGPT UI)
    turns = [...document.querySelectorAll('main .group')];
    if (turns.length >= 2) {
      console.log(`[Kairo Extractor] ChatGPT: ${turns.length} turns (.group in main)`);
      return turns
        .map((el) => ({
          role: detectRole(el),
          text: getSafeText(el),
          _lowConfidenceRole: true,
        }))
        .filter((t) => t.text.length > 0);
    }

    // Strategy 4: div[class*="message"] inside main
    turns = [
      ...document.querySelectorAll('main div[class*="message"], main div[class*="Message"]'),
    ];
    if (turns.length >= 2) {
      // Deduplicate nested matches (keep outermost)
      const deduped = turns.filter(
        (el) => !turns.some((other) => other !== el && other.contains(el)),
      );
      if (deduped.length >= 2) {
        console.log(
          `[Kairo Extractor] ChatGPT: ${deduped.length} turns (div[class*=message] deduped)`,
        );
        return deduped
          .map((el) => ({
            role: detectRole(el),
            text: getSafeText(el),
            _lowConfidenceRole: true,
          }))
          .filter((t) => t.text.length > 0);
      }
    }

    // Strategy 5: any substantial block inside main
    const mainEl = document.querySelector('main') || document.querySelector('[role="main"]');
    if (mainEl) {
      const allBlocks = [...mainEl.querySelectorAll(':scope > * > * > *')];
      const textBlocks = allBlocks.filter((el) => getSafeText(el).length > 30);
      if (textBlocks.length >= 2) {
        console.log(`[Kairo Extractor] ChatGPT: ${textBlocks.length} blocks (main children)`);
        return textBlocks.map((el) => ({
          role: detectRole(el),
          text: getSafeText(el),
          _lowConfidenceRole: true,
        }));
      }
    }

    // Final fallback — full page visible text
    console.warn('[Kairo Extractor] ChatGPT: using full-page text fallback');
    const bodyText = getSafeText(document.body);
    if (bodyText.length > 50) {
      return [{ role: 'user', text: bodyText.slice(0, 8000) }];
    }

    return [];
  },
};
