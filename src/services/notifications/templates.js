const { normalizeAppLanguage } = require('../../utils/language');

const TEMPLATES = {
  newsFallbackTitle: {
    fr: 'Nouvelle actualite jeu',
    en: 'New game update',
    de: 'Neues Spiel-Update',
    es: 'Nueva actualización del juego',
    ru: 'Новости об игре',
    zh: '游戏新动态',
  },
  autoFollowTitle: {
    fr: 'Nouveau jeu suivi automatiquement',
    en: 'New game automatically followed',
    de: 'Neues Spiel automatisch gefolgt',
    es: 'Nuevo juego seguido automáticamente',
    ru: 'Новая игра добавлена в отслеживаемые',
    zh: '已自动关注新游戏',
  },
  autoFollowBody: {
    fr: gameName => `${gameName} a ete ajoute a vos jeux suivis`,
    en: gameName => `${gameName} was added to your followed games`,
    de: gameName => `${gameName} wurde zu Ihren gefolgten Spielen hinzugefügt`,
    es: gameName => `${gameName} se añadió a tus juegos seguidos`,
    ru: gameName => `${gameName} добавлена в отслеживаемые игры`,
    zh: gameName => `${gameName} 已加入您的关注列表`,
  },
  followPromptTitle: {
    fr: 'Voulez-vous suivre ce jeu ?',
    en: 'Do you want to follow this game?',
    de: 'Möchten Sie diesem Spiel folgen?',
    es: '¿Quieres seguir este juego?',
    ru: 'Подписаться на эту игру?',
    zh: '要关注这款游戏吗？',
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
    de: {
      library: 'Ihrer Steam-Bibliothek',
      wishlist: 'Ihrer Steam-Wunschliste',
    },
    es: {
      library: 'tu biblioteca de Steam',
      wishlist: 'tu lista de deseos de Steam',
    },
    ru: {
      library: 'вашей библиотеке Steam',
      wishlist: 'вашем списке желаемого Steam',
    },
    zh: {
      library: '您的 Steam 游戏库',
      wishlist: '您的 Steam 愿望单',
    },
  },
  followPromptBody: {
    fr: (gameName, contextLabel, appId) =>
      `${gameName || `Jeu ${appId}`} a ete detecte dans ${contextLabel}.`,
    en: (gameName, contextLabel, appId) =>
      `${gameName || `Game ${appId}`} was detected in ${contextLabel}.`,
    de: (gameName, contextLabel, appId) =>
      `${gameName || `Spiel ${appId}`} wurde in ${contextLabel} erkannt.`,
    es: (gameName, contextLabel, appId) =>
      `${gameName || `Juego ${appId}`} se detectó en ${contextLabel}.`,
    ru: (gameName, contextLabel, appId) =>
      `${gameName || `Игра ${appId}`} обнаружена в ${contextLabel}.`,
    zh: (gameName, contextLabel, appId) =>
      `${gameName || `游戏 ${appId}`} 在${contextLabel}中被检测到。`,
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
