const SUPPORTED_LANGUAGES = ['fr', 'en', 'de', 'es'];
const DEFAULT_LANGUAGE = 'fr';

function isSupportedAppLanguage(language) {
  if (typeof language !== 'string') {
    return false;
  }

  const normalized = language.toLowerCase().trim();

  return SUPPORTED_LANGUAGES.some(
    code => normalized === code || normalized.startsWith(`${code}-`)
  );
}

function normalizeAppLanguage(language) {
  if (!isSupportedAppLanguage(language)) {
    return DEFAULT_LANGUAGE;
  }

  const normalized = language.toLowerCase().trim();

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
};

function toSteamStoreLanguage(language) {
  const normalized = normalizeAppLanguage(language);
  return STEAM_STORE_LANG[normalized] || 'english';
}

function toSteamNewsLanguage(language) {
  return normalizeAppLanguage(language);
}

module.exports = {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  isSupportedAppLanguage,
  normalizeAppLanguage,
  toSteamNewsLanguage,
  toSteamStoreLanguage,
};
