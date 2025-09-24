/**
 * Templates de notifications
 * Centralise le formatage des différents types de notifications
 */

/**
 * Crée une notification pour une nouvelle actualité
 * @param {string} appId - ID de l'application
 * @param {Object} newsItem - Actualité
 * @param {string} gameName - Nom du jeu (optionnel)
 * @returns {Object} - Notification formatée
 */
function createNewsNotification(appId, newsItem, gameName = null) {
  return {
    title: gameName
      ? `${gameName} - Nouvelle actualité`
      : "Nouvelle actualité jeu",
    body: newsItem.title,
    data: {
      type: "news",
      url: newsItem.url,
      appId,
      newsId: newsItem.gid,
    },
  };
}

/**
 * Crée une notification pour un nouveau jeu suivi automatiquement
 * @param {string} appId - ID de l'application
 * @param {string} gameName - Nom du jeu
 * @returns {Object} - Notification formatée
 */
function createAutoFollowNotification(appId, gameName) {
  return {
    title: "Nouveau jeu suivi automatiquement",
    body: `${gameName} a été ajouté à vos jeux suivis`,
    data: {
      type: "auto_follow",
      appId,
    },
  };
}

/**
 * Crée une notification générale
 * @param {string} title - Titre
 * @param {string} body - Corps du message
 * @param {Object} data - Données supplémentaires
 * @returns {Object} - Notification formatée
 */
function createGeneralNotification(title, body, data = {}) {
  return {
    title,
    body,
    data: {
      type: "general",
      ...data,
    },
  };
}

module.exports = {
  createNewsNotification,
  createAutoFollowNotification,
  createGeneralNotification,
};
