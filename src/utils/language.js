const SUPPORTED_LANGUAGES = ['fr', 'en', 'de', 'es', 'ru', 'zh'];
const DEFAULT_LANGUAGE = 'fr';

function isSupportedAppLanguage(language) {
  if (typeof language !== 'string') {
    return false;
  }

  const normalized = language.toLowerCase().trim();

  if (normalized.startsWith('zh')) {
    return true;
  }

  if (normalized.startsWith('ru')) {
    return true;
  }

  return SUPPORTED_LANGUAGES.some(
    code => normalized === code || normalized.startsWith(`${code}-`),
  );
}

function normalizeAppLanguage(language) {
  if (!isSupportedAppLanguage(language)) {
    return DEFAULT_LANGUAGE;
  }

  const normalized = language.toLowerCase().trim();

  if (normalized.startsWith('zh')) {
    return 'zh';
  }

  if (normalized.startsWith('ru')) {
    return 'ru';
  }

  if (SUPPORTED_LANGUAGES.includes(normalized)) {
    return normalized;
  }

  if (normalized.startsWith('en')) {
    return 'en';
  }

  if (normalized.startsWith('fr')) {
    return 'fr';
  }

  if (normalized.startsWith('de')) {
    return 'de';
  }

  if (normalized.startsWith('es')) {
    return 'es';
  }

  return DEFAULT_LANGUAGE;
}

const STEAM_STORE_LANG = {
  en: 'english',
  fr: 'french',
  de: 'german',
  es: 'spanish',
  ru: 'russian',
  zh: 'schinese',
};

/** Codes attendus par l'API Steam GetNewsForApp (noms complets). */
const STEAM_NEWS_LANG = {
  en: 'english',
  fr: 'french',
  de: 'german',
  es: 'spanish',
  ru: 'russian',
  zh: 'schinese',
};

function toSteamStoreLanguage(language) {
  const normalized = normalizeAppLanguage(language);
  return STEAM_STORE_LANG[normalized] || 'english';
}

function toSteamNewsLanguage(language) {
  const normalized = normalizeAppLanguage(language);
  return STEAM_NEWS_LANG[normalized] || 'english';
}

module.exports = {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  isSupportedAppLanguage,
  normalizeAppLanguage,
  toSteamNewsLanguage,
  toSteamStoreLanguage,
};
