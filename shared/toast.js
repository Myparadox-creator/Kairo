// shared/toast.js — Lightweight on-page toast for capture success/failure feedback.
// Rendered directly into the host page so it's visible regardless of whether the
// Kairo floating button/menu exists on this page — this is what fixes #99, since
// the keyboard shortcut and context-menu capture paths don't go through the menu.

const TOAST_CONTAINER_ID = 'kairo-toast-container';
const DISMISS_MS = 2600;

function ensureContainer() {
  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (container) return container;

  container = document.createElement('div');
  container.id = TOAST_CONTAINER_ID;
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    font-family: system-ui, -apple-system, sans-serif;
    pointer-events: none;
  `;
  document.body.appendChild(container);
  return container;
}

const VARIANTS = {
  success: { accent: '#22c55e', icon: '\u2713' },
  error: { accent: '#ef4444', icon: '\u2715' },
};

/**
 * Shows a brief on-page toast confirming capture succeeded or failed.
 * @param {'success'|'error'} status
 * @param {string} message
 */
export function showCaptureToast(status, message) {
  const variant = VARIANTS[status] || VARIANTS.success;
  const container = ensureContainer();

  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    background: #18181b;
    border: 1px solid ${variant.accent}55;
    border-left: 3px solid ${variant.accent};
    border-radius: 10px;
    padding: 10px 14px;
    color: #f4f4f5;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    pointer-events: auto;
    cursor: pointer;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    max-width: 320px;
  `;

  const icon = document.createElement('span');
  icon.textContent = variant.icon;
  icon.setAttribute('aria-hidden', 'true');
  icon.style.cssText = `color: ${variant.accent}; font-weight: 700; flex-shrink: 0;`;

  const text = document.createElement('span');
  text.textContent = message;
  text.style.cssText = 'overflow-wrap: anywhere;';

  toast.appendChild(icon);
  toast.appendChild(text);
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  let dismissed = false;
  const remove = () => {
    if (dismissed) return;
    dismissed = true;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => toast.remove(), 200);
  };

  toast.addEventListener('click', remove);
  setTimeout(remove, DISMISS_MS);
}
