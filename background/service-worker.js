// background/service-worker.js — Central hub for Kairo extension
// Handles: messaging, storage ops, enrichment, keyboard shortcuts, context menus

import {
  saveCapsule,
  getCapsules,
  deleteCapsule,
  deleteCapsules,
  updateCapsule,
  getSettings,
  saveSettings,
  clearAllCapsules,
  compactDatabase,
  findCapsuleByThread,
} from '../shared/storage.js';
import { validateCapsule } from '../shared/capsule.js';
import { getSupportedMatchPatterns } from '../shared/platforms.js';
import { enrichCapsule } from './enricher.js';

// ─── Message Listener ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[msg.type];
  if (handler) {
    handler(msg, sender)
      .then((result) => {
        sendResponse(result);
      })
      .catch((err) => {
        console.error(`[Kairo SW] Error handling ${msg.type}:`, err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // keep channel open for async response
  }
  return false;
});

const MESSAGE_HANDLERS = {
  async SAVE_CAPSULE(msg) {
    return handleSave(msg.capsule, msg.options);
  },

  async COMPACT_DATABASE() {
    return compactDatabase();
  },

  async FIND_THREAD_CAPSULE(msg) {
    return findCapsuleByThread(msg.threadId, msg.url, { turns: msg.turns, source: msg.source });
  },

  async MERGE_CAPSULE(msg) {
    const capsules = await getCapsules();
    let existing = msg.id ? capsules.find(c => c.id === msg.id) : null;
    if (!existing) {
      existing = await findCapsuleByThread(msg.threadId, msg.url, { turns: msg.turns, source: msg.source });
    }

    if (!existing) {
      return { success: false, error: 'Target capsule not found for merging' };
    }

    const updates = {
      content: {
        ...existing.content,
        rawTurns: msg.turns,
        rawSnippet: msg.snippet,
      },
      url: msg.url || existing.url,
      threadId: msg.threadId || existing.threadId,
      updatedAt: Date.now(),
    };

    if (msg.title) {
      updates.title = msg.title;
    }

    let updatedCapsule = { ...existing, ...updates };

    if (msg.options?.enrich) {
      try {
        updatedCapsule = await enrichCapsule(updatedCapsule);
      } catch (enrichErr) {
        console.warn('[Kairo SW] Re-enrichment on merge failed:', enrichErr);
      }
    }

    const res = await saveCapsule(updatedCapsule);
    if (!res.success) return res;

    try {
      chrome.notifications.create(`kairo-merged-${updatedCapsule.id.slice(0, 8)}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
        title: 'Kairo — Context Updated!',
        message: `Updated capsule "${updatedCapsule.title || 'Untitled'}" (${msg.turns?.length || 0} turns).`,
      });
    } catch (notifErr) {
      console.warn('[Kairo SW] Notification failed:', notifErr);
    }

    return { success: true, capsule: updatedCapsule };
  },

  async GET_CAPSULES() {
    return getCapsules();
  },

  async DELETE_CAPSULE(msg) {
    return deleteCapsule(msg.id);
  },

  async DELETE_CAPSULES(msg) {
    return deleteCapsules(msg.ids);
  },

  async UPDATE_CAPSULE(msg) {
    return updateCapsule(msg.id, msg.updates);
  },

  async ENRICH_CAPSULE(msg) {
    const capsules = await getCapsules();
    const capsule = capsules.find((c) => c.id === msg.id);
    if (!capsule) return { success: false, error: 'Capsule not found' };

    const enriched = await enrichCapsule(capsule);
    await saveCapsule(enriched);
    return { success: true, capsule: enriched };
  },

  async GET_SETTINGS() {
    return getSettings();
  },

  async SAVE_SETTINGS(msg) {
    return saveSettings(msg.settings);
  },

  async CLEAR_ALL() {
    return clearAllCapsules();
  },

  async EXPORT_TO_NOTION(msg) {
    try {
      const settings = await getSettings();
      if (!settings.notionToken || !settings.notionDbId) {
        return { success: false, error: 'Notion Integration is not configured in settings.' };
      }

      const capsules = await getCapsules();
      const capsule = capsules.find((c) => c.id === msg.id);
      if (!capsule) {
        return { success: false, error: 'Capsule not found' };
      }

      const children = [];

      if (capsule.content?.summary) {
        children.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: 'Summary' } }],
          },
        });
        children.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: capsule.content.summary.slice(0, 2000) } },
            ],
          },
        });
      }

      if (capsule.content?.stack && capsule.content.stack.length > 0) {
        children.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: 'Tech Stack' } }],
          },
        });
        capsule.content.stack.forEach((tech) => {
          children.push({
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
              rich_text: [{ type: 'text', text: { content: tech.slice(0, 2000) } }],
            },
          });
        });
      }

      if (capsule.content?.goals && capsule.content.goals.length > 0) {
        children.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: 'Goals' } }],
          },
        });
        capsule.content.goals.forEach((goal) => {
          children.push({
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
              rich_text: [{ type: 'text', text: { content: goal.slice(0, 2000) } }],
            },
          });
        });
      }

      if (capsule.content?.keyDecisions && capsule.content.keyDecisions.length > 0) {
        children.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: 'Key Decisions' } }],
          },
        });
        capsule.content.keyDecisions.forEach((decision) => {
          children.push({
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
              rich_text: [{ type: 'text', text: { content: decision.slice(0, 2000) } }],
            },
          });
        });
      }

      if (capsule.url) {
        children.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: 'Source URL' } }],
          },
        });
        children.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: capsule.url.slice(0, 2000),
                  link: { url: capsule.url.slice(0, 2000) },
                },
              },
            ],
          },
        });
      }

      const titleProp = [
        {
          text: {
            content: (capsule.title || 'Untitled Capsule').slice(0, 2000),
          },
        },
      ];

      const payload = {
        parent: { database_id: settings.notionDbId },
        properties: {
          Name: {
            title: titleProp,
          },
        },
        children,
      };

      let res = null;
      let fallbackRes = null;
      try {
        res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${settings.notionToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json();
          if (errData?.code === 'validation_error') {
            payload.properties = {
              title: {
                title: titleProp,
              },
            };
            fallbackRes = await fetch('https://api.notion.com/v1/pages', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${settings.notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
              },
              body: JSON.stringify(payload),
            });
            if (!fallbackRes.ok) {
              const fbErr = await fallbackRes.json();
              return { success: false, error: fbErr?.message || fallbackRes.statusText };
            }
            return { success: true };
          }
          return { success: false, error: errData?.message || res.statusText };
        }

        return { success: true };
      } finally {
        res = null;
        fallbackRes = null;
      }
    } catch (err) {
      console.error('[Kairo SW] Notion export error:', err);
      return { success: false, error: err.message };
    }
  },

  async INJECT_CONTEXT(msg) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false, error: 'No active tab' };

      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        // Self-contained mirror of insertTextIntoEditor() in shared/inject.js.
        // chrome.scripting.executeScript serializes this function and runs it in
        // the page, so it cannot import modules — keep this algorithm in sync
        // with the shared helper. Inserts only; never submits.
        func: (contextText) => {
          if (!contextText) return false;

          function querySelectorShadow(root, selector) {
            const found = root.querySelector(selector);
            if (found) return found;

            const elements = root.querySelectorAll('*');
            for (const el of elements) {
              if (el.shadowRoot) {
                const inner = querySelectorShadow(el.shadowRoot, selector);
                if (inner) return inner;
              }
            }
            return null;
          }

          const selectors = [
            'div[contenteditable="true"]',
            '#prompt-textarea',
            'textarea[data-id="root"]',
            'rich-textarea',
            'textarea',
          ];
          let el = null;
          for (const sel of selectors) {
            el = querySelectorShadow(document, sel);
            if (el) break;
          }
          if (!el) return false;

          el.focus();

          const tag = el.tagName;

          // Native <textarea> / <input>: prototype value setter + InputEvent.
          if (tag === 'TEXTAREA' || tag === 'INPUT') {
            const proto =
              tag === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
            const next = el.value ? `${el.value}\n\n${contextText}` : contextText;
            if (desc && desc.set) desc.set.call(el, next);
            else el.value = next;
            el.dispatchEvent(
              new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: contextText,
              }),
            );
            return true;
          }

          // Rich contenteditable (Claude ProseMirror, Gemini, ChatGPT).
          const editable = el.isContentEditable
            ? el
            : el.querySelector('[contenteditable="true"], .ProseMirror') || el;
          if (editable.focus) editable.focus();

          const moveCaretToEnd = (node) => {
            const sel = window.getSelection && window.getSelection();
            if (!sel) return;
            const range = document.createRange();
            range.selectNodeContents(node);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          };
          const insertAtCaret = (node, text) => {
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
              node.textContent = (node.textContent || '') + text;
            }
          };

          moveCaretToEnd(editable);
          const start = editable.textContent;
          const changed = () => editable.textContent !== start;

          const handledByEditor = !editable.dispatchEvent(
            new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: contextText,
            }),
          );
          if (handledByEditor || changed()) return true;

          try {
            const dt = new DataTransfer();
            dt.setData('text/plain', contextText);
            editable.dispatchEvent(
              new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }),
            );
          } catch (_) {
            /* ClipboardEvent not constructable in this engine */
          }
          if (changed()) return true;

          insertAtCaret(editable, contextText);
          editable.dispatchEvent(
            new InputEvent('input', { bubbles: true, inputType: 'insertText', data: contextText }),
          );
          if (changed()) return true;

          try {
            document.execCommand('insertText', false, contextText);
          } catch (_) {
            /* deprecated legacy fallback */
          }
          return true;
        },
        args: [msg.contextText],
      });

      if (injection && injection.result === false) {
        return { success: false, error: 'No chat input found on the page' };
      }
      return { success: true };
    } catch (err) {
      console.error('[Kairo SW] Inject error:', err);
      return { success: false, error: err.message };
    }
  },
};

// ─── Save Handler with Optional Enrichment ────────────────────────
async function handleSave(capsule, options = {}) {
  try {
    // Validate before saving
    const validation = validateCapsule(capsule);
    if (!validation.valid) {
      console.error('[Kairo SW] Invalid capsule:', validation.errors);
      return { success: false, errors: validation.errors };
    }

    // Auto-enrich if requested (non-blocking — don't fail save if enrichment fails)
    if (options.enrich) {
      try {
        capsule = await enrichCapsule(capsule);
      } catch (enrichErr) {
        console.warn('[Kairo SW] Enrichment failed, saving raw capsule:', enrichErr);
      }
    }

    const saveResult = await saveCapsule(capsule);
    if (!saveResult?.success) {
      return { success: false, error: saveResult?.error || 'Storage write failed' };
    }

    // Show notification — fire-and-forget, must NOT block success response
    try {
      chrome.notifications.create(`kairo-saved-${capsule.id.slice(0, 8)}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
        title: 'Kairo — Context Saved!',
        message: capsule.title || 'Capsule captured successfully.',
      });
    } catch (notifErr) {
      // Notification failure should never prevent a successful save
      console.warn('[Kairo SW] Notification failed (non-critical):', notifErr);
    }

    return { success: true, capsule };
  } catch (err) {
    console.error('[Kairo SW] Save error:', err);
    return { success: false, error: err.message };
  }
}

