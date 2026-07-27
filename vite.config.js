// vite.config.js — Kairo extension build configuration
import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Recursively merges `overlay` into `base`.
 * - Plain objects are merged key-by-key (overlay wins on scalar conflicts).
 * - Arrays are concatenated and de-duplicated (order: base first, overlay second).
 * - All other values from overlay replace those in base.
 *
 * @param {object} base
 * @param {object} overlay
 * @returns {object}
 */
function deepMerge(base, overlay) {
  const result = { ...base };
  for (const [key, val] of Object.entries(overlay)) {
    const baseVal = base[key];
    if (
      val !== null &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal, val);
    } else if (Array.isArray(val) && Array.isArray(baseVal)) {
      // Merge arrays and remove exact duplicates (string/number entries).
      result[key] = [...new Set([...baseVal, ...val])];
    } else {
      result[key] = val;
    }
  }
  return result;
}

function getManifest() {
  const base = JSON.parse(readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8'));

  if (process.env.BROWSER === 'firefox') {
    const ff = JSON.parse(readFileSync(resolve(__dirname, 'manifest.firefox.json'), 'utf-8'));
    // True deep merge: nested objects/arrays are combined, not replaced.
    return deepMerge(base, ff);
  }

  return base;
}

export default defineConfig({
  plugins: [
    webExtension({
      manifest: getManifest,
      watchFilePaths: ['manifest.json', 'manifest.firefox.json'],
    }),
  ],
  build: {
    outDir: process.env.BROWSER === 'firefox' ? 'dist-firefox' : 'dist-chrome',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== 'production',
    minify: process.env.NODE_ENV === 'production',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname),
    },
  },
});
