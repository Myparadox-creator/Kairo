// shared/storage.js — chrome.storage.local wrapper for Capsule persistence
import { DEFAULT_SETTINGS, normalizeSettings } from './settings.js';
import { extractThreadId, getTurnSignature, hasTurnOverlap, hasUserTurnOverlap } from './utils.js';

const STORAGE_KEY = 'kairo_capsules';
const SETTINGS_KEY = 'kairo_settings';

// chrome.storage has no transaction primitive, so overlapping read-modify-write
// cycles can lose updates (last write wins). Every mutating operation is chained
// through this module-level promise — a lightweight mutex — so each one runs to
// completion (including its write) before the next one reads.
let mutationChain = Promise.resolve();

function enqueueMutation(mutator) {
  const result = mutationChain.then(mutator, mutator);
  // Keep the chain alive whether or not an individual mutation rejects.
  mutationChain = result.then(
    () => {},
    () => {},
  );
  return result;
}

const SYNC_PINNED_KEY = 'kairo_pinned_capsules';

async function syncLocalPinnedToSync() {
  try {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    const capsules = res[STORAGE_KEY] || [];
    const pinned = capsules.filter((c) => c.meta?.pinned);
    await chrome.storage.sync.set({ [SYNC_PINNED_KEY]: pinned });
  } catch (err) {
    console.error('[Kairo Sync] Failed to sync pinned capsules:', err);
  }
}

/**
 * Core matching logic: determines if a new capture refers to the same
 * conversation thread as an existing stored capsule.
 *
 * Uses a 4-layer cascade — ANY match is sufficient:
 *   1. Direct ID match (same capsule being updated)
 *   2. Thread ID match (works for ChatGPT, Claude, DeepSeek — where URL has chat ID)
 *   3. Specific URL match (only when URL actually contains a thread ID)
 *   4. Content-based match: same platform + shared user prompt or turn content
 *
 * WHY content matching is critical:
 *   On Gemini (https://gemini.google.com/app/), the URL does NOT change when switching
 *   chats in the history sidebar. Matching requires comparing actual conversation
 *   content:
 *   - Same chat, new turns -> user prompts overlap -> MERGE into existing capsule
 *   - Different chat from history -> user prompts differ -> CREATE new capsule
 *
 * @param {Object} stored  - The capsule already in storage
 * @param {Object} incoming - The new capsule being saved
 * @param {string} incomingSig - Pre-computed getTurnSignature(incoming.content.rawTurns)
 * @returns {boolean}
 */
function isSameThread(stored, incoming, incomingSig) {
  // Layer 1: Direct ID match
  if (stored.id && incoming.id && stored.id === incoming.id) return true;

  // Layer 2: Thread ID match (only when threadId is non-empty, e.g. ChatGPT, Claude, DeepSeek)
  if (stored.threadId && incoming.threadId && stored.threadId === incoming.threadId) {
    return true;
  }

  // Layer 3: URL match (only when URL actually contains thread info)
  if (stored.url && incoming.url && stored.url === incoming.url) {
    const storedThread = extractThreadId(stored.url);
    if (storedThread) return true;
  }

  // Layer 4: Content-based match — same platform + any shared user prompt or turn text
  if (incoming.source && stored.source && incoming.source === stored.source) {
    const incomingTurns = incoming.content?.rawTurns || [];
    const storedTurns = stored.content?.rawTurns || [];

    if (incomingTurns.length && storedTurns.length) {
      if (hasUserTurnOverlap(storedTurns, incomingTurns)) return true;

      if (incomingSig) {
        const storedSig = getTurnSignature(storedTurns);
        if (storedSig && storedSig === incomingSig) return true;
      }

      if (hasTurnOverlap(storedTurns, incomingTurns)) return true;
    }
  }

  return false;
}