// ─── Keyboard Shortcut: Command listeners ──────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-kairo') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: () => window.__kairoTriggerCapture?.(),
        })
        .catch((err) => {
          console.error('[Kairo SW] Shortcut trigger error:', err);
        });
    });
  } else if (command === 'toggle-floating-btn') {
    chrome.storage.sync.get('kairo_settings', (res) => {
      const settings = (res && res.kairo_settings) || {};
      settings.showFloatingButton = settings.showFloatingButton !== false ? false : true;
      chrome.storage.sync.set({ kairo_settings: settings }, () => {
        console.log('[Kairo SW] showFloatingButton toggled to:', settings.showFloatingButton);
      });
    });
  }
});

// ─── Context Menu ─────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'kairo-capture',
    title: 'Capture with Kairo',
    contexts: ['page'],
    documentUrlPatterns: getSupportedMatchPatterns(),
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kairo-capture' && tab?.id) {
    if (
      !tab.url ||
      tab.url.startsWith('chrome:') ||
      tab.url.startsWith('file:') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge:')
    ) {
      console.warn('[Kairo SW] Context menu capture skipped: unsupported URL protocol', tab.url);
      return;
    }
    chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: () => window.__kairoTriggerCapture?.(),
      })
      .catch((err) => {
        console.error('[Kairo SW] Context menu trigger error:', err);
      });
  }
});

