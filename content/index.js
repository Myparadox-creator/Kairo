// content/index.js — Entry point: detects platform, loads extractor, injects capture button

import { getExtractor } from './extractors/index.js';
import {
  injectButton,
  promptCapsuleName,
  promptDuplicateAction,
  registerCaptureTrigger,
} from './injector.js';
import { createCapsule } from '../shared/capsule.js';
import { extractThreadId, hasUserTurnOverlap, hasTurnOverlap } from '../shared/utils.js';

(async function init() {
  if (window !== window.top) return;
  try {
    const extractor = getExtractor(location.hostname);

    if (!extractor) {
      console.log('[Kairo] Unsupported platform:', location.hostname);
      return;
    }

    console.log(`[Kairo] Detected platform: ${extractor.platform}`);

    // ─── Tab-scoped Capsule ID Tracking ─────────────────────────
    let _inMemoryCapsuleId = null;

    function getTabCapsuleId() {
      if (_inMemoryCapsuleId) return _inMemoryCapsuleId;
      try {
        const fromDom = document.documentElement.getAttribute('data-kairo-capsule-id');
        if (fromDom) {
          _inMemoryCapsuleId = fromDom;
          return fromDom;
        }
      } catch (e) {}
      try {
        const fromSession = sessionStorage.getItem('kairo_active_capsule_id');
        if (fromSession) {
          _inMemoryCapsuleId = fromSession;
          return fromSession;
        }
      } catch (e) {}
      return null;
    }

    function setTabCapsuleId(id) {
      if (!id) return;
      _inMemoryCapsuleId = id;
      try {
        document.documentElement.setAttribute('data-kairo-capsule-id', id);
      } catch (e) {}
      try {
        sessionStorage.setItem('kairo_active_capsule_id', id);
      } catch (e) {}
    }

    // Check settings (graceful fallback)
    let autoEnrich = false;
    let showButton = true;
    try {
      const settings = await chrome.storage.sync.get('kairo_settings');
      showButton = settings.kairo_settings?.showFloatingButton !== false;
      autoEnrich = settings.kairo_settings?.autoEnrich === true;
    } catch (settingsErr) {
      console.warn('[Kairo] Could not read settings, using defaults:', settingsErr);
    }

    const captureHandler = async () => {
      // STEP 1: Extract turns from DOM first
      console.log('[Kairo] Step 1: Extracting turns...');
      let turns;
      try {
        turns = extractor.extract();
        console.log(`[Kairo] Step 1 result: ${turns?.length || 0} turns extracted`);
      } catch (extractErr) {
        console.error('[Kairo] Step 1 FAILED - extractor error:', extractErr);
        const bodyText = document.body?.innerText?.trim() || '';
        if (bodyText.length > 50) {
          turns = [{ role: 'user', text: bodyText.slice(0, 8000) }];
          console.log('[Kairo] Step 1 recovery: using body text fallback');
        } else {
          throw new Error('Extractor failed: ' + (extractErr.message || 'unknown'));
        }
      }

      if (!turns || !turns.length) {
        throw new Error('No conversation turns found on this page');
      }

      // STEP 2: Build safe turns & snippet
      console.log('[Kairo] Step 2: Preparing turns payload...');

      const MAX_TURNS = 30;
      const MAX_TURN_TEXT = 3000;
      const safeTurns = turns
        .slice(-MAX_TURNS) // keep most recent turns
        .map((t) => ({
          role: t.role,
          text: t.text.slice(0, MAX_TURN_TEXT),
          reasoning: t.reasoning ? t.reasoning.slice(0, MAX_TURN_TEXT) : undefined,
        }));

      console.log(`[Kairo] Step 2: using ${safeTurns.length} turns (capped from ${turns.length})`);
      const snippet = safeTurns.map((t) => `[${t.role}]: ${t.text}`).join('\n\n');
      const reasoningText = safeTurns
        .map((t) => t.reasoning)
        .filter(Boolean)
        .join('\n\n');

      const currentThreadId = extractThreadId(location.href);
      let existingCapsule = null;

      // ─── Find existing capsule for THIS specific chat thread ───────────
      // Layer A: Check pinned tab capsule ID AND verify it actually matches current chat content
      const pinnedId = getTabCapsuleId();
      if (pinnedId) {
        console.log(`[Kairo] Checking pinned capsule ID: ${pinnedId}`);
        try {
          const capsules = await chrome.runtime.sendMessage({ type: 'GET_CAPSULES' });
          if (Array.isArray(capsules)) {
            const found = capsules.find((c) => c.id === pinnedId);
            if (found) {
              const storedTurns = found.content?.rawTurns || [];
              // Ensure the pinned capsule actually belongs to the active conversation content
              if (
                hasUserTurnOverlap(storedTurns, safeTurns) ||
                hasTurnOverlap(storedTurns, safeTurns)
              ) {
                existingCapsule = found;
                console.log(`[Kairo] Found matching pinned capsule: "${existingCapsule.title}"`);
              } else {
                console.log(
                  `[Kairo] Pinned capsule "${found.title}" does not match active chat content (user switched chats in sidebar)`,
                );
              }
            }
          }
        } catch (e) {
          console.warn('[Kairo] Pinned capsule lookup failed:', e);
        }
      }

      // Layer B: Search storage by threadId / content match
      if (!existingCapsule) {
        console.log('[Kairo] Searching storage for matching thread capsule...');
        try {
          existingCapsule = await chrome.runtime.sendMessage({
            type: 'FIND_THREAD_CAPSULE',
            threadId: currentThreadId,
            url: location.href,
            source: extractor.platform,
            turns: safeTurns,
          });
          if (existingCapsule) {
            console.log(
              `[Kairo] Found existing capsule by content match: "${existingCapsule.title}" (${existingCapsule.id})`,
            );
          }
        } catch (findErr) {
          console.warn('[Kairo] Could not check for existing thread capsule:', findErr);
        }
      }

      let result;

      // ─── MERGE PATH: Existing capsule for THIS chat found ───────────────
      if (existingCapsule) {
        console.log(
          `[Kairo] Merging turns into existing capsule for this chat: ${existingCapsule.id} ("${existingCapsule.title}")`,
        );
        try {
          result = await chrome.runtime.sendMessage({
            type: 'MERGE_CAPSULE',
            id: existingCapsule.id,
            threadId: currentThreadId,
            url: location.href,
            source: extractor.platform,
            turns: safeTurns,
            snippet: snippet.slice(-4000),
            title: existingCapsule.title,
            options: { enrich: autoEnrich },
          });
        } catch (msgErr) {
          console.error('[Kairo] Merge message FAILED:', msgErr);
          throw new Error('Service worker unreachable: ' + (msgErr.message || 'unknown'));
        }

        if (result && result.success) {
          setTabCapsuleId(existingCapsule.id);
          console.log(
            `[Kairo] ✓ Capsule merged successfully: "${result.capsule?.title || existingCapsule.title}"`,
          );
          return result;
        }
      }

      // ─── CREATE PATH: First capture on this specific chat ────────────────
      const customTitle = await promptCapsuleName();
      if (customTitle === null) {
        console.log('[Kairo] Capture cancelled by user.');
        return false;
      }

      let capsule;
      try {
        capsule = createCapsule({
          source: extractor.platform,
          url: location.href,
          threadId: currentThreadId,
          title: customTitle,
          meta: {
            reasoning: reasoningText || undefined,
          },
          content: {
            rawTurns: safeTurns,
            rawSnippet: snippet.slice(-4000),
            summary: '',
            goals: [],
            constraints: [],
            stack: [],
            keyDecisions: [],
          },
        });
        console.log(`[Kairo] Step 2 result: capsule ${capsule.id} created`);
      } catch (capsuleErr) {
        console.error('[Kairo] Step 2 FAILED:', capsuleErr);
        throw new Error('Capsule creation failed: ' + (capsuleErr.message || 'unknown'));
      }

      // Send new capsule to background service worker
      console.log('[Kairo] Step 3: Sending to service worker...');
      try {
        result = await chrome.runtime.sendMessage({
          type: 'SAVE_CAPSULE',
          capsule,
          options: { enrich: autoEnrich },
        });
        console.log('[Kairo] Step 3 result:', JSON.stringify(result).slice(0, 200));
      } catch (msgErr) {
        console.error('[Kairo] Step 3 FAILED - message error:', msgErr);
        throw new Error('Service worker unreachable: ' + (msgErr.message || 'unknown'));
      }

      // Pin the newly created capsule ID to this tab for subsequent captures in this chat
      if (result && result.success) {
        setTabCapsuleId(capsule.id);
      }

      // STEP 4: Validate response
      if (!result) {
        console.error('[Kairo] Step 4 FAILED: result is null/undefined');
        throw new Error('No response from service worker');
      }

      if (!result.success) {
        const errorDetail = result.error || result.errors?.join(', ') || 'Unknown save error';
        console.error('[Kairo] Step 4 FAILED:', errorDetail);
        throw new Error(errorDetail);
      }

      console.log(`[Kairo] ✓ Capsule saved successfully: ${result.capsule?.title || 'Capsule'}`);
      return result;
    };

    if (showButton) {
      injectButton(captureHandler);
    } else {
      console.log(
        '[Kairo] Floating button disabled in settings — registering capture trigger only (keyboard shortcut + context menu still work)',
      );
      registerCaptureTrigger(captureHandler);
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.kairo_settings) {
        const newVal = changes.kairo_settings.newValue || {};
        const oldVal = changes.kairo_settings.oldValue || {};
        if (newVal.showFloatingButton !== oldVal.showFloatingButton) {
          if (newVal.showFloatingButton !== false) {
            injectButton(captureHandler);
          } else {
            const existing = document.getElementById('kairo-container');
            if (existing) existing.remove();
          }
        }
      }
    });

    console.log('[Kairo] Content script initialized');
  } catch (err) {
    console.error('[Kairo] Content script init error:', err);
  }
})();
