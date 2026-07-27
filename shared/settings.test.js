import { test, expect } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings.js';

test('normalizeSettings keeps defaults when settings are missing', () => {
  expect(normalizeSettings()).toEqual(DEFAULT_SETTINGS);
});

test('normalizeSettings trims API keys before persistence', () => {
  expect(normalizeSettings({ apiKey: '  sk-ant-example  ', autoEnrich: true })).toEqual({
    ...DEFAULT_SETTINGS,
    apiKey: 'sk-ant-example',
    autoEnrich: true,
    showFloatingButton: true,
  });
});

test('normalizeSettings coerces booleans and drops unknown fields', () => {
  expect(
    normalizeSettings({
      apiKey: 123,
      autoEnrich: 'yes',
      showFloatingButton: false,
      extra: 'ignored',
    }),
  ).toEqual({
    ...DEFAULT_SETTINGS,
    apiKey: '',
    autoEnrich: false,
    showFloatingButton: false,
  });
});
