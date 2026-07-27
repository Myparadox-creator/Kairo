// content/extractors/deepseek.js — DeepSeek DOM extractor
// Selectors verified: May 2026

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

function processDeepSeekTurn(role, el) {
  let text = el.innerText.trim();
  let reasoning = '';
  if (role === 'assistant') {
    const thinkEl = el.querySelector(
      'div[class*="think"], div[class*="thought"], think, .ds-think',
    );
    if (thinkEl) {
      reasoning = thinkEl.innerText.trim();
      text = text.replace(reasoning, '').trim();
    }
  }
  return { role, text, reasoning };
}

export default {
  platform: 'deepseek',

  extract() {
    let turns;

    // Strategy 1: chat-message class
    turns = [...document.querySelectorAll('.chat-message')];
    if (turns.length) {
      console.log(`[Kairo Extractor] DeepSeek: ${turns.length} turns (chat-message)`);
      return turns
        .map((el) => {
          const role = el.classList.contains('user') ? 'user' : 'assistant';
          return processDeepSeekTurn(role, el);
        })
        .filter((t) => t.text.length > 0 || t.reasoning?.length > 0);
    }

    // Strategy 2: data-role attributes
    turns = [...document.querySelectorAll('[data-role]')];
    if (turns.length) {
      console.log(`[Kairo Extractor] DeepSeek: ${turns.length} turns (data-role)`);
      return turns
        .map((el) => {
          const role = el.dataset.role === 'user' ? 'user' : 'assistant';
          return processDeepSeekTurn(role, el);
        })
        .filter((t) => t.text.length > 0 || t.reasoning?.length > 0);
    }

    // Strategy 3: message class patterns
    turns = [
      ...document.querySelectorAll(
        '[class*="ChatMessage"], [class*="chat-message"], [class*="Message"]',
      ),
    ];
    if (turns.length) {
      console.log(`[Kairo Extractor] DeepSeek: ${turns.length} turns (ChatMessage class)`);
      return turns
        .map((el) => {
          const classStr = el.classList.toString().toLowerCase();
          const isUser = classStr.includes('user') || el.querySelector('[class*="user"]') !== null;
          const role = isUser ? 'user' : 'assistant';
          return processDeepSeekTurn(role, el);
        })
        .filter((t) => t.text.length > 0 || t.reasoning?.length > 0);
    }

    // Strategy 4: general conversation area
    const mainArea =
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.querySelector('[class*="chat"]');
    if (mainArea) {
      turns = [...mainArea.querySelectorAll('[class*="message"], [class*="turn"], .markdown')];
      if (turns.length >= 2) {
        console.log(`[Kairo Extractor] DeepSeek: ${turns.length} turns (generic)`);
        return turns
          .map((el) => {
            const role = detectRole(el);
            return processDeepSeekTurn(role, el);
          })
          .filter((t) => t.text.length > 0 || t.reasoning?.length > 0);
      }
    }

    // Final fallback
    console.warn('[Kairo Extractor] DeepSeek: using full-page text fallback');
    const bodyText = document.body.innerText.trim();
    if (bodyText.length > 50) {
      return [{ role: 'user', text: bodyText.slice(0, 8000), reasoning: '' }];
    }

    return [];
  },
};
