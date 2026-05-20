import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { ConfigStorage } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import i18nConfig from '@/common/config/i18n-config.json';
import {
  DEFAULT_LANGUAGE,
  normalizeLanguageCode,
  mergeWithFallback,
  ensureAndSwitch,
  type LocaleData,
} from '@/common/config/i18n';

// Static imports for all locales to ensure packaged app can always switch language.
import enUS from './locales/en-US/index';
import zhCN from './locales/zh-CN/index';
import jaJP from './locales/ja-JP/index';
import zhTW from './locales/zh-TW/index';
import koKR from './locales/ko-KR/index';
import trTR from './locales/tr-TR/index';

export type { I18nKey, I18nModule } from './i18n-keys';

// Re-exports
export { normalizeLanguageCode } from '@/common/config/i18n';
export type { SupportedLanguage } from '@/common/config/i18n';

export const supportedLanguages = i18nConfig.supportedLanguages;

const localeData: LocaleData = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'ja-JP': jaJP,
  'zh-TW': zhTW,
  'ko-KR': koKR,
  'tr-TR': trTR,
};

const fallbackLocale = localeData[DEFAULT_LANGUAGE] ?? {};

// Cache for loaded translations
const loadedTranslations = new Map<string, Record<string, unknown>>();

function getLocaleModules(locale: string): Record<string, unknown> {
  const normalized = normalizeLanguageCode(locale);
  const modules = localeData[normalized] ?? fallbackLocale;
  if (normalized === DEFAULT_LANGUAGE) return modules;
  return mergeWithFallback(fallbackLocale, modules);
}

/** Eagerly register every statically-imported locale (fixes WebUI login when lng≠en-US but bundle missing). */
function buildAllResources(): Record<string, { translation: Record<string, unknown> }> {
  const resources: Record<string, { translation: Record<string, unknown> }> = {};
  for (const lang of supportedLanguages) {
    const normalized = normalizeLanguageCode(lang);
    const modules = getLocaleModules(normalized);
    loadedTranslations.set(normalized, modules);
    resources[normalized] = { translation: modules };
  }
  return resources;
}

const allResources = buildAllResources();

function readLanguageHint(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem('i18nextLng');
  return stored ? normalizeLanguageCode(stored) : null;
}

async function loadLocaleModules(locale: string): Promise<Record<string, unknown>> {
  const normalized = normalizeLanguageCode(locale);
  const cached = loadedTranslations.get(normalized);
  if (cached) return cached;

  const modules = getLocaleModules(normalized);
  loadedTranslations.set(normalized, modules);
  return modules;
}

// Initialize i18n with fallback locale loaded synchronously to avoid FOUC.
// NOTE: We intentionally do NOT use i18next-browser-languagedetector here.
// In WebUI mode the browser's localStorage is on a different origin than the
// Electron renderer, so the detector would read the wrong (or missing) value
// and fall back to navigator.language, causing a language mismatch (Issue #1176).
// Instead, we use localStorage only as a hint for the initial render and let
// ConfigStorage (which bridges to the main process) be the single source of truth.
i18n
  .use(initReactI18next)
  .init({
    resources: allResources,
    lng: readLanguageHint() || DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    debug: false,
    interpolation: { escapeValue: false },
  })
  .catch((error: Error) => {
    console.error('Failed to initialize i18n:', error);
  });

// Load initial language from ConfigStorage (single source of truth when bridge is available)
async function initLanguage(): Promise<void> {
  let language: string | undefined;
  try {
    language = await ConfigStorage.get('language');
  } catch (error) {
    console.warn('Failed to read language from ConfigStorage, using local hint:', error);
  }

  const resolved =
    language ||
    readLanguageHint() ||
    normalizeLanguageCode(typeof navigator !== 'undefined' ? navigator.language : DEFAULT_LANGUAGE);

  try {
    await ensureAndSwitch(i18n, resolved, loadLocaleModules);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('i18nextLng', normalizeLanguageCode(resolved));
    }
  } catch (error) {
    console.error('Failed to initialize language:', error);
  }
}

// Listen for language changes and lazy load translations
i18n.on('languageChanged', async (lang: string) => {
  const normalizedLang = normalizeLanguageCode(lang);
  if (i18n.hasResourceBundle(normalizedLang, 'translation')) return;

  try {
    const translation = await loadLocaleModules(normalizedLang);
    i18n.addResourceBundle(normalizedLang, 'translation', translation, true, true);
  } catch (error) {
    console.error(`Failed to load language ${normalizedLang}:`, error);
  }
});

// Initialize on module load
void initLanguage();

// Listen for language changes broadcast by the main process (from other renderers).
// This enables real-time sync between desktop and WebUI — when one changes language,
// the other updates immediately without requiring a restart.
ipcBridge.systemSettings.languageChanged.on(async ({ language }) => {
  const normalized = normalizeLanguageCode(language);
  // Skip if already on this language (we're the one who triggered the change)
  if (i18n.language === normalized) return;
  await ensureAndSwitch(i18n, normalized, loadLocaleModules);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('i18nextLng', normalized);
  }
});

/**
 * Change language with lazy loading.
 */
export async function changeLanguage(lang: string): Promise<void> {
  await ensureAndSwitch(i18n, lang, loadLocaleModules);
  const normalized = normalizeLanguageCode(lang);
  // Always persist locally first (WebUI login page has no auth token → bridge may be unavailable)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('i18nextLng', normalized);
  }
  try {
    await ConfigStorage.set('language', normalized);
    await ipcBridge.systemSettings.changeLanguage.invoke({ language: normalized });
  } catch (error) {
    console.warn('Failed to sync language to main process (local i18n still applied):', error);
  }
}

// Clear translation cache (useful for development/testing)
export function clearTranslationCache(): void {
  loadedTranslations.clear();
}

// Get loaded languages
export function getLoadedLanguages(): string[] {
  return Array.from(loadedTranslations.keys());
}

export default i18n;
