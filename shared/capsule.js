// shared/capsule.js — Core Capsule data model + factory function

import { extractThreadId } from './utils.js';

/**
 * Creates a new Capsule object with sensible defaults.
 * @param {Object} overrides - Fields to override on the default Capsule
 * @returns {Object} A fully-formed Capsule object
 */
export function createCapsule(overrides = {}) {
  const url = overrides.url || '';
  const threadId = overrides.threadId || extractThreadId(url);

  return {
    id: crypto.randomUUID(),
    title: '', // User-editable or AI-generated title
    source: '', // "claude" | "chatgpt" | "gemini" | "deepseek"
    url, // Full URL at capture time
    threadId, // Unique thread identifier
    capturedAt: Date.now(), // Unix timestamp
    updatedAt: Date.now(),

    content: {
      summary: '', // Short paragraph summary of the context
      goals: [], // string[] — what the user was trying to achieve
      constraints: [], // string[] — limitations, requirements stated
      stack: [], // string[] — tech stack or tools mentioned
      keyDecisions: [], // string[] — decisions made during the conversation
      rawTurns: [], // { role: "user"|"assistant", text: string }[]
      rawSnippet: '', // Last N chars of raw conversation (fallback)
    },

    meta: {
      tags: [], // string[] — user-added tags
      folder: null, // string | null — team folder name
      pinned: false, // boolean
      enriched: false, // whether Claude API was used to enrich
    },

    ...overrides,
  };
}

/**
 * Validates that a capsule has the minimum required fields before saving.
 * @param {Object} capsule - The capsule to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCapsule(capsule) {
  const errors = [];

  if (!capsule.id || typeof capsule.id !== 'string') {
    errors.push('Missing or invalid capsule id');
  }
  if (!capsule.source || typeof capsule.source !== 'string') {
    errors.push('Missing or invalid source platform');
  }
  if (!capsule.capturedAt || typeof capsule.capturedAt !== 'number') {
    errors.push('Missing or invalid capturedAt timestamp');
  }
  if (!capsule.content || typeof capsule.content !== 'object') {
    errors.push('Missing content object');
  }
  if (!capsule.meta || typeof capsule.meta !== 'object') {
    errors.push('Missing meta object');
  }

  return { valid: errors.length === 0, errors };
}
