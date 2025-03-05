const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

// Fonction qui s'exécute toutes les 5 minutes pour vérifier les nouvelles actualités Steam
exports.checkSteamNews = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async (context) => {
    console.log("Vérification des actualités Steam...");

    try {
      // Récupérer les jeux les plus populaires de Steam
      // (En production, il faudrait gérer une liste de jeux par utilisateur)
      const popularGames = [
        { appid: 570, name: "Dota 2" }, // Dota 2
        { appid: 730, name: "CS:GO" }, // CS:GO
        { appid: 578080, name: "PUBG" }, // PUBG
        { appid: 1091500, name: "Cyberpunk 2077" }, // Cyberpunk 2077
        { appid: 1599340, name: "Lost Ark" }, // Lost Ark
        { appid: 1938090, name: "Call of Duty" }, // Modern Warfare III
      ];

      // Récupérer la date du dernier contrôle
      const lastCheckRef = admin.database().ref("/lastCheck");
      const lastCheckSnapshot = await lastCheckRef.once("value");
      const lastCheckTime =
        lastCheckSnapshot.val() || Math.floor(Date.now() / 1000) - 3600; // Par défaut 1 heure

      console.log(`Dernière vérification à: ${lastCheckTime}`);

      // Chercher les nouvelles actualités pour chaque jeu
      for (const game of popularGames) {
        await checkGameNews(game.appid, game.name, lastCheckTime);
      }

      // Mettre à jour la date du dernier contrôle
      await lastCheckRef.set(Math.floor(Date.now() / 1000));

      return null;
    } catch (error) {
      console.error("Erreur lors de la vérification des actualités:", error);
      return null;
    }
  });

/**
 * Vérifie les nouvelles actualités pour un jeu spécifique
 */
async function checkGameNews(appId, gameName, lastCheckTime) {
  try {
    // Appeler l'API Steam pour obtenir les actualités
    const response = await fetch(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=5&maxlength=300&format=json`
    );
    const data = await response.json();

    if (!data.appnews || !data.appnews.newsitems) {
      console.log(`Pas d'actualités pour ${gameName} (${appId})`);
      return;
    }

    // Filtrer les nouvelles actualités
    const news = data.appnews.newsitems.filter(
      (item) => item.date > lastCheckTime
    );

    if (news.length > 0) {
      console.log(
        `Trouvé ${news.length} nouvelles actualités pour ${gameName}`
      );

      // Envoyer une notification pour chaque nouvelle actualité
      for (const item of news) {
        await sendNotification(appId, gameName, item);
      }
    } else {
      console.log(`Pas de nouvelles actualités pour ${gameName}`);
    }
  } catch (error) {
    console.error(
      `Erreur lors de la vérification des actualités pour ${gameName}:`,
      error
    );
  }
}

/**
 * Envoie une notification pour une actualité
 */
async function sendNotification(appId, gameName, newsItem) {
  try {
    // Préparer le message de notification
    const message = {
      notification: {
        title: `${gameName}: ${newsItem.title}`,
        body: newsItem.contents,
      },
      data: {
        gameId: appId.toString(),
        newsId: newsItem.gid,
        url: newsItem.url,
      },
      android: {
        notification: {
          icon: "ic_notification",
          color: "#1b2838",
          clickAction: "android.intent.action.VIEW",
        },
      },
      topic: `game_${appId}`, // Sujet spécifique au jeu
    };

    // Envoyer la notification
    const response = await admin.messaging().send(message);
    console.log(`Notification envoyée pour ${gameName}:`, response);

    // Enregistrer l'actualité dans la base de données
    await admin.database().ref(`/news/${appId}/${newsItem.gid}`).set({
      title: newsItem.title,
      content: newsItem.contents,
      url: newsItem.url,
      date: newsItem.date,
      sentAt: admin.database.ServerValue.TIMESTAMP,
    });
  } catch (error) {
    console.error("Erreur lors de l'envoi de la notification:", error);
  }
}
