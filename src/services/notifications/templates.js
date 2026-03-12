/**
 * Templates de notifications
 * Centralise le formatage des differents types de notifications
 */

/**
 * Cree une notification pour une nouvelle actualite
 * @param {string} appId - ID de l'application
 * @param {Object} newsItem - Actualite
 * @param {string} gameName - Nom du jeu (optionnel)
 * @returns {Object} - Notification formatee
 */
function createNewsNotification(appId, newsItem, gameName = null, steamId = null) {
  return {
    title: gameName
      ? `${gameName}`
      : 'Nouvelle actualite jeu',
    body: newsItem.title,
    data: {
      type: 'news',
      url: newsItem.url,
      appId,
      ...(steamId ? { steamId } : {}),
      newsId: newsItem.gid,
      context: newsItem.context || 'news',
      allowUnfollow: true, // Permet l'affichage du bouton "Ne plus suivre ce jeu"
    },
  };
}

/**
 * Cree une notification pour un nouveau jeu suivi automatiquement
 * @param {string} appId - ID de l'application
 * @param {string} gameName - Nom du jeu
 * @returns {Object} - Notification formatee
 */
function createAutoFollowNotification(appId, gameName) {
  return {
    title: 'Nouveau jeu suivi automatiquement',
    body: `${gameName} a ete ajoute a vos jeux suivis`,
    data: {
      type: 'auto_follow',
      appId,
      allowUnfollow: false, // Pas de bouton unfollow sur les notifications d'auto-follow
    },
  };
}

/**
 * Cree une notification pour proposer le suivi d'un jeu detecte
 * @param {string} appId - ID du jeu
 * @param {string} gameName - Nom du jeu
 * @param {string} source - Origine de la detection (library|wishlist)
 * @returns {Object} - Notification formatee
 */
function createFollowPromptNotification(appId, gameName, source = 'library') {
  const contextLabel =
    source === 'wishlist' ? 'votre wishlist Steam' : 'votre bibliotheque Steam';

  return {
    title: 'Voulez-vous suivre ce jeu ?',
    body: `${gameName || `Jeu ${appId}`} a ete detecte dans ${contextLabel}.`,
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
 * Cree une notification generale
 * @param {string} title - Titre
 * @param {string} body - Corps du message
 * @param {Object} data - Donnees supplementaires
 * @returns {Object} - Notification formatee
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
