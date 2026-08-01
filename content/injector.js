// content/injector.js — Injects the Kairo button next to chat inputs and handles the capture/inject menu

import { buildInjectionText, insertTextIntoEditor } from '../shared/inject.js';
import { showCaptureToast } from '../shared/toast.js';

let buttonWrapper = null;
let currentTextarea = null;
let settings = {};

chrome.storage.sync.get('kairo_settings', (res) => {
  if (res && res.kairo_settings) {
    settings = res.kairo_settings;
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.kairo_settings) {
    settings = changes.kairo_settings.newValue || {};
  }
});

const VIEWPORT_MARGIN = 12;
const BUTTON_SIZE = 32;
const MENU_WIDTH = 250;

export function injectButton(onCapture) {
  const existing = document.getElementById('kairo-container');
  if (existing) {
    existing.remove();
  }

  // Create a container for the button and menu
  const container = document.createElement('div');
  container.id = 'kairo-container';
  container.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    display: none;
    align-items: center;
    gap: 8px;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  // Capsule Logo Button
  const btn = document.createElement('button');
  btn.id = 'kairo-logo-btn';
  btn.setAttribute('aria-label', 'Kairo Options');
  const imgUrl = chrome.runtime.getURL('assets/capsule-logo.png');

  btn.style.cssText = `
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: url('${imgUrl}') center/cover no-repeat, linear-gradient(135deg, #6c47ff 0%, #8b6aff 100%);
    box-shadow: 0 4px 12px rgba(108, 71, 255, 0.4);
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;
  `;

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.1)';
    btn.style.boxShadow = '0 6px 16px rgba(108, 71, 255, 0.5)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 12px rgba(108, 71, 255, 0.4)';
  });

  // Menu Dropdown
  const menu = document.createElement('div');
  menu.style.cssText = `
    position: absolute;
    bottom: 40px;
    right: 0;
    background: rgba(30, 30, 35, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 6px;
    display: none;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    min-width: 140px;
    transform-origin: bottom right;
    animation: kairo-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  // Capture Option
  const captureOpt = document.createElement('button');
  captureOpt.id = 'kairo-capture-btn';
  captureOpt.textContent = 'Capture';
  styleMenuOption(captureOpt);

  // Inject Option
  const injectOpt = document.createElement('button');
  injectOpt.textContent = 'Inject';
  styleMenuOption(injectOpt);

  // Inject Modal (to pick capsule)
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: absolute;
    bottom: 80px;
    right: 0;
    background: rgba(24, 24, 28, 0.9);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 16px;
    display: none;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    width: 280px;
    max-height: 320px;
    overflow-y: auto;
    transform-origin: bottom right;
    animation: kairo-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  menu.appendChild(captureOpt);
  menu.appendChild(injectOpt);

  container.appendChild(menu);
  container.appendChild(modal);
  container.appendChild(btn);
  document.body.appendChild(container);

  buttonWrapper = container;

  // Toggle menu
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.style.display === 'flex') {
      menu.style.display = 'none';
      modal.style.display = 'none';
    } else {
      menu.style.display = 'flex';
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      menu.style.display = 'none';
      modal.style.display = 'none';
    }
  });

  // Shared capture routine — used by the menu AND the global trigger.
  let capturing = false;
  async function runCapture() {
    if (capturing) return;
    capturing = true;
    captureOpt.textContent = 'Capturing...';
    try {
      const success = await onCapture();
      if (success === false) {
        captureOpt.textContent = 'Capture';
        capturing = false;
        return; // user cancelled (e.g. dismissed the name prompt) — not a failure
      }
      captureOpt.textContent = 'Saved';
      showCaptureToast('success', 'Capsule saved');
    } catch (err) {
      captureOpt.textContent = 'Failed';
      showCaptureToast('error', err?.message ? `Capture failed: ${err.message}` : 'Capture failed');
      console.error('[Kairo] Capture error:', err);
    }
    setTimeout(() => {
      captureOpt.textContent = 'Capture';
      menu.style.display = 'none';
      capturing = false;
    }, 2000);
  }

  // Action: Capture
  captureOpt.addEventListener('click', runCapture);

  // Action: Inject
  injectOpt.addEventListener('click', async () => {
    menu.style.display = 'none';
    modal.style.display = 'flex';
    modal.innerHTML =
      '<div style="color:#aaa; font-size:12px; text-align:center;">Loading...</div>';

    chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (capsules) => {
      if (chrome.runtime.lastError) {
        console.error('[Kairo] GET_CAPSULES failed:', chrome.runtime.lastError.message);
        modal.innerHTML =
          '<div style="color:#aaa; font-size:12px; text-align:center;">Could not load capsules.</div>';
        return;
      }
      if (!capsules || capsules.length === 0) {
        modal.innerHTML =
          '<div style="color:#aaa; font-size:12px; text-align:center;">No capsules found.</div>';
        return;
      }

      modal.innerHTML =
        '<div style="color:#fff; font-size:13px; font-weight:600; margin-bottom:4px;">Select to Inject</div>';

      capsules.forEach((capsule) => {
        const item = document.createElement('div');
        item.textContent = capsule.title || 'Untitled Capsule';

        // Make draggable
        item.setAttribute('draggable', 'true');
        item.style.cssText = `
          padding: 10px 12px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: #eaeaf0;
          font-size: 13px;
          cursor: grab;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: background 0.2s, border-color 0.2s, opacity 0.2s;
          user-select: none;
          -webkit-user-drag: element;
        `;

        item.addEventListener('mouseenter', () => {
          item.style.background = 'rgba(255, 255, 255, 0.1)';
          item.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = 'rgba(255, 255, 255, 0.05)';
          item.style.borderColor = 'rgba(255, 255, 255, 0.05)';
        });

        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData(
            'text/plain',
            buildInjectionText(capsule, settings?.injectionTemplate),
          );
          item.style.opacity = '0.5';
          modal.style.opacity = '0.3';
        });

        item.addEventListener('dragend', () => {
          item.style.opacity = '1';
          modal.style.opacity = '1';
        });

        item.addEventListener('click', () => {
          injectText(
            buildInjectionText(capsule, settings?.injectionTemplate) || 'No content found.',
          );
          modal.style.display = 'none';
        });

        modal.appendChild(item);
      });
    });
  });

  // Start tracking the chat input area
  trackInputArea(menu, modal);

  // Expose the capture trigger for keyboard shortcut + context menu.
  // The service worker invokes this inside the content script isolated world.
  window.__kairoTriggerCapture = runCapture;
}

// Registers the global capture trigger used by the keyboard shortcut and the
// context menu, independent of the floating button. index.js calls this when the
// button is hidden so Ctrl+Shift+S and "Capture with Kairo" keep working (#50).
// When the button is shown, injectButton() installs its own button-aware trigger
// (with in-menu status feedback), which is the desired richer behavior.
export function registerCaptureTrigger(onCapture) {
  let capturing = false;
  window.__kairoTriggerCapture = async () => {
    if (capturing) return;
    capturing = true;
    try {
      const success = await onCapture();
      if (success !== false) {
        showCaptureToast('success', 'Capsule saved');
      }
    } catch (err) {
      console.error('[Kairo] Capture error:', err);
      showCaptureToast('error', err?.message ? `Capture failed: ${err.message}` : 'Capture failed');
    } finally {
      capturing = false;
    }
  };
}

function styleMenuOption(opt) {
  opt.style.cssText = `
    background: transparent;
    border: none;
    color: #eaeaf0;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
    text-align: left;
    transition: background 0.2s, color 0.2s;
  `;
  opt.addEventListener('mouseenter', () => {
    opt.style.background = '#6c47ff';
    opt.style.color = '#fff';
  });
  opt.addEventListener('mouseleave', () => {
    opt.style.background = 'transparent';
    opt.style.color = '#eaeaf0';
  });
}

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

function trackInputArea(menu, modal) {
  const findInput = () => {
    // Selectors for chat inputs across platforms
    const selectors = [
      '#prompt-textarea', // ChatGPT
      'textarea[data-id="root"]', // Claude fallback
      'div.ProseMirror', // Claude main
      'rich-textarea', // Gemini
      '#chat-input', // DeepSeek
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="ask" i]',
    ];

    for (const sel of selectors) {
      const el = querySelectorShadow(document, sel);
      if (el) return el;
    }
    return null;
  };

  let scheduled = false;
  let lastKey = '';
  let inputResizeObserver = null;

  const updatePosition = () => {
    // Reuse the cached input while it is still attached; only re-run the
    // selector sweep when it is missing or has been detached (e.g. SPA nav).
    let input = currentTextarea;
    if (!input || !document.contains(input)) {
      input = findInput();
    }

    if (input) {
      if (currentTextarea !== input) {
        currentTextarea = input;

        // Setup dropzone listeners on the input element
        input.addEventListener('dragover', (e) => {
          e.preventDefault();
          // Visual drop indicator: thin dashed purple outline (no layout shift)
          input.style.outline = '2px dashed #6c47ff';
          input.style.outlineOffset = '2px';
        });

        input.addEventListener('dragleave', () => {
          input.style.outline = '';
          input.style.outlineOffset = '';
        });

        input.addEventListener('drop', (e) => {
          e.preventDefault();
          input.style.outline = '';
          input.style.outlineOffset = '';
          const text = e.dataTransfer.getData('text/plain');
          if (text) {
            injectText(text);
          }
        });

        // Reposition when the input itself resizes (e.g. multi-line growth)
        if (inputResizeObserver) inputResizeObserver.disconnect();
        inputResizeObserver = new ResizeObserver(scheduleUpdate);
        inputResizeObserver.observe(input);
      }

      const rect = input.getBoundingClientRect();

      // Skip redundant style writes when the anchor has not moved.
      const key = `${Math.round(rect.right)}:${Math.round(rect.bottom)}`;
      if (key === lastKey && buttonWrapper.style.display === 'flex') return;
      lastKey = key;

      // Position just to the right of the input, slightly above the bottom
      buttonWrapper.style.display = 'flex';

      let left;
      let top;

      // Determine position based on platform
      if (location.hostname.includes('chatgpt.com')) {
        // Position outside the right side of the ChatGPT input bar
        // rect is the text area itself, which ends before the mic/send buttons.
        // Adding ~110px pushes it past those buttons to sit cleanly on the right.
        const isCanvasActive =
          document.querySelector(
            '[data-testid="canvas-container"], [class*="canvas-container"], div[class*="canvas"]',
          ) !== null;
        if (isCanvasActive) {
          left = rect.right - 10;
        } else {
          left = rect.right + 110;
        }
        top = rect.bottom - 48;
      } else if (location.hostname.includes('claude.ai')) {
        // Claude's ProseMirror editor is padded inside a card container.
        // We push it out by +24px to clear the outer card container border.
        left = rect.right + 24;
        top = rect.bottom - 7;
      } else if (location.hostname.includes('gemini.google.com')) {
        // Gemini's rich-textarea editor ends before the model dropdown and action buttons.
        // We push it out by +115px to sit cleanly outside on the right.
        left = rect.right + 162;
        top = rect.bottom - 32;
      } else if (location.hostname.includes('deepseek.com')) {
        // DeepSeek-specific position: push it outside on the right and offset upwards to not overlay send controls
        left = rect.right + 76;
        top = rect.bottom - 48;
      } else {
        // DeepSeek, etc.
        left = rect.right + 12;
        top = rect.bottom - 40;
      }

      placeFloatingUi(buttonWrapper, menu, modal, left, top);
    } else {
      // Fallback: bottom right (write once until the state changes)
      if (lastKey === 'fallback' && buttonWrapper.style.display === 'flex') return;
      lastKey = 'fallback';
      buttonWrapper.style.display = 'flex';
      buttonWrapper.style.left = 'auto';
      buttonWrapper.style.right = '20px';
      buttonWrapper.style.top = 'auto';
      buttonWrapper.style.bottom = '80px';
    }
  };

  // Coalesce every reposition trigger into a single animation frame.
  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      updatePosition();
    });
  }

  // Reposition only in response to real layout changes, not on every frame.
  window.addEventListener('scroll', scheduleUpdate, { passive: true, capture: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });

  // Catch the input being added, removed, or moved (incl. SPA navigation).
  const domObserver = new MutationObserver(scheduleUpdate);
  domObserver.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('beforeunload', () => {
    domObserver.disconnect();
    if (inputResizeObserver) {
      inputResizeObserver.disconnect();
    }
  });

  // Initial placement.
  scheduleUpdate();
}

function injectText(text) {
  if (currentTextarea) {
    // Editor-aware insertion that works across plain textareas and the rich
    // contenteditable editors used by Claude (ProseMirror) and Gemini, replacing
    // the deprecated document.execCommand('insertText') path that silently failed
    // on those platforms.
    //
    // Inject only: populate the input and leave the caret there so the user can
    // review, edit, or add to the context and press Send themselves (issue #29).
    insertTextIntoEditor(currentTextarea, text);
  } else {
    alert('Could not find an input box to inject into.');
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function placeFloatingUi(container, menu, modal, preferredLeft, preferredTop) {
  const maxLeft = window.innerWidth - BUTTON_SIZE - VIEWPORT_MARGIN;
  const maxTop = window.innerHeight - BUTTON_SIZE - VIEWPORT_MARGIN;
  const left = clamp(preferredLeft, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, maxLeft));
  const top = clamp(preferredTop, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, maxTop));
  const opensFromRight = left + MENU_WIDTH > window.innerWidth - VIEWPORT_MARGIN;

  container.style.left = `${left}px`;
  container.style.right = 'auto';
  container.style.top = `${top}px`;
  container.style.bottom = 'auto';

  menu.style.right = opensFromRight ? '0' : 'auto';
  menu.style.left = opensFromRight ? 'auto' : '0';
  modal.style.right = opensFromRight ? '0' : 'auto';
  modal.style.left = opensFromRight ? 'auto' : '0';
}

// Inject global animation styles if not already present
if (!document.getElementById('kairo-global-styles')) {
  const styles = document.createElement('style');
  styles.id = 'kairo-global-styles';
  styles.textContent = `
    @keyframes kairo-fade-in {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes kairo-shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-4px); }
      40%, 80% { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(styles);
}