// Copy text to clipboard in background page/active tab
async function copyToClipboard(tabId, text) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (txt) => {
        const textarea = document.createElement('textarea');
        textarea.value = txt;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      },
      args: [text],
    });
    return true;
  } catch (err) {
    console.error('[Kairo SW] Failed to copy to clipboard via script execution:', err);
    return false;
  }
}

// ─── Omnibox Search & Copy ────────────────────────────────────────
chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  try {
    const capsules = await getCapsules();
    const query = text.trim().toLowerCase();
    const filtered = capsules
      .filter(
        (c) =>
          (c.title || '').toLowerCase().includes(query) ||
          (c.content?.summary || '').toLowerCase().includes(query),
      )
      .slice(0, 5);

    const suggestions = filtered.map((c) => ({
      content: c.id,
      description: `Kairo: ${c.title || 'Untitled'} - ${c.content?.summary?.slice(0, 50) || 'no summary'}`,
    }));

    suggest(suggestions);
  } catch (err) {
    console.error('[Kairo SW] Omnibox error:', err);
  }
});

chrome.omnibox.onInputEntered.addListener(async (text) => {
  try {
    const capsules = await getCapsules();
    let capsule = capsules.find((c) => c.id === text);
    if (!capsule && text) {
      // Fallback: prefix match
      capsule = capsules.find((c) => (c.title || '').toLowerCase().includes(text.toLowerCase()));
    }
    if (!capsule) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const settings = await getSettings();
    const template = settings?.injectionTemplate;

    let formattedText = '';
    if (capsule.content?.summary) {
      const goals = (capsule.content.goals || []).join(', ');
      const stack = (capsule.content.stack || []).join(', ');
      const keyDecisions = (capsule.content.keyDecisions || []).join(', ');
      const constraints = (capsule.content.constraints || []).join(', ');

      if (template && template.trim()) {
        let txt = template;
        txt = txt.replace(/{title}/g, capsule.title || 'Untitled');
        txt = txt.replace(/{summary}/g, capsule.content.summary || '');
        txt = txt.replace(/{goals}/g, goals || '');
        txt = txt.replace(/{stack}/g, stack || '');
        txt = txt.replace(/{keyDecisions}/g, keyDecisions || '');
        txt = txt.replace(/{constraints}/g, constraints || '');
        formattedText = txt;
      } else {
        formattedText = `[Context from Kairo]\n\n${capsule.content.summary}\n\nGoals: ${goals}\n\nStack: ${stack}\n\nKey Decisions: ${keyDecisions}`;
      }
    } else {
      formattedText = capsule.content?.rawSnippet || '';
    }

    const success = await copyToClipboard(tab.id, formattedText);
    if (success) {
      chrome.notifications.create('kairo-omnibox-copied', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/brand-logo.png'),
        title: 'Kairo Context Copied',
        message: `Successfully copied context from "${capsule.title || 'Untitled'}"`,
      });
    }
  } catch (err) {
    console.error('[Kairo SW] Omnibox input entered failed:', err);
  }
});

// Auto-compact and merge duplicates on initialization
compactDatabase().catch((err) => {
  console.warn('[Kairo SW] Initial DB compaction skipped:', err);
});

console.log('[Kairo SW] Service worker initialized');
