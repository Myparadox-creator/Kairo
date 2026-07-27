// shared/i18n.js — Translation strings and utility for Kairo localization (en/es)

export const TRANSLATIONS = {
  en: {
    // Popup Page
    searchPlaceholder: 'Search capsules…',
    filterAll: 'All',
    filterFolder: 'Folder: {folder}',
    capsulesCountZero: '0 capsules',
    capsulesCountOne: '1 capsule',
    capsulesCountMany: '{count} capsules',
    foundSuffix: ' found',
    totalSuffix: ' total',
    noCapsulesTitle: 'No capsules yet',
    noCapsulesDesc: 'Visit any AI chat and click the capture button to save context.',
    deleteConfirmTitle: 'Delete Capsule?',
    deleteConfirmText: 'This action cannot be undone. The capsule will be permanently removed.',
    btnCancel: 'Cancel',
    btnDelete: 'Delete',
    loading: 'Loading',
    copyBtn: 'Copy',
    injectBtn: 'Inject',
    notionBtn: 'Notion',
    toastCopied: 'Copied to clipboard!',
    toastCopyFailed: 'Copy failed',
    toastInjected: 'Injected into chat!',
    toastInjectFailed: 'Injection failed',
    toastDeleted: 'Capsule deleted',
    badgePinned: 'Pinned',
    badgeEnriched: 'Enriched',
    untitledCapsule: 'Untitled Capsule',
    turnsBadge: '{count} turns',
    wordsBadge: '{count} words',
    turnBadge: '1 turn',
    wordBadge: '1 word',

    // Options Page
    settingsTitle: 'Kairo Settings',
    settingsDesc: 'Configure your AI context capture workflow.',
    settingsDescCount:
      'Configure your AI context capture workflow. You have {count} saved capsules.',
    claudeApiKeySection: 'Claude API Key',
    claudeApiKeyDesc:
      "Required for AI-powered context enrichment. Your key is stored securely in browser sync storage and never sent to any server except Anthropic's API.",
    apiKeyField: 'API Key',
    behaviorSection: 'Behavior',
    behaviorDesc: 'Control how Kairo works on AI chat pages.',
    autoEnrichField: 'Auto-enrich on capture',
    autoEnrichDesc:
      'Automatically extract goals, stack, and key decisions using Claude API when saving a capsule.',
    showFloatingBtnField: 'Show floating capture button',
    showFloatingBtnDesc:
      'Display the capture button on supported AI chat pages. You can still use Ctrl+Shift+S even if this is off.',
    saveSettingsBtn: 'Save Settings',
    savedBtn: 'Saved!',
    dataManagementSection: 'Data Management',
    dataManagementDesc: 'Export your capsules for backup or import from a previous export.',
    exportBtn: 'Export All Capsules',
    importBtn: 'Import from JSON',
    dangerZoneSection: 'Danger Zone',
    dangerZoneDesc: 'Irreversible actions. Proceed with caution.',
    clearAllBtn: 'Delete All Capsules',
    keyboardShortcutsSection: 'Keyboard Shortcuts',
    keyboardShortcutsDesc: 'Quick access shortcuts for Kairo.',
    captureCurrentChatField: 'Capture current chat',
    captureCurrentChatDesc: 'Works on any supported AI platform page.',
    versionFooter: 'Kairo v1.0.0 - Built for context that travels with you.',
    toastSettingsSaved: 'Settings saved successfully',
    toastSettingsSaveFailed: 'Failed to save settings',
    toastNoCapsulesExport: 'No capsules to export',
    toastExportSuccess: 'Exported {count} capsules',
    toastImportInvalid: 'Invalid file format',
    toastImportSuccess: 'Imported {count} capsules',
    toastImportFailed: 'Failed to parse import file',
    toastClearSuccess: 'All capsules deleted',
    toastClearFailed: 'Failed to clear data',

    // New Settings Fields for #75, #76, #80, #82
    tabGeneral: 'General Settings',
    tabAdvanced: 'Advanced Options',
    experimentalFeaturesSection: 'Experimental Features',
    experimentalFeaturesDesc: 'Beta capabilities. Enable with caution.',
    languageField: 'Language',
    languageDesc: 'Select interface language',
    themeField: 'Theme',
    themeDesc: 'Choose extension theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    autoTagField: 'Auto-tag capsules using AI',
    autoTagDesc: 'Automatically generate relevant tags when capturing a capsule using Claude.',
    notionSection: 'Notion Integration',
    notionSectionDesc: 'Export your saved capsules directly to Notion pages.',
    notionEnabledField: 'Enable Notion Integration',
    notionEnabledDesc: 'Enable export buttons on capsules inside the popup.',
    notionTokenField: 'Notion Integration Token',
    notionDbIdField: 'Notion Database ID',
  },
  es: {
    // Popup Page
    searchPlaceholder: 'Buscar cápsulas…',
    filterAll: 'Todo',
    filterFolder: 'Carpeta: {folder}',
    capsulesCountZero: '0 cápsulas',
    capsulesCountOne: '1 cápsula',
    capsulesCountMany: '{count} cápsulas',
    foundSuffix: ' encontradas',
    totalSuffix: ' total',
    noCapsulesTitle: 'Aún no hay cápsulas',
    noCapsulesDesc:
      'Visita cualquier chat de IA y haz clic en el botón de captura para guardar el contexto.',
    deleteConfirmTitle: '¿Eliminar cápsula?',
    deleteConfirmText:
      'Esta acción no se puede deshacer. La cápsula será eliminada permanentemente.',
    btnCancel: 'Cancelar',
    btnDelete: 'Eliminar',
    loading: 'Cargando...',
    copyBtn: 'Copiar',
    injectBtn: 'Inyectar',
    notionBtn: 'Notion',
    toastCopied: '¡Copiado al portapapeles!',
    toastCopyFailed: 'Error al copiar',
    toastInjected: '¡Inyectado en el chat!',
    toastInjectFailed: 'Error de inyección',
    toastDeleted: 'Cápsula eliminada',
    badgePinned: 'Fijado',
    badgeEnriched: 'Enriquecido',
    untitledCapsule: 'Cápsula sin título',
    turnsBadge: '{count} turnos',
    wordsBadge: '{count} palabras',
    turnBadge: '1 turno',
    wordBadge: '1 palabra',

    // Options Page
    settingsTitle: 'Configuración de Kairo',
    settingsDesc: 'Configura tu flujo de trabajo de captura de contexto de IA.',
    settingsDescCount:
      'Configura tu flujo de trabajo de captura de contexto de IA. Tienes {count} cápsulas guardadas.',
    claudeApiKeySection: 'Clave API de Claude',
    claudeApiKeyDesc:
      'Requerido para el enriquecimiento de contexto alimentado por IA. Tu clave se almacena de forma segura en el almacenamiento de sincronización del navegador y nunca se envía a ningún servidor excepto a la API de Anthropic.',
    apiKeyField: 'Clave API',
    behaviorSection: 'Comportamiento',
    behaviorDesc: 'Controla cómo funciona Kairo en las páginas de chat de IA.',
    autoEnrichField: 'Auto-enriquecer al capturar',
    autoEnrichDesc:
      'Extrae automáticamente objetivos, stack y decisiones clave usando la API de Claude al guardar una cápsula.',
    showFloatingBtnField: 'Mostrar botón de captura flotante',
    showFloatingBtnDesc:
      'Muestra el botón de captura en las páginas de chat de IA compatibles. Aún puedes usar Ctrl+Shift+S incluso si esto está desactivado.',
    saveSettingsBtn: 'Guardar configuración',
    savedBtn: '¡Guardado!',
    dataManagementSection: 'Gestión de datos',
    dataManagementDesc:
      'Exporta tus cápsulas para respaldo o impórtalas desde una exportación anterior.',
    exportBtn: 'Exportar todas las cápsulas',
    importBtn: 'Importar desde JSON',
    dangerZoneSection: 'Zona de peligro',
    dangerZoneDesc: 'Acciones irreversibles. Procede con precaución.',
    clearAllBtn: 'Eliminar todas las cápsulas',
    keyboardShortcutsSection: 'Atajos de teclado',
    keyboardShortcutsDesc: 'Atajos de acceso rápido para Kairo.',
    captureCurrentChatField: 'Capturar chat actual',
    captureCurrentChatDesc: 'Funciona en cualquier página de plataforma de IA compatible.',
    versionFooter: 'Kairo v1.0.0 - Creado para contexto que viaja contigo.',
    toastSettingsSaved: 'Configuración guardada correctamente',
    toastSettingsSaveFailed: 'Error al guardar la configuración',
    toastNoCapsulesExport: 'No hay cápsulas para exportar',
    toastExportSuccess: 'Se exportaron {count} cápsulas',
    toastImportInvalid: 'Formato de archivo no válido',
    toastImportSuccess: 'Se importaron {count} cápsulas',
    toastImportFailed: 'Error al procesar el archivo de importación',
    toastClearSuccess: 'Todas las cápsulas fueron eliminadas',
    toastClearFailed: 'Error al borrar los datos',

    // New Settings Fields for #75, #76, #80, #82
    tabGeneral: 'Configuración general',
    tabAdvanced: 'Opciones avanzadas',
    experimentalFeaturesSection: 'Funciones experimentales',
    experimentalFeaturesDesc: 'Capacidades beta. Habilítalas con precaución.',
    languageField: 'Idioma',
    languageDesc: 'Seleccionar idioma de la interfaz',
    themeField: 'Tema',
    themeDesc: 'Elegir tema de la extensión',
    themeDark: 'Oscuro',
    themeLight: 'Claro',
    autoTagField: 'Auto-etiquetar cápsulas usando IA',
    autoTagDesc:
      'Genera automáticamente etiquetas relevantes al capturar una cápsula usando Claude.',
    notionSection: 'Integración con Notion',
    notionSectionDesc: 'Exporta tus cápsulas guardadas directamente a páginas de Notion.',
    notionEnabledField: 'Habilitar integración con Notion',
    notionEnabledDesc:
      'Habilita los botones de exportación en las cápsulas dentro de la ventana emergente.',
    notionTokenField: 'Token de integración de Notion',
    notionDbIdField: 'ID de base de datos de Notion',
  },
};

/**
 * Get the translated string for a given key and locale.
 * @param {string} key - The translation key
 * @param {string} locale - 'en' or 'es'
 * @param {Object} [substitutions] - Optional substitutions (e.g. {count: 5})
 * @returns {string} The translated string
 */
export function t(key, locale = 'en', substitutions = {}) {
  const dict = TRANSLATIONS[locale] || TRANSLATIONS.en;
  let val = dict[key] || TRANSLATIONS.en[key] || key;

  // Perform substitutions
  Object.keys(substitutions).forEach((k) => {
    val = val.replace(`{${k}}`, substitutions[k]);
  });

  return val;
}