export function promptCapsuleName() {
  return new Promise((resolve) => {
    // Create backdrop overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(9, 9, 11, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    // Create modal card
    const card = document.createElement('div');
    card.style.cssText = `
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      width: 380px;
      padding: 24px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
      color: #f4f4f5;
      display: flex;
      flex-direction: column;
      gap: 16px;
      animation: kairo-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: system-ui, -apple-system, sans-serif;
    `;

    // Header Title
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const icon = document.createElement('span');
    icon.textContent = 'K';
    icon.style.cssText = `
      font-size: 20px;
      background: linear-gradient(135deg, #6c47ff 0%, #8b6aff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Save Context Capsule';
    title.style.cssText = `
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #fff;
    `;

    header.appendChild(icon);
    header.appendChild(title);
    card.appendChild(header);

    // Label
    const desc = document.createElement('p');
    desc.textContent = 'Give this capsule a descriptive name to easily find and inject it later:';
    desc.style.cssText = `
      margin: 0;
      font-size: 13px;
      color: #a1a1aa;
      line-height: 1.5;
    `;
    card.appendChild(desc);

    // Input Field
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'e.g. NextJS Routing Issues, PhishGuard ML Pipeline';
    input.style.cssText = `
      background: #09090b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 10px 12px;
      color: #fff;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    `;
    input.addEventListener('focus', () => {
      input.style.borderColor = '#6c47ff';
      input.style.boxShadow = '0 0 0 2px rgba(108, 71, 255, 0.2)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = '#27272a';
      input.style.boxShadow = 'none';
    });
    card.appendChild(input);

    // Error Message
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
      color: #ef4444;
      font-size: 12px;
      display: none;
      margin-top: -8px;
    `;
    card.appendChild(errorMsg);

    // Action Buttons Row
    const actions = document.createElement('div');
    actions.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      background: transparent;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 8px 16px;
      color: #d4d4d8;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    `;
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = '#27272a';
      cancelBtn.style.color = '#fff';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'transparent';
      cancelBtn.style.color = '#d4d4d8';
    });

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Capsule';
    saveBtn.style.cssText = `
      background: linear-gradient(135deg, #6c47ff 0%, #8b6aff 100%);
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(108, 71, 255, 0.3);
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    saveBtn.addEventListener('mouseenter', () => {
      saveBtn.style.transform = 'translateY(-1px)';
      saveBtn.style.boxShadow = '0 6px 16px rgba(108, 71, 255, 0.4)';
    });
    saveBtn.addEventListener('mouseleave', () => {
      saveBtn.style.transform = 'none';
      saveBtn.style.boxShadow = '0 4px 12px rgba(108, 71, 255, 0.3)';
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    card.appendChild(actions);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Auto-focus input
    setTimeout(() => {
      overlay.style.opacity = '1';
      input.focus();
    }, 50);

    const closeModal = (val) => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(overlay);
        resolve(val);
      }, 200);
    };

    // Close logic
    cancelBtn.addEventListener('click', () => closeModal(null));

    // Save logic
    const handleSave = () => {
      const val = input.value.trim();
      if (!val) {
        // Shake animation and show error
        input.style.borderColor = '#ef4444';
        input.style.boxShadow = '0 0 0 2px rgba(239, 68, 68, 0.2)';
        input.style.animation = 'kairo-shake 0.3s ease';
        errorMsg.textContent = 'Capsule name is required.';
        errorMsg.style.display = 'block';

        setTimeout(() => {
          input.style.animation = 'none';
        }, 300);
        return;
      }
      closeModal(val);
    };

    saveBtn.addEventListener('click', handleSave);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleSave();
      } else if (e.key === 'Escape') {
        closeModal(null);
      }
    });
  });
}

export function promptDuplicateAction({ existingCapsule, newTurnCount }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(9, 9, 11, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      width: 420px;
      padding: 24px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
      color: #f4f4f5;
      display: flex;
      flex-direction: column;
      gap: 16px;
      animation: kairo-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: system-ui, -apple-system, sans-serif;
    `;

    const header = document.createElement('div');
    header.style.cssText = `display: flex; align-items: center; gap: 8px;`;

    const icon = document.createElement('span');
    icon.textContent = '🔄';
    icon.style.cssText = `font-size: 18px;`;

    const title = document.createElement('h3');
    title.textContent = 'Existing Capsule Detected';
    title.style.cssText = `margin: 0; font-size: 16px; font-weight: 600; color: #fff;`;

    header.appendChild(icon);
    header.appendChild(title);
    card.appendChild(header);

    const prevTurnCount = existingCapsule.content?.rawTurns?.length || 0;
    const desc = document.createElement('p');
    desc.style.cssText = `margin: 0; font-size: 13px; color: #a1a1aa; line-height: 1.5;`;
    desc.innerHTML = `A capsule for this thread already exists: <strong style="color:#fff;">${existingCapsule.title || 'Untitled'}</strong> (${prevTurnCount} turns). This page now has <strong style="color:#8b6aff;">${newTurnCount} turns</strong>. How would you like to proceed?`;
    card.appendChild(desc);

    const actionsContainer = document.createElement('div');
    actionsContainer.style.cssText = `display: flex; flex-direction: column; gap: 8px; margin-top: 4px;`;

    const closeModal = (val) => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(val);
      }, 200);
    };

    // Option 1: Merge / Update Existing
    const mergeBtn = document.createElement('button');
    mergeBtn.textContent = 'Merge & Update Existing Capsule';
    mergeBtn.style.cssText = `
      background: linear-gradient(135deg, #6c47ff 0%, #8b6aff 100%);
      border: none;
      border-radius: 8px;
      padding: 10px 16px;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(108, 71, 255, 0.3);
      transition: transform 0.2s, box-shadow 0.2s;
      text-align: center;
    `;
    mergeBtn.addEventListener('click', () =>
      closeModal({ action: 'merge', title: existingCapsule.title }),
    );

    // Option 2: Update & Re-enrich
    const enrichBtn = document.createElement('button');
    enrichBtn.textContent = 'Update & Re-enrich Summary';
    enrichBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 10px 16px;
      color: #eaeaf0;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
      text-align: center;
    `;
    enrichBtn.addEventListener('click', () =>
      closeModal({ action: 'merge', title: existingCapsule.title, enrich: true }),
    );

    // Option 3: Save as New Copy
    const newCopyBtn = document.createElement('button');
    newCopyBtn.textContent = 'Save as New Copy';
    newCopyBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 10px 16px;
      color: #eaeaf0;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
      text-align: center;
    `;
    newCopyBtn.addEventListener('click', () => closeModal({ action: 'new' }));

    // Option 4: Cancel
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      background: transparent;
      border: none;
      padding: 8px 16px;
      color: #a1a1aa;
      font-size: 12px;
      cursor: pointer;
      transition: color 0.2s;
      text-align: center;
    `;
    cancelBtn.addEventListener('click', () => closeModal(null));

    actionsContainer.appendChild(mergeBtn);
    actionsContainer.appendChild(enrichBtn);
    actionsContainer.appendChild(newCopyBtn);
    actionsContainer.appendChild(cancelBtn);
    card.appendChild(actionsContainer);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.style.opacity = '1';
    }, 50);
  });
}
