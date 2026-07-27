// content/extractors/claude.js — Claude.ai DOM extractor
// Selectors verified: May 2026 — review every 4-6 weeks

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
  platform: 'claude',

  extract() {
    let turns;

    // Strategy 1: data-testid attributes (most stable)
    turns = [...document.querySelectorAll('[data-testid="human-turn"], [data-testid="ai-turn"]')];
    if (turns.length) {
      console.log(`[Kairo Extractor] Claude: ${turns.length} turns (data-testid)`);
      return turns.map((el) => ({
        role: el.dataset.testid === 'human-turn' ? 'user' : 'assistant',
        text: getSafeText(el),
      }));
    }

    // Strategy 2: user/assistant message wrappers
    turns = [
      ...document.querySelectorAll('[data-is-streaming], .font-claude-message, .font-user-message'),
    ];
    if (turns.length) {
      console.log(`[Kairo Extractor] Claude: ${turns.length} turns (message wrappers)`);
      return turns.map((el) => ({
        role:
          el.classList.contains('font-user-message') ||
          el.querySelector('[data-testid="human-turn"]')
            ? 'user'
            : 'assistant',
        text: getSafeText(el),
      }));
    }

    // Strategy 3: conversation turn containers by role attribute
    turns = [...document.querySelectorAll('[data-role]')];
    if (turns.length) {
      console.log(`[Kairo Extractor] Claude: ${turns.length} turns (data-role)`);
      return turns.map((el) => ({
        role: el.dataset.role === 'human' || el.dataset.role === 'user' ? 'user' : 'assistant',
        text: getSafeText(el),
      }));
    }

    // Strategy 4: universal — look for alternating content blocks in the main conversation area
    const conversationArea =
      document.querySelector('main') ||
      document.querySelector('[class*="conversation"]') ||
      document.querySelector('[role="main"]');
    if (conversationArea) {
      // Try to find any message-like containers
      turns = [
        ...conversationArea.querySelectorAll(
          '[class*="Message"], [class*="message"], [class*="Turn"], [class*="turn"], [class*="chat"]',
        ),
      ];
      if (turns.length >= 2) {
        console.log(`[Kairo Extractor] Claude: ${turns.length} turns (class pattern match)`);
        return turns
          .map((el) => ({
            role: detectRole(el),
            text: getSafeText(el),
          }))
          .filter((t) => t.text.length > 0);
      }

      // Absolute last resort: grab all substantial text blocks from the conversation area
      const allDivs = [...conversationArea.querySelectorAll(':scope > div > div')];
      const textBlocks = allDivs.filter((el) => getSafeText(el).length > 20);
      if (textBlocks.length >= 2) {
        console.log(`[Kairo Extractor] Claude: ${textBlocks.length} blocks (last resort)`);
        return textBlocks.map((el) => ({
          role: detectRole(el),
          text: getSafeText(el),
        }));
      }
    }

    // Final fallback: grab everything visible in the page
    console.warn('[Kairo Extractor] Claude: using full-page text fallback');
    const bodyText = getSafeText(document.body);
    if (bodyText.length > 50) {
      return [{ role: 'user', text: bodyText.slice(0, 8000) }];
    }

    return [];
  },
};
