const { normalizeAppLanguage } = require('../../utils/language');

const TEMPLATES = {
  newsFallbackTitle: {
    fr: 'Nouvelle actualite jeu',
    en: 'New game update',
  },
  autoFollowTitle: {
    fr: 'Nouveau jeu suivi automatiquement',
    en: 'New game automatically followed',
  },
  autoFollowBody: {
    fr: gameName => `${gameName} a ete ajoute a vos jeux suivis`,
    en: gameName => `${gameName} was added to your followed games`,
  },
  followPromptTitle: {
    fr: 'Voulez-vous suivre ce jeu ?',
    en: 'Do you want to follow this game?',
  },
  followPromptContext: {
    fr: {
      library: 'votre bibliotheque Steam',
      wishlist: 'votre wishlist Steam',
    },
    en: {
      library: 'your Steam library',
      wishlist: 'your Steam wishlist',
    },
  },
  followPromptBody: {
    fr: (gameName, contextLabel, appId) =>
      `${gameName || `Jeu ${appId}`} a ete detecte dans ${contextLabel}.`,
    en: (gameName, contextLabel, appId) =>
      `${gameName || `Game ${appId}`} was detected in ${contextLabel}.`,
  },
};

function getTemplateLanguage(language) {
  return normalizeAppLanguage(language);
}

function createNewsNotification(
  appId,
  newsItem,
  gameName = null,
  steamId = null,
  language = 'fr'
) {
  const resolvedLanguage = getTemplateLanguage(language);

  return {
    title: gameName || TEMPLATES.newsFallbackTitle[resolvedLanguage],
    body: newsItem.title,
    data: {
      type: 'news',
      url: newsItem.url,
      appId,
      ...(steamId ? { steamId } : {}),
      newsId: newsItem.gid,
      ...(newsItem.firstImageUrl ? { imageUrl: newsItem.firstImageUrl } : {}),
      context: newsItem.context || 'news',
      allowUnfollow: true,
    },
  };
}

function createAutoFollowNotification(appId, gameName, language = 'fr') {
  const resolvedLanguage = getTemplateLanguage(language);

  return {
    title: TEMPLATES.autoFollowTitle[resolvedLanguage],
    body: TEMPLATES.autoFollowBody[resolvedLanguage](gameName),
    data: {
      type: 'auto_follow',
      appId,
      allowUnfollow: false,
    },
  };
}

function createFollowPromptNotification(
  appId,
  gameName,
  source = 'library',
  language = 'fr',
  steamId = null
) {
  const resolvedLanguage = getTemplateLanguage(language);
  const contextLabel =
    TEMPLATES.followPromptContext[resolvedLanguage][source] ||
    TEMPLATES.followPromptContext[resolvedLanguage].library;

  return {
    title: TEMPLATES.followPromptTitle[resolvedLanguage],
    body: TEMPLATES.followPromptBody[resolvedLanguage](
      gameName,
      contextLabel,
      appId
    ),
    data: {
      type: 'follow_prompt',
      appId,
      source,
      gameName: gameName || '',
      allowUnfollow: false,
      ...(steamId ? { steamId } : {}),
    },
  };
}

function createGeneralNotification(title, body, data = {}) {
  return {
    title,
    body,
    data: {
      type: 'general',
      ...data,
    },
  };
}

module.exports = {
  createNewsNotification,
  createAutoFollowNotification,
  createFollowPromptNotification,
  createGeneralNotification,
};
