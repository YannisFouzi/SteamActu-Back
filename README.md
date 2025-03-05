# Steam Actu Notif

Une application Android qui envoie des notifications push en temps réel pour les actualités des jeux Steam présents dans votre bibliothèque.

## Fonctionnalités

- Connexion simple et sécurisée avec votre compte Steam via OpenID
- Notifications push en temps réel pour les nouvelles actualités
- Ouverture directe des actualités dans l'application Steam lorsque la notification est cliquée
- Fonctionnement en arrière-plan sans impact sur la batterie de l'appareil

## Comment ça fonctionne

### Côté client (Application Android)

1. L'utilisateur se connecte avec son compte Steam (via OpenID)
2. L'application récupère la liste des jeux de l'utilisateur
3. L'application s'abonne aux sujets FCM (Firebase Cloud Messaging) pour chaque jeu
4. L'application reste en veille, prête à recevoir des notifications

### Côté serveur (Firebase Functions)

1. Une fonction Cloud vérifie régulièrement les nouvelles actualités (toutes les 5 minutes)
2. Pour chaque nouvelle actualité, une notification est envoyée aux appareils abonnés au sujet correspondant
3. Aucune information personnelle n'est stockée sur le serveur

## Configuration requise

- Android 6.0 (API 23) ou version ultérieure
- Application Steam Mobile installée sur l'appareil
- Un compte Steam valide

## Installation

1. Téléchargez et installez l'application
2. Appuyez sur "Se connecter avec Steam"
3. Authentifiez-vous via votre compte Steam
4. C'est tout ! Vous recevrez désormais des notifications en temps réel

## Déploiement du serveur

Pour déployer les fonctions Firebase :

1. Installez Firebase CLI

   ```
   npm install -g firebase-tools
   ```

2. Connectez-vous à Firebase

   ```
   firebase login
   ```

3. Initialisez le projet

   ```
   firebase init functions
   ```

4. Déployez les fonctions
   ```
   firebase deploy --only functions
   ```

## Confidentialité

Cette application ne collecte ni ne stocke aucune donnée personnelle en dehors de votre appareil. Votre Steam ID est stocké localement et utilisé uniquement pour s'abonner aux sujets de notification pertinents.

## Support

Pour toute question ou problème, veuillez créer une issue sur le dépôt GitHub du projet.
