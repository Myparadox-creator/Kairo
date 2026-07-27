// shared/inject.js — Single source of truth for the text injected into a chat input.

/**
 * Build the context text to inject from a capsule.
 *
 * Prefers the structured, enriched summary (with goals, stack, and key
 * decisions) and falls back to the raw captured snippet when no summary is
 * present. Used by both the popup and the in-page floating menu so that every
 * inject entry point produces an identical payload for a given capsule.
 *
 * @param {Object} capsule
 * @returns {string}
 */
export function buildInjectionText(capsule, template, options = {}) {
  const content = (capsule && capsule.content) || {};
  const dateStr = capsule.capturedAt ? new Date(capsule.capturedAt).toLocaleString() : '';
  const platformStr = capsule.source ? capsule.source.toUpperCase() : '';
  const turnsCount = content.rawTurns ? content.rawTurns.length : 0;

  let textText = '';
  if (content.summary) {
    const goals = (content.goals || []).join(', ');
    const stack = (content.stack || []).join(', ');
    const keyDecisions = (content.keyDecisions || []).join(', ');
    const constraints = (content.constraints || []).join(', ');

    if (template && template.trim()) {
      let text = template;
      text = text.replace(/{title}/g, capsule.title || 'Untitled');
      text = text.replace(/{summary}/g, content.summary || '');
      text = text.replace(/{goals}/g, goals || '');
      text = text.replace(/{stack}/g, stack || '');
      text = text.replace(/{keyDecisions}/g, keyDecisions || '');
      text = text.replace(/{constraints}/g, constraints || '');
      text = text.replace(/{date}/g, dateStr);
      text = text.replace(/{platform}/g, platformStr);
      text = text.replace(/{turns}/g, turnsCount.toString());
      textText = text;
    } else {
      textText = `[Context from Kairo]\n\n${content.summary}\n\nGoals: ${goals}\n\nStack: ${stack}\n\nKey Decisions: ${keyDecisions}`;
    }
  } else {
    textText = content.rawSnippet || '';
  }

  if (options.includeReasoning && capsule.meta?.reasoning) {
    textText += `\n\n[Thinking Process]\n${capsule.meta.reasoning}`;
  }

  return textText;
}

/**
 * Insert text into a chat composer, picking a strategy based on the editor type.
 *
 * Replaces `document.execCommand('insertText', ...)`, which is deprecated and
 * silently fails on the modern rich-text editors used by Claude (ProseMirror)
 * and Gemini (rich-textarea). The text is appended at the caret/end so existing
 * input is preserved.
 *
 * Strategy:
 *  - Native <textarea>/<input> (e.g. DeepSeek): write through the prototype
 *    `value` setter React/Vue track, then dispatch a real InputEvent.
 *  - contenteditable (Claude/Gemini/ChatGPT): try, in order, a genuine
 *    `beforeinput`, a synthetic `paste`, then a manual Range insertion followed
 *    by `input`, then a final legacy `execCommand` fallback — stopping at the
 *    first strategy that actually changes the content.
 *
 * Inserts text only; it never submits the message.
 *
 * NOTE: a self-contained copy of this algorithm is mirrored inside the
 * `INJECT_CONTEXT` handler in background/service-worker.js, because that handler
 * is serialized into the page via chrome.scripting.executeScript and cannot
 * import modules. Keep the two in sync.
 *
 * @param {Element} el   The composer element (textarea, input, or contenteditable host).
 * @param {string}  text The text to insert.
 * @returns {boolean} true if an insertion strategy ran, false if there was nothing to do.
 */
export function insertTextIntoEditor(el, text) {
  if (!el || !text) return false;

  el.focus();

  const tag = el.tagName;

  // --- Native <textarea> / <input> ----------------------------------------
  if (tag === 'TEXTAREA' || tag === 'INPUT') {
    const proto =
      tag === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const next = el.value ? `${el.value}\n\n${text}` : text;
    if (desc && desc.set) desc.set.call(el, next);
    else el.value = next;
    el.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
    );
    return true;
  }

  // --- Rich contenteditable (Claude ProseMirror, Gemini, ChatGPT) ----------
  const editable = el.isContentEditable
    ? el
    : (el.querySelector && el.querySelector('[contenteditable="true"], .ProseMirror')) || el;

  if (editable.focus) editable.focus();
  moveCaretToEnd(editable);

  const start = editable.textContent;
  const changed = () => editable.textContent !== start;

  // 1) Genuine beforeinput — ProseMirror/Lexical apply it via their own model.
  const beforeInput = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: text,
  });
  // dispatchEvent returns false when the editor calls preventDefault (i.e. it
  // is handling the insertion itself).
  const handledByEditor = !editable.dispatchEvent(beforeInput);
  if (handledByEditor || changed()) return true;

  // 2) Synthetic paste — editors with a clipboard handler take the plain text.
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    editable.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }),
    );
  } catch (_) {
    /* ClipboardEvent not constructable in this engine — fall through */
  }
  if (changed()) return true;

  // 3) Insert at the caret ourselves, then fire input so the editor syncs from
  //    the DOM mutation.
  insertTextAtCaret(editable, text);
  editable.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
  );
  if (changed()) return true;

  // 4) Legacy last resort.
  try {
    document.execCommand('insertText', false, text);
  } catch (_) {
    /* deprecated and may throw — nothing more we can do */
  }
  return true;
}

/** Collapse the selection to the end of `node`'s contents. */
function moveCaretToEnd(node) {
  const sel = window.getSelection && window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Insert `text` at the current caret, preserving newlines as <br>. */
function insertTextAtCaret(editable, text) {
  const sel = window.getSelection && window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const parts = String(text).split('\n');
    const frag = document.createDocumentFragment();
    parts.forEach((part, i) => {
      if (i > 0) frag.appendChild(document.createElement('br'));
      frag.appendChild(document.createTextNode(part));
    });
    range.insertNode(frag);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    editable.textContent = (editable.textContent || '') + text;
  }
}
