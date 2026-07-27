// options/options.js — Kairo Settings Page (Preact + htm)

import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';
import { t } from '../shared/i18n.js';
import { validateCapsule } from '../shared/capsule.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../shared/settings.js';

function OptionsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [toastMsg, setToastMsg] = useState('');
  const [capsuleCount, setCapsuleCount] = useState(0);
  const [capsules, setCapsules] = useState([]);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Load settings + capsules on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (res && typeof res === 'object') {
        const normalized = normalizeSettings({ ...DEFAULT_SETTINGS, ...res });
        if (!res.hasOwnProperty('theme')) {
          const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark';
          normalized.theme = systemTheme;
        }
        setSettings(normalized);
      } else {
        const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
        setSettings({ ...DEFAULT_SETTINGS, theme: systemTheme });
      }
    });

    chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (res) => {
      if (Array.isArray(res)) {
        setCapsules(res);
        setCapsuleCount(res.length);
      }
    });
  }, []);

  // Persist theme class on body
  useEffect(() => {
    document.body.className = settings.theme === 'light' ? 'light-theme' : '';
  }, [settings.theme]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  // Save settings
  const handleSave = () => {
    const normalized = normalizeSettings(settings);
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: normalized }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('[Kairo Options] Save settings failed:', chrome.runtime.lastError.message);
        showToast(t('toastSettingsSaveFailed', settings.locale));
        return;
      }
      if (res?.success) {
        showToast(t('toastSettingsSaved', settings.locale));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        showToast(t('toastSettingsSaveFailed', settings.locale));
      }
    });
  };

  // Export all capsules as JSON
  const handleExport = () => {
    chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (resCapsules) => {
      if (!Array.isArray(resCapsules) || resCapsules.length === 0) {
        showToast(t('toastNoCapsulesExport', settings.locale));
        return;
      }

      const data = JSON.stringify(
        {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          app: 'Kairo',
          capsules: resCapsules,
        },
        null,
        2,
      );

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kairo-capsules-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('toastExportSuccess', settings.locale, { count: resCapsules.length }));
    });
  };

  // Compact / Optimize Database
  const handleCompaction = () => {
    chrome.runtime.sendMessage({ type: 'COMPACT_DATABASE' }, (res) => {
      if (res?.success) {
        showToast(
          settings.locale === 'es'
            ? `Base de datos optimizada. Se eliminaron ${res.removedCount || 0} entradas.`
            : `Database optimized! Removed ${res.removedCount || 0} invalid entries.`,
        );
        chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (resCaps) => {
          if (Array.isArray(resCaps)) {
            setCapsules(resCaps);
            setCapsuleCount(resCaps.length);
          }
        });
      } else {
        showToast(res?.error || 'Compaction failed');
      }
    });
  };

  // Import capsules from JSON
  const handleImport = () => {
    document.getElementById('import-file').click();
  };

  const processImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!parsed) {
          showToast(t('toastImportInvalid', settings.locale));
          return;
        }

        let importedCapsules = parsed.capsules || parsed;
        if (
          importedCapsules &&
          !Array.isArray(importedCapsules) &&
          typeof importedCapsules === 'object'
        ) {
          if (importedCapsules.id && importedCapsules.source) {
            importedCapsules = [importedCapsules];
          }
        }

        if (!Array.isArray(importedCapsules)) {
          showToast(t('toastImportInvalid', settings.locale));
          return;
        }

        const validCapsules = importedCapsules.filter((c) => {
          const validation = validateCapsule(c);
          return validation.valid;
        });

        if (validCapsules.length === 0) {
          showToast(t('toastImportInvalid', settings.locale));
          return;
        }

        let imported = 0;
        const saveNext = (i) => {
          if (i >= validCapsules.length) {
            showToast(t('toastImportSuccess', settings.locale, { count: imported }));
            setCapsuleCount((prev) => prev + imported);
            // Refresh list
            chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (res) => {
              if (Array.isArray(res)) setCapsules(res);
            });
            return;
          }
          chrome.runtime.sendMessage(
            {
              type: 'SAVE_CAPSULE',
              capsule: validCapsules[i],
              options: { enrich: false },
            },
            (res) => {
              if (res?.success) imported++;
              saveNext(i + 1);
            },
          );
        };

        saveNext(0);
      } catch (err) {
        console.error('[Kairo Options] Import error:', err);
        showToast(t('toastImportFailed', settings.locale));
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset file input
  };

  // Clear all data
  const handleClearAll = () => {
    if (!confirm(t('deleteConfirmText', settings.locale))) return;
    if (!confirm('This is your last chance. Delete everything?')) return;

    chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, (res) => {
      if (res?.success) {
        setCapsules([]);
        setCapsuleCount(0);
        showToast(t('toastClearSuccess', settings.locale));
      } else {
        showToast(t('toastClearFailed', settings.locale));
      }
    });
  };

  // Reset settings
  const handleResetSettings = () => {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) return;
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: DEFAULT_SETTINGS }, (res) => {
      if (res?.success) {
        setSettings(DEFAULT_SETTINGS);
        showToast('Settings reset to defaults');
      } else {
        showToast('Failed to reset settings');
      }
    });
  };

  const loc = settings.locale;
  const stats = (() => {
    const counts = {
      claude: capsules.filter((c) => c.source === 'claude').length,
      chatgpt: capsules.filter((c) => c.source === 'chatgpt').length,
      gemini: capsules.filter((c) => c.source === 'gemini').length,
      deepseek: capsules.filter((c) => c.source === 'deepseek').length,
      tags: {},
    };
    capsules.forEach((c) => {
      (c.meta?.tags || []).forEach((t) => {
        const tag = t.toLowerCase().trim();
        if (tag) counts.tags[tag] = (counts.tags[tag] || 0) + 1;
      });
    });
    const sortedTags = Object.entries(counts.tags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { ...counts, sortedTags };
  })();

  return html`
    <div class="options-container">
      <div
        class="options-header"
        style="display: flex; align-items: center; gap: 14px; margin-bottom: 30px;"
      >
        <img
          src="../assets/brand-logo.png"
          style="width: 46px; height: 46px; object-fit: contain; filter: brightness(0) invert(1) drop-shadow(0 0 8px rgba(108, 71, 255, 0.8));"
        />
        <div>
          <h1
            style="font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; background: linear-gradient(135deg, #6c47ff, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent;"
          >
            ${t('settingsTitle', loc)}
          </h1>
          <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.5;">
            ${t('settingsDescCount', loc, { count: capsuleCount })}
          </p>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div
        style="
        display: flex;
        gap: 8px;
        margin-bottom: 24px;
        border-bottom: 1px solid var(--border-subtle);
        padding-bottom: 10px;
      "
      >
        <button
          style="
            background: ${activeTab === 'general' ? 'var(--accent)' : 'transparent'};
            color: ${activeTab === 'general' ? '#fff' : 'var(--text-secondary)'};
            border: 1px solid ${activeTab === 'general' ? 'var(--accent)' : 'var(--border-subtle)'};
            padding: 8px 16px;
            border-radius: var(--radius-sm);
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all var(--transition);
          "
          onClick=${() => setActiveTab('general')}
          id="tab-btn-general"
        >
          ${t('tabGeneral', loc)}
        </button>
        <button
          style="
            background: ${activeTab === 'advanced' ? 'var(--accent)' : 'transparent'};
            color: ${activeTab === 'advanced' ? '#fff' : 'var(--text-secondary)'};
            border: 1px solid ${activeTab === 'advanced' ? 'var(--accent)' : 'var(--border-subtle)'};
            padding: 8px 16px;
            border-radius: var(--radius-sm);
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all var(--transition);
          "
          onClick=${() => setActiveTab('advanced')}
          id="tab-btn-advanced"
        >
          ${t('tabAdvanced', loc)}
        </button>
        <button
          style="
            background: ${activeTab === 'insights' ? 'var(--accent)' : 'transparent'};
            color: ${activeTab === 'insights' ? '#fff' : 'var(--text-secondary)'};
            border: 1px solid ${activeTab === 'insights' ? 'var(--accent)' : 'var(--border-subtle)'};
            padding: 8px 16px;
            border-radius: var(--radius-sm);
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all var(--transition);
          "
          onClick=${() => setActiveTab('insights')}
          id="tab-btn-insights"
        >
          Insights
        </button>
      </div>

      <!-- General Tab Content -->
      ${
        activeTab === 'general' &&
        html`
          <div>
            <!-- Model Enrichment Engine Section -->
            <div class="section" id="section-engine">
              <div class="section-title">Enrichment Engine</div>
              <div class="section-desc">
                Choose the AI service to summarize and extract metadata from captured chats.
              </div>

              <div class="field">
                <label class="field-label" for="engine-select">Model Provider</label>
                <select
                  class="text-input"
                  style="background: var(--bg-input); color: var(--text-primary); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); padding: 8px;"
                  value=${settings.enrichEngine}
                  onChange=${(e) => setSettings({ ...settings, enrichEngine: e.target.value })}
                  id="engine-select"
                >
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="gemini">Gemini (Google)</option>
                </select>
              </div>

              ${
                settings.enrichEngine === 'claude' &&
                html`
                  <div>
                    <div class="field">
                      <label class="field-label" for="api-key-input"
                        >${t('apiKeyField', loc)}</label
                      >
                      <input
                        class="text-input"
                        type="password"
                        id="api-key-input"
                        placeholder="sk-ant-api03-..."
                        value=${settings.apiKey}
                        onInput=${(e) => setSettings({ ...settings, apiKey: e.target.value })}
                      />
                    </div>
                    <div class="field">
                      <label class="field-label" for="endpoint-input"
                        >API Endpoint URL (Optional)</label
                      >
                      <input
                        class="text-input"
                        type="text"
                        id="endpoint-input"
                        placeholder="https://api.anthropic.com/v1/messages"
                        value=${settings.apiEndpoint}
                        onInput=${(e) => setSettings({ ...settings, apiEndpoint: e.target.value })}
                      />
                    </div>
                  </div>
                `
              }
              ${
                settings.enrichEngine === 'gemini' &&
                html`
                  <div>
                    <div class="field">
                      <label class="field-label" for="gemini-key-input">Gemini API Key</label>
                      <input
                        class="text-input"
                        type="password"
                        id="gemini-key-input"
                        placeholder="AIzaSy..."
                        value=${settings.geminiApiKey}
                        onInput=${(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                      />
                    </div>
                  </div>
                `
              }
            </div>

            <!-- Behavior Section -->
            <div class="section" id="section-toggles">
              <div class="section-title">${t('behaviorSection', loc)}</div>
              <div class="section-desc">${t('behaviorDesc', loc)}</div>

              <!-- Auto-enrich toggle -->
              <div class="toggle-row">
                <div class="toggle-info">
                  <div class="toggle-label">${t('autoEnrichField', loc)}</div>
                  <div class="toggle-desc">${t('autoEnrichDesc', loc)}</div>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked=${settings.autoEnrich}
                    onChange=${(e) => setSettings({ ...settings, autoEnrich: e.target.checked })}
                    id="toggle-auto-enrich"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <!-- Auto-tag toggle -->
              <div class="toggle-row">
                <div class="toggle-info">
                  <div class="toggle-label">${t('autoTagField', loc)}</div>
                  <div class="toggle-desc">${t('autoTagDesc', loc)}</div>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked=${settings.autoTag}
                    onChange=${(e) => setSettings({ ...settings, autoTag: e.target.checked })}
                    id="toggle-auto-tag"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <!-- Show floating button toggle -->
              <div class="toggle-row">
                <div class="toggle-info">
                  <div class="toggle-label">${t('showFloatingBtnField', loc)}</div>
                  <div class="toggle-desc">${t('showFloatingBtnDesc', loc)}</div>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked=${settings.showFloatingButton}
                    onChange=${(e) => setSettings({ ...settings, showFloatingButton: e.target.checked })}
                    id="toggle-floating-btn"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <!-- Localization & Theme Section -->
            <div class="section" id="section-appearance">
              <div class="section-title">${t('languageField', loc)} & ${t('themeField', loc)}</div>
              <div class="section-desc">Customize language and visual preferences.</div>

              <!-- Language Dropdown -->
              <div class="toggle-row" style="border-bottom: 1px solid var(--border-subtle);">
                <div class="toggle-info">
                  <div class="toggle-label">${t('languageField', loc)}</div>
                  <div class="toggle-desc">${t('languageDesc', loc)}</div>
                </div>
                <select
                  class="text-input"
                  style="width: 140px; background: var(--bg-input); color: var(--text-primary); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); padding: 6px;"
                  value=${settings.locale}
                  onChange=${(e) => setSettings({ ...settings, locale: e.target.value })}
                  id="select-locale"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>

              <!-- Theme Dropdown -->
              <div class="toggle-row" style="border-bottom: none; padding-bottom: 0;">
                <div class="toggle-info">
                  <div class="toggle-label">${t('themeField', loc)}</div>
                  <div class="toggle-desc">${t('themeDesc', loc)}</div>
                </div>
                <select
                  class="text-input"
                  style="width: 140px; background: var(--bg-input); color: var(--text-primary); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); padding: 6px;"
                  value=${settings.theme}
                  onChange=${(e) => setSettings({ ...settings, theme: e.target.value })}
                  id="select-theme"
                >
                  <option value="dark">${t('themeDark', loc)}</option>
                  <option value="light">${t('themeLight', loc)}</option>
                </select>
              </div>
            </div>
          </div>
        `
      }

      <!-- Advanced Tab Content -->
      ${
        activeTab === 'advanced' &&
        html`
          <div>
            <!-- Notion Integration Section -->
            <div class="section" id="section-notion">
              <div class="section-title">${t('notionSection', loc)}</div>
              <div class="section-desc">${t('notionSectionDesc', loc)}</div>

              <!-- Enable Toggle -->
              <div
                class="toggle-row"
                style="border-bottom: 1px solid var(--border-subtle); margin-bottom: 12px;"
              >
                <div class="toggle-info">
                  <div class="toggle-label">${t('notionEnabledField', loc)}</div>
                  <div class="toggle-desc">${t('notionEnabledDesc', loc)}</div>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked=${settings.notionEnabled}
                    onChange=${(e) => setSettings({ ...settings, notionEnabled: e.target.checked })}
                    id="toggle-notion-enabled"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              ${
                settings.notionEnabled &&
                html`
                  <div>
                    <div class="field">
                      <label class="field-label" for="notion-token-input"
                        >${t('notionTokenField', loc)}</label
                      >
                      <input
                        class="text-input"
                        type="password"
                        id="notion-token-input"
                        placeholder="secret_..."
                        value=${settings.notionToken}
                        onInput=${(e) => setSettings({ ...settings, notionToken: e.target.value })}
                      />
                    </div>
                    <div class="field">
                      <label class="field-label" for="notion-db-input"
                        >${t('notionDbIdField', loc)}</label
                      >
                      <input
                        class="text-input"
                        type="text"
                        id="notion-db-input"
                        placeholder="e.g. 8c5b..."
                        value=${settings.notionDbId}
                        onInput=${(e) => setSettings({ ...settings, notionDbId: e.target.value })}
                      />
                    </div>
                  </div>
                `
              }
            </div>

            <!-- Custom Markdown Injection Template -->
            <div class="section" id="section-template">
              <div class="section-title">Context Injection Template</div>
              <div class="section-desc">
                Customize the markdown template used when injecting capsules. Supports: {title},
                {summary}, {goals}, {stack}, {keyDecisions}, {constraints}.
              </div>
              <div class="field">
                <label class="field-label" for="template-input">Markdown Template</label>
                <textarea
                  class="text-input"
                  style="box-sizing: border-box; width: 100%; min-height: 100px; font-family: monospace; font-size: 12px; line-height: 1.5; resize: vertical;"
                  id="template-input"
                  placeholder="[Context from Kairo]

{summary}

Goals: {goals}

Stack: {stack}"
                  value=${settings.injectionTemplate}
                  onInput=${(e) => setSettings({ ...settings, injectionTemplate: e.target.value })}
                />
              </div>
            </div>

            <!-- Experimental Features Section -->
            <div class="section" id="section-experimental">
              <div class="section-title">${t('experimentalFeaturesSection', loc)}</div>
              <div class="section-desc">${t('experimentalFeaturesDesc', loc)}</div>

              <!-- Deep Merge Toggle -->
              <div class="toggle-row">
                <div class="toggle-info">
                  <div class="toggle-label">Deep merge manifest configuration overrides</div>
                  <div class="toggle-desc">
                    Enable recursive merging for Vite build config objects.
                  </div>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked=${settings.experimentalMerge}
                    onChange=${(e) => setSettings({ ...settings, experimentalMerge: e.target.checked })}
                    id="toggle-exp-merge"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <!-- Debug Logs Toggle -->
              <div class="toggle-row">
                <div class="toggle-info">
                  <div class="toggle-label">Verbose debug logs</div>
                  <div class="toggle-desc">
                    Output execution trace information directly to the service worker console.
                  </div>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked=${settings.experimentalDebug}
                    onChange=${(e) => setSettings({ ...settings, experimentalDebug: e.target.checked })}
                    id="toggle-exp-debug"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <!-- Data Management -->
            <div class="section" id="section-data">
              <div class="section-title">${t('dataManagementSection', loc)}</div>
              <div class="section-desc">${t('dataManagementDesc', loc)}</div>

              <!-- Automated Weekly Backup Toggle -->
              <div
                class="toggle-row"
                style="border-bottom: 1px solid var(--border-subtle); margin-bottom: 12px; padding-bottom: 12px;"
              >
                <div class="toggle-info">
                  <div class="toggle-label">Automated weekly backups</div>
                  <div class="toggle-desc">
                    Automatically trigger a JSON backup export once every 7 days when launching the
                    extension popup.
                  </div>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked=${settings.autoBackup}
                    onChange=${(e) => setSettings({ ...settings, autoBackup: e.target.checked })}
                    id="toggle-auto-backup"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="btn-row">
                <button class="btn" onClick=${handleExport} id="export-btn">
                  ${t('exportBtn', loc)}
                </button>
                <button class="btn" onClick=${handleImport} id="import-btn">
                  ${t('importBtn', loc)}
                </button>
                <button
                  class="btn"
                  onClick=${handleCompaction}
                  id="compact-btn"
                  style="background: rgba(108,71,255,0.06); border-color: rgba(108,71,255,0.15);"
                >
                  Optimize Database
                </button>
                <input
                  class="file-input"
                  type="file"
                  id="import-file"
                  accept=".json"
                  onChange=${processImport}
                />
              </div>
            </div>

            <!-- Danger Zone -->
            <div class="section danger-section" id="section-danger">
              <div class="section-title">${t('dangerZoneSection', loc)}</div>
              <div class="section-desc">${t('dangerZoneDesc', loc)}</div>
              <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button class="btn btn-danger" onClick=${handleClearAll} id="clear-all-btn">
                  ${t('clearAllBtn', loc)}
                </button>
                <button
                  class="btn btn-danger"
                  style="background: transparent; color: var(--danger); border: 1px solid var(--danger);"
                  onClick=${handleResetSettings}
                  id="reset-settings-btn"
                >
                  Reset Settings
                </button>
              </div>
            </div>

            <!-- Keyboard Shortcuts Info -->
            <div class="section" id="section-shortcuts">
              <div class="section-title">${t('keyboardShortcutsSection', loc)}</div>
              <div class="section-desc">${t('keyboardShortcutsDesc', loc)}</div>
              <div class="toggle-row" style="border-bottom: none; padding-bottom: 0;">
                <div class="toggle-info">
                  <div class="toggle-label">${t('captureCurrentChatField', loc)}</div>
                  <div class="toggle-desc">${t('captureCurrentChatDesc', loc)}</div>
                </div>
                <code
                  style="
                background: var(--bg-input);
                padding: 4px 10px;
                border-radius: 6px;
                font-size: 11px;
                color: var(--accent);
                border: 1px solid var(--border-subtle);
                white-space: nowrap;
              "
                  >Ctrl+Shift+S</code
                >
              </div>
            </div>
          </div>
        `
      }

      <!-- Insights Tab Content -->
      ${
        activeTab === 'insights' &&
        html`
          <div>
            <!-- Statistics Card -->
            <div class="section" id="section-stats">
              <div class="section-title">Usage Statistics</div>
              <div class="section-desc">A breakdown of captured contexts and sources.</div>

              <!-- Platform Stats Grid -->
              <div
                style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 15px; margin-bottom: 20px;"
              >
                <div
                  style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px; text-align: center;"
                >
                  <div
                    style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 4px;"
                  >
                    Claude
                  </div>
                  <div style="font-size: 24px; font-weight: 700; color: var(--accent);">
                    ${stats.claude}
                  </div>
                </div>
                <div
                  style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px; text-align: center;"
                >
                  <div
                    style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 4px;"
                  >
                    ChatGPT
                  </div>
                  <div style="font-size: 24px; font-weight: 700; color: var(--accent);">
                    ${stats.chatgpt}
                  </div>
                </div>
                <div
                  style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px; text-align: center;"
                >
                  <div
                    style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 4px;"
                  >
                    Gemini
                  </div>
                  <div style="font-size: 24px; font-weight: 700; color: var(--accent);">
                    ${stats.gemini}
                  </div>
                </div>
                <div
                  style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px; text-align: center;"
                >
                  <div
                    style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 4px;"
                  >
                    DeepSeek
                  </div>
                  <div style="font-size: 24px; font-weight: 700; color: var(--accent);">
                    ${stats.deepseek}
                  </div>
                </div>
              </div>

              <!-- Top Tags Breakdown -->
              <div style="border-top: 1px solid var(--border-subtle); padding-top: 15px;">
                <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">
                  Top Extraction Tags
                </div>
                ${
                  stats.sortedTags.length === 0
                    ? html`
                        <div style="font-size: 12px; color: var(--text-secondary);">
                          No tags captured yet. Try auto-tagging.
                        </div>
                      `
                    : stats.sortedTags.map(
                        ([tag, count]) => html`
                          <div
                            key=${tag}
                            style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px;"
                          >
                            <span
                              style="background: var(--bg-input); padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-subtle);"
                              >${tag}</span
                            >
                            <span style="color: var(--text-secondary); font-weight: 600;"
                              >${count} times</span
                            >
                          </div>
                        `,
                      )
                }
              </div>
            </div>
          </div>
        `
      }

      <!-- Save Button -->
      ${
        activeTab !== 'insights' &&
        html`
          <div style="margin-top: 10px; margin-bottom: 30px;">
            <button class="btn btn-primary" onClick=${handleSave} id="save-settings-btn">
              ${saved ? t('savedBtn', loc) : t('saveSettingsBtn', loc)}
            </button>
          </div>
        `
      }

      <!-- Version Footer -->
      <div class="version-footer">${t('versionFooter', loc)}</div>
    </div>

    <!-- Toast -->
    ${toastMsg && html`<div class="toast" role="alert" aria-live="polite">${toastMsg}</div>`}
  `;
}

render(html`<${OptionsPage} />`, document.getElementById('root'));
