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
    fr: gameName => `${gameName} a été ajouté à vos jeux suivis`,
    en: gameName => `${gameName} was added to your followed games`,
    de: gameName => `${gameName} wurde zu Ihren gefolgten Spielen hinzugefügt`,
    es: gameName => `${gameName} se añadió a tus juegos seguidos`,
    ru: gameName => `${gameName} добавлена в отслеживаемые игры`,
    zh: gameName => `${gameName} 已加入您的关注列表`,
  },
  followPromptTitle: {
    fr: (gameName, contextLabel, appId) =>
      `${gameName || `Jeu ${appId}`} a été détecté dans ${contextLabel}`,
    en: (gameName, contextLabel, appId) =>
      `${gameName || `Game ${appId}`} was detected in ${contextLabel}`,
    de: (gameName, contextLabel, appId) =>
      `${gameName || `Spiel ${appId}`} wurde in ${contextLabel} erkannt`,
    es: (gameName, contextLabel, appId) =>
      `${gameName || `Juego ${appId}`} se detectó en ${contextLabel}`,
    ru: (gameName, contextLabel, appId) =>
      `${gameName || `Игра ${appId}`} обнаружена в ${contextLabel}`,
    zh: (gameName, contextLabel, appId) =>
      `${gameName || `游戏 ${appId}`} 在${contextLabel}中被检测到`,
  },
  followPromptContext: {
    fr: {
      library: 'votre bibliothèque Steam',
      wishlist: 'votre wishlist Steam',
      family: 'votre Steam Famille',
    },
    en: {
      library: 'your Steam library',
      wishlist: 'your Steam wishlist',
      family: 'your Steam Family',
    },
    de: {
      library: 'Ihrer Steam-Bibliothek',
      wishlist: 'Ihrer Steam-Wunschliste',
      family: 'Ihrer Steam Family',
    },
    es: {
      library: 'tu biblioteca de Steam',
      wishlist: 'tu lista de deseos de Steam',
      family: 'tu Steam Family',
    },
    ru: {
      library: 'вашей библиотеке Steam',
      wishlist: 'вашем списке желаемого Steam',
      family: 'вашей Steam Family',
    },
    zh: {
      library: '您的 Steam 游戏库',
      wishlist: '您的 Steam 愿望单',
      family: '您的 Steam 家庭',
    },
  },
  followPromptBody: {
    fr: 'Cliquez pour suivre ce jeu',
    en: 'Tap to follow this game',
    de: 'Tippen Sie, um diesem Spiel zu folgen',
    es: 'Toca para seguir este juego',
    ru: 'Нажмите, чтобы подписаться на эту игру',
    zh: '点击关注此游戏',
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
      ...(gameName ? { gameName } : {}),
      newsId: newsItem.gid,
      ...(newsItem.firstImageUrl ? { imageUrl: newsItem.firstImageUrl } : {}),
      ...(newsItem.gameLogoUrl ? { gameLogoUrl: newsItem.gameLogoUrl } : {}),
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
    title: TEMPLATES.followPromptTitle[resolvedLanguage](
      gameName,
      contextLabel,
      appId
    ),
    body: TEMPLATES.followPromptBody[resolvedLanguage],
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
