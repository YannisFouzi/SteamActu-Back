// Ce service est un placeholder pour l'implémentation des notifications
// Vous pourrez l'étendre pour utiliser OneSignal ou un autre service

/**
 * Envoie une notification à un utilisateur
 * @param {string} token - Token de notification push du périphérique
 * @param {Object} notification - Détails de la notification
 * @param {string} notification.title - Titre de la notification
 * @param {string} notification.body - Contenu de la notification
 * @param {Object} notification.data - Données supplémentaires pour la notification
 * @returns {Promise<boolean>} - Succès de l'envoi
 */
async function sendNotification(token, notification) {
  try {
    // Placeholder pour l'implémentation réelle
    console.log(`Notification envoyée à ${token}:`, notification);

    // TODO: Implémenter l'intégration avec un service comme OneSignal
    // Exemple d'implémentation avec OneSignal:
    /*
    const response = await axios.post('https://onesignal.com/api/v1/notifications', {
      app_id: process.env.ONESIGNAL_APP_ID,
      include_player_ids: [token],
      headings: { fr: notification.title, en: notification.title },
      contents: { fr: notification.body, en: notification.body },
      data: notification.data
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${process.env.ONESIGNAL_API_KEY}`
      }
    });
    
    return response.status === 200;
    */

    return true;
  } catch (error) {
    console.error("Erreur lors de l'envoi de la notification:", error);
    return false;
  }
}

/**
 * Envoie des notifications pour de nouvelles actualités
 * @param {Object} user - Utilisateur à notifier
 * @param {Object} newsItems - Actualités à notifier, regroupées par jeu
 * @returns {Promise<number>} - Nombre de notifications envoyées
 */
async function sendNewsNotifications(user, newsItems) {
  try {
    const { pushToken } = user.notificationSettings;

    if (!pushToken) {
      return 0;
    }

    let notificationCount = 0;

    // Pour chaque jeu ayant des nouvelles actualités
    for (const [appId, news] of Object.entries(newsItems)) {
      // Trouver le jeu correspondant dans la liste des jeux suivis par l'utilisateur
      const game = user.followedGames.find((g) => g.appId === appId);

      if (!game) continue;

      // Pour chaque actualité du jeu
      for (const item of news) {
        const notification = {
          title: `${game.name} - Nouvelle actualité`,
          body: item.title,
          data: {
            url: item.url,
            appId,
            newsId: item.gid,
          },
        };

        const success = await sendNotification(pushToken, notification);

        if (success) {
          notificationCount++;
        }
      }
    }

    return notificationCount;
  } catch (error) {
    console.error("Erreur lors de l'envoi des notifications:", error);
    return 0;
  }
}

module.exports = {
  sendNotification,
  sendNewsNotifications,
};
