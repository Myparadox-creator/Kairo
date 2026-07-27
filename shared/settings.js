export const DEFAULT_SETTINGS = {
  autoEnrich: false,
  showFloatingButton: true,
  apiKey: '',
  locale: 'en',
  theme: 'dark',
  autoTag: false,
  notionEnabled: false,
  notionToken: '',
  notionDbId: '',
  experimentalMerge: false,
  experimentalDebug: false,
  apiEndpoint: 'https://api.anthropic.com/v1/messages',
  enrichEngine: 'claude',
  geminiApiKey: '',
  injectionTemplate: '',
  autoBackup: false,
  lastBackupTime: 0,
};

export function normalizeSettings(settings = {}) {
  return {
    autoEnrich: settings.autoEnrich === true,
    showFloatingButton: settings.showFloatingButton !== false,
    apiKey: typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '',
    locale: typeof settings.locale === 'string' ? settings.locale : 'en',
    theme: typeof settings.theme === 'string' ? settings.theme : 'dark',
    autoTag: settings.autoTag === true,
    notionEnabled: settings.notionEnabled === true,
    notionToken: typeof settings.notionToken === 'string' ? settings.notionToken.trim() : '',
    notionDbId: typeof settings.notionDbId === 'string' ? settings.notionDbId.trim() : '',
    experimentalMerge: settings.experimentalMerge === true,
    experimentalDebug: settings.experimentalDebug === true,
    apiEndpoint:
      typeof settings.apiEndpoint === 'string' && settings.apiEndpoint.trim()
        ? settings.apiEndpoint.trim()
        : 'https://api.anthropic.com/v1/messages',
    enrichEngine: typeof settings.enrichEngine === 'string' ? settings.enrichEngine : 'claude',
    geminiApiKey: typeof settings.geminiApiKey === 'string' ? settings.geminiApiKey.trim() : '',
    injectionTemplate:
      typeof settings.injectionTemplate === 'string' ? settings.injectionTemplate : '',
    autoBackup: settings.autoBackup === true,
    lastBackupTime: typeof settings.lastBackupTime === 'number' ? settings.lastBackupTime : 0,
  };
}
