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
      ? `${gameName}`
      : 'Nouvelle actualité jeu',
    body: newsItem.title,
    data: {
      type: 'news',
      url: newsItem.url,
      appId,
      newsId: newsItem.gid,
      context: newsItem.context || 'news',
      allowUnfollow: true, // Permet l'affichage du bouton "Ne plus suivre ce jeu"
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
    title: 'Nouveau jeu suivi automatiquement',
    body: `${gameName} a été ajouté à vos jeux suivis`,
    data: {
      type: 'auto_follow',
      appId,
      allowUnfollow: false, // Pas de bouton unfollow sur les notifications d'auto-follow
    },
  };
}

/**
 * Crée une notification pour proposer le suivi d'un jeu détecté
 * @param {string} appId - ID du jeu
 * @param {string} gameName - Nom du jeu
 * @param {string} source - Origine de la détection (library|wishlist)
 * @returns {Object} - Notification formatée
 */
function createFollowPromptNotification(appId, gameName, source = 'library') {
  const contextLabel =
    source === 'wishlist' ? 'votre wishlist Steam' : 'votre bibliothèque Steam';

  return {
    title: 'Voulez-vous suivre ce jeu ?',
    body: `${gameName || `Jeu ${appId}`} a été détecté dans ${contextLabel}.`,
    data: {
      type: 'follow_prompt',
      appId,
      source,
      gameName: gameName || '',
      allowUnfollow: false, // Pas de bouton unfollow sur les prompts de suivi
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
