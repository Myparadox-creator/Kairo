export const SUPPORTED_PLATFORMS = [
  {
    key: 'claude',
    name: 'Claude',
    hosts: ['claude.ai'],
    matchPatterns: ['https://claude.ai/*'],
  },
  {
    key: 'chatgpt',
    name: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    matchPatterns: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  },
  {
    key: 'gemini',
    name: 'Gemini',
    hosts: ['gemini.google.com'],
    matchPatterns: ['https://gemini.google.com/*'],
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    matchPatterns: ['https://chat.deepseek.com/*'],
  },
];

export function normalizeHostname(hostname = '') {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function getPlatformByHost(hostname) {
  const normalized = normalizeHostname(hostname);
  return (
    SUPPORTED_PLATFORMS.find((platform) =>
      platform.hosts.some((host) => normalized === host || normalized.endsWith(`.${host}`)),
    ) || null
  );
}

export function getSupportedMatchPatterns() {
  return SUPPORTED_PLATFORMS.flatMap((platform) => platform.matchPatterns);
}