// Read-modify-write upsert. NOT locked on its own — callers must invoke it from
// within enqueueMutation so the read observes the previous mutation's write.
async function upsertCapsuleUnlocked(capsule) {
  const existing = await getCapsules();
  const incomingSig = getTurnSignature(capsule.content?.rawTurns);

  const idx = existing.findIndex((c) => isSameThread(c, capsule, incomingSig));

  if (idx > -1) {
    // Merge into existing capsule: preserve original ID, title, and initial metadata
    const target = existing[idx];
    existing[idx] = {
      ...target,
      url: capsule.url || target.url,
      threadId: capsule.threadId || target.threadId,
      updatedAt: Date.now(),
      content: {
        ...target.content,
        ...capsule.content,
        summary: capsule.content?.summary || target.content?.summary || '',
        rawTurns: capsule.content?.rawTurns?.length ? capsule.content.rawTurns : target.content?.rawTurns || [],
        rawSnippet: capsule.content?.rawSnippet || target.content?.rawSnippet || '',
      },
      meta: {
        ...target.meta,
        ...capsule.meta,
      },
    };
  } else {
    existing.unshift(capsule);
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: existing });
  await syncLocalPinnedToSync();
}

/**
 * Save or upsert a capsule. Newest-first ordering.
 * Serialized through a module-level mutation queue so concurrent saves cannot
 * lose each other's writes (chrome.storage offers no transaction primitive).
 * @param {Object} capsule
 */
