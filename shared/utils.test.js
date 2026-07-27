import { describe, it, expect } from 'vitest';
import {
  truncate,
  platformName,
  extractThreadId,
  getTurnSignature,
  hasUserTurnOverlap,
  hasTurnOverlap,
} from './utils.js';

describe('Utils', () => {
  it('truncates text properly', () => {
    expect(truncate('Hello World', 5)).toBe('Hello…');
    expect(truncate('Short', 10)).toBe('Short');
    expect(truncate('', 5)).toBe('');
  });

  it('returns correct platform names', () => {
    expect(platformName('claude')).toBe('Claude');
    expect(platformName('unknown')).toBe('unknown');
  });

  it('extracts unique thread identifiers correctly across platforms', () => {
    // ChatGPT — has thread ID in URL
    expect(extractThreadId('https://chatgpt.com/c/6789abc-1234-4567')).toBe(
      'chatgpt:6789abc-1234-4567',
    );
    expect(
      extractThreadId('https://chat.openai.com/g/g-12345/c/6789abc-1234-4567?model=gpt-4o'),
    ).toBe('chatgpt:6789abc-1234-4567');

    // Claude — has thread ID in URL
    expect(extractThreadId('https://claude.ai/chat/a1b2c3d4-5678-9012')).toBe(
      'claude:a1b2c3d4-5678-9012',
    );
    expect(
      extractThreadId('https://claude.ai/project/proj-123/chat/a1b2c3d4-5678-9012#bottom'),
    ).toBe('claude:a1b2c3d4-5678-9012');

    // Gemini — has thread ID in URL (rare, future-proof)
    expect(extractThreadId('https://gemini.google.com/app/1a2b3c4d5e6f')).toBe(
      'gemini:1a2b3c4d5e6f',
    );

    // Gemini — NO thread ID in URL (the common case that was causing the bug)
    // Must return '' so content-based matching is used instead
    expect(extractThreadId('https://gemini.google.com/app/')).toBe('');
    expect(extractThreadId('https://gemini.google.com/app')).toBe('');

    // DeepSeek — has thread ID in URL
    expect(extractThreadId('https://chat.deepseek.com/a/chat/s/xyz123456')).toBe(
      'deepseek:xyz123456',
    );

    // Home pages without thread IDs — must return '' (not a generic fallback)
    expect(extractThreadId('https://chatgpt.com/')).toBe('');
    expect(extractThreadId('https://claude.ai/')).toBe('');
    expect(extractThreadId('https://chat.deepseek.com/')).toBe('');
    expect(extractThreadId('')).toBe('');
  });
});

describe('getTurnSignature', () => {
  it('returns first user turn text as signature', () => {
    const turns = [
      { role: 'user', text: 'Hello World' },
      { role: 'assistant', text: 'Hi there' },
    ];
    expect(getTurnSignature(turns)).toBe('hello world');
  });

  it('returns empty string for empty turns', () => {
    expect(getTurnSignature([])).toBe('');
    expect(getTurnSignature()).toBe('');
  });
});

describe('hasUserTurnOverlap', () => {
  it('detects overlapping user prompts', () => {
    const turnsA = [
      { role: 'user', text: 'Hello, I am testing this feature' },
      { role: 'assistant', text: 'Response 1' },
    ];
    const turnsB = [
      { role: 'user', text: 'Hello, I am testing this feature' },
      { role: 'assistant', text: 'Different response format' },
      { role: 'user', text: 'Another message' },
      { role: 'assistant', text: 'Another response' },
    ];
    expect(hasUserTurnOverlap(turnsA, turnsB)).toBe(true);
  });

  it('returns false for completely different conversations', () => {
    const turnsA = [{ role: 'user', text: 'Tell me about quantum physics' }];
    const turnsB = [{ role: 'user', text: 'How do I cook pasta?' }];
    expect(hasUserTurnOverlap(turnsA, turnsB)).toBe(false);
  });

  it('returns false for empty arrays', () => {
    expect(hasUserTurnOverlap([], [])).toBe(false);
  });
});

describe('hasTurnOverlap', () => {
  it('detects overlapping turns regardless of role', () => {
    const turnsA = [{ role: 'assistant', text: 'This is a substantial response about coding' }];
    const turnsB = [
      { role: 'user', text: 'Something new' },
      { role: 'assistant', text: 'This is a substantial response about coding' },
    ];
    expect(hasTurnOverlap(turnsA, turnsB)).toBe(true);
  });
});
