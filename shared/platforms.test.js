import { test, expect } from 'vitest';
import { getPlatformByHost, getSupportedMatchPatterns, normalizeHostname } from './platforms.js';

test('normalizeHostname strips a www prefix and lowercases hostnames', () => {
  expect(normalizeHostname('WWW.ChatGPT.com')).toBe('chatgpt.com');
});

test('getPlatformByHost supports primary and legacy ChatGPT hosts', () => {
  expect(getPlatformByHost('chatgpt.com')?.key).toBe('chatgpt');
  expect(getPlatformByHost('chat.openai.com')?.key).toBe('chatgpt');
});

test('getPlatformByHost supports nested app subdomains', () => {
  expect(getPlatformByHost('preview.claude.ai')?.key).toBe('claude');
});

test('getSupportedMatchPatterns includes all declared content script hosts', () => {
  expect(getSupportedMatchPatterns()).toEqual([
    'https://claude.ai/*',
    'https://chatgpt.com/*',
    'https://chat.openai.com/*',
    'https://gemini.google.com/*',
    'https://chat.deepseek.com/*',
  ]);
});