export async function saveCapsule(capsule) {
  return enqueueMutation(async () => {
    try {
      await upsertCapsuleUnlocked(capsule);
      return { success: true };
    } catch (err) {
      console.error('[Kairo] Storage write error:', err);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Retrieve all saved capsules.
 * @returns {Promise<Object[]>}
 */
export async function getCapsules() {
  try {
    const localRes = await chrome.storage.local.get(STORAGE_KEY);
    let localCaps = localRes[STORAGE_KEY] || [];

    const syncRes = await chrome.storage.sync.get(SYNC_PINNED_KEY);
    const syncedPinned = syncRes[SYNC_PINNED_KEY] || [];

    let modified = false;
    syncedPinned.forEach((syncCap) => {
      const idx = localCaps.findIndex((c) => c.id === syncCap.id);
      if (idx === -1) {
        if (syncCap.meta?.pinned) {
          localCaps.unshift(syncCap);
          modified = true;
        }
      } else {
        const localCap = localCaps[idx];
        if ((syncCap.updatedAt || 0) > (localCap.updatedAt || 0)) {
          localCaps[idx] = { ...localCap, ...syncCap };
          modified = true;
        }
      }
    });

    if (modified) {
      await chrome.storage.local.set({ [STORAGE_KEY]: localCaps });
    }

    return localCaps;
  } catch (err) {
    console.error('[Kairo] Storage read error:', err);
    return [];
  }
}

/**
 * Search for an existing capsule by thread ID, matching URL, or content fingerprint.
 * @param {string} threadId - Thread identifier (may be '' for Gemini)
 * @param {string} [url] - Full URL string
 * @param {Object|Array} [opts] - Options object { turns, source } or turns array
 * @returns {Promise<Object|null>} The matching capsule or null if not found
 */
export async function findCapsuleByThread(threadId, url = '', opts = {}) {
  try {
    const capsules = await getCapsules();
    if (!capsules.length) return null;

    const turns = Array.isArray(opts) ? opts : (opts.turns || []);
    const source = typeof opts === 'object' && !Array.isArray(opts) ? opts.source : null;

    const incoming = {
      id: '',
      threadId: threadId || (url ? extractThreadId(url) : ''),
      url: url,
      source: source || '',
      updatedAt: Date.now(),
      content: { rawTurns: turns },
    };
    const incomingSig = getTurnSignature(turns);

    return capsules.find((c) => isSameThread(c, incoming, incomingSig)) || null;
  } catch (err) {
    console.error('[Kairo] Error finding capsule by thread:', err);
    return null;
  }
}

/**
 * Delete a capsule by its ID.
 * @param {string} id
 */
export async function deleteCapsule(id) {
  return enqueueMutation(async () => {
    try {
      const existing = await getCapsules();
      const filtered = existing.filter((c) => c.id !== id);
      await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
      await syncLocalPinnedToSync();
      return { success: true };
    } catch (err) {
      console.error('[Kairo] Delete error:', err);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Delete multiple capsules by their IDs in a single write.
 * @param {string[]} ids
 */
export async function deleteCapsules(ids) {
  return enqueueMutation(async () => {
    try {
      const idSet = new Set(ids);
      const existing = await getCapsules();
      const filtered = existing.filter((c) => !idSet.has(c.id));
      await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
      return { success: true, deletedCount: existing.length - filtered.length };
    } catch (err) {
      console.error('[Kairo] Bulk delete error:', err);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Partially update a capsule by its ID.
 * @param {string} id
 * @param {Object} updates - Fields to merge into the capsule
 */
export async function updateCapsule(id, updates) {
  return enqueueMutation(async () => {
    try {
      const capsules = await getCapsules();
      const capsule = capsules.find((c) => c.id === id);
      if (!capsule) {
        return { success: false, error: 'Capsule not found' };
      }
      await upsertCapsuleUnlocked({ ...capsule, ...updates, updatedAt: Date.now() });
      return { success: true };
    } catch (err) {
      console.error('[Kairo] Update error:', err);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Get extension settings.
 * @returns {Promise<Object>}
 */
export async function getSettings() {
  try {
    const res = await chrome.storage.sync.get(SETTINGS_KEY);
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...(res[SETTINGS_KEY] || {}) });
  } catch (err) {
    console.error('[Kairo] Settings read error:', err);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save extension settings.
 * @param {Object} settings
 */
export async function saveSettings(settings) {
  try {
    await chrome.storage.sync.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
    return { success: true };
  } catch (err) {
    console.error('[Kairo] Settings write error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Clear all capsule data. Danger zone.
 */
export async function clearAllCapsules() {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    return { success: true };
  } catch (err) {
    console.error('[Kairo] Clear error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Dedupes, cleans invalid structures, and optimizes storage.
 */
export async function compactDatabase() {
  return enqueueMutation(async () => {
    try {
      const localRes = await chrome.storage.local.get(STORAGE_KEY);
      let localCaps = localRes[STORAGE_KEY] || [];
      const initialCount = localCaps.length;

      // Filter invalid structures
      localCaps = localCaps.filter((c) => {
        if (!c || typeof c !== 'object') return false;
        return (
          typeof c.id === 'string' && typeof c.source === 'string' && typeof c.content === 'object'
        );
      });

      // Deduplicate using the same isSameThread() cascade
      const dedupedCaps = [];

      for (const cap of localCaps) {
        const capSig = getTurnSignature(cap.content?.rawTurns);
        const existingIdx = dedupedCaps.findIndex((existing) => isSameThread(existing, cap, capSig));

        if (existingIdx > -1) {
          const target = dedupedCaps[existingIdx];
          const capTurns = cap.content?.rawTurns || [];
          const targetTurns = target.content?.rawTurns || [];

          dedupedCaps[existingIdx] = {
            ...target,
            url: cap.url || target.url,
            threadId: cap.threadId || target.threadId,
            content: {
              ...target.content,
              ...(capTurns.length >= targetTurns.length ? cap.content : {}),
              rawTurns: capTurns.length >= targetTurns.length ? capTurns : targetTurns,
            },
            id: target.id,
            title: target.title || cap.title,
            updatedAt: Math.max(target.updatedAt || 0, cap.updatedAt || 0),
          };
        } else {
          dedupedCaps.push(cap);
        }
      }

      localCaps = dedupedCaps;

      await chrome.storage.local.set({ [STORAGE_KEY]: localCaps });
      await syncLocalPinnedToSync();

      const optimizedCount = localCaps.length;
      return { success: true, optimizedCount, removedCount: initialCount - optimizedCount };
    } catch (err) {
      console.error('[Kairo] Compaction error:', err);
      return { success: false, error: err.message };
    }
  });
}
