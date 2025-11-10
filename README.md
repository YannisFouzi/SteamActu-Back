# Steam Notifications API - Backend

API REST moderne et robuste pour la gestion des notifications et actualités Steam, construite avec Node.js, Express et MongoDB.

## 🚀 Vue d'Ensemble

**Steam Notifications API** est un backend complet qui fournit :

- 🔐 **Authentification Steam OpenID** sécurisée
- 📰 **Agrégation d'actualités** multi-jeux intelligente
- 🔔 **Système de notifications** push extensible
- 📊 **Synchronisation automatique** des bibliothèques Steam
- ⚡ **Tâches planifiées** pour la mise à jour des données
- 🎮 **Gestion avancée** des abonnements de jeux

## 🏗️ Architecture Technique

### Stack Technologique

- **Runtime** : Node.js ≥ 18.0.0
- **Framework Web** : Express.js 4.21.2
- **Base de Données** : MongoDB avec Mongoose 8.12.1
- **Authentification** : Steam OpenID 2.0
- **Tâches Planifiées** : Node-cron 3.0.3
- **Requêtes HTTP** : Axios 1.8.2
- **Variables d'Environnement** : dotenv 16.4.7

### Architecture Modulaire

```
backend/
├── server.js                 # Point d'entrée principal
├── src/
│   ├── config/              # Configuration de l'application
│   │   ├── app.js          # Configuration Express et constantes
│   │   └── cron/           # Système de tâches planifiées
│   │       ├── index.js    # Initialisation des cron jobs
│   │       ├── schedules.js # Définition des plannings
│   │       ├── taskExecutor.js # Exécuteur de tâches
│   │       └── tasks.js    # Tâches métier
│   ├── database/           # Gestion de la base de données
│   │   └── connection.js   # Connexion MongoDB et shutdown
│   ├── middleware/         # Middlewares Express
│   │   ├── auth.js         # Authentification et validation
│   │   ├── steamValidators.js # Validation des données Steam
│   │   └── userValidators.js  # Validation des données utilisateur
│   ├── models/             # Modèles de données Mongoose
│   │   ├── User.js         # Modèle utilisateur
│   │   └── GameSubscription.js # Modèle d'abonnements aux jeux
│   ├── routes/             # Routes API
│   │   ├── auth.js         # Authentification Steam
│   │   ├── users.js        # Gestion des utilisateurs
│   │   ├── steam.js        # Intégration Steam API
│   │   └── news.js         # Actualités et fil de nouvelles
│   ├── services/           # Services métier
│   │   ├── steamService.js # Interface Steam API principale
│   │   ├── newsFeedService.js # Agrégation d'actualités
│   │   ├── notificationService.js # Notifications push
│   │   ├── gamesSyncService.js # Synchronisation des jeux
│   │   ├── steam/          # Services Steam spécialisés
│   │   ├── newsFeed/       # Gestion du fil d'actualités
│   │   ├── notifications/  # Système de notifications
│   │   ├── gameSync/       # Synchronisation des données
│   │   └── users/          # Gestion des utilisateurs
│   └── utils/              # Utilitaires et helpers
└── package.json            # Dépendances et scripts
```

## 🔧 Fonctionnalités Principales

### 1. Authentification Steam OpenID

**Processus d'authentification sécurisé** :

- Redirection vers Steam OpenID
- Validation des réponses OpenID
- Extraction et vérification des SteamID
- Redirection native vers l'application mobile

```javascript
// Route d'authentification
GET /auth/steam/return
```

### 2. Gestion des Utilisateurs

**CRUD complet des utilisateurs** :

- Enregistrement automatique lors de la première connexion
- Mise à jour des profils Steam
- Gestion des préférences de notification
- Suivi des jeux récemment actifs

```javascript
// Endpoints utilisateurs
POST   /api/users/register
GET    /api/users/:steamId
PUT    /api/users/:steamId/notifications
PUT    /api/users/:steamId/active-games
POST   /api/users/:steamId/follow
DELETE /api/users/:steamId/follow/:appId
```

### 3. Intégration Steam API

**Interface complète avec Steam Web API** :

- Récupération des bibliothèques de jeux
- Informations détaillées des profils
- Actualités des jeux en temps réel
- Gestion des erreurs et retry automatique

```javascript
// Endpoints Steam
GET /api/steam/games/:steamId
GET /api/steam/profile/:steamId
```

### 4. Système d'Actualités Intelligent

**Agrégation multi-sources** :

- Collecte d'actualités de plusieurs jeux
- Filtrage par jeux suivis
- Tri chronologique intelligent
- Optimisation des appels API Steam

```javascript
// Endpoints actualités
GET /api/news/game/:appId
GET /api/news/feed
```

### 5. Tâches Planifiées Automatisées

**Système de cron jobs robuste** :

- **Vérification des actualités** : toutes les heures
- **Synchronisation par groupes** : toutes les 30 minutes
- **Synchronisation complète** : hebdomadaire (dimanche 3h)

## 🗄️ Modèles de Données

### Utilisateur (User)

```javascript
{
  steamId: String,              // ID Steam unique
  username: String,             // Nom d'utilisateur Steam
  avatarUrl: String,            // URL de l'avatar Steam
  lastChecked: Date,            // Dernière vérification
  followedGames: [String],      // IDs des jeux suivis
  recentActiveGames: [{         // Jeux récemment actifs
    appId: String,
    name: String,
    lastNewsDate: Date
  }],
  notificationSettings: {       // Paramètres de notification
    enabled: Boolean,
    pushToken: String,
    autoFollowNewGames: Boolean
  }
}
```

### Abonnement de Jeu (GameSubscription)

```javascript
{
  appId: String,                // ID de l'application Steam
  name: String,                 // Nom du jeu
  logoUrl: String,              // URL du logo
  subscribers: [String],        // Liste des SteamID abonnés
  lastNewsCheck: Date,          // Dernière vérification d'actualités
  newsCache: [{                 // Cache des actualités
    id: String,
    title: String,
    url: String,
    date: Date,
    author: String,
    contents: String
  }]
}
```

## 🚀 Installation et Configuration

### Prérequis

- **Node.js** ≥ 18.0.0
- **MongoDB** (local ou MongoDB Atlas)
- **Clé API Steam** (obtenue sur https://steamcommunity.com/dev/apikey)

### Installation

1. **Cloner le projet**

   ```bash
   git clone [URL_DU_REPO]
   cd steam-actu/backend
   ```

2. **Installer les dépendances**

   ```bash
   npm install
   ```

3. **Configuration de l'environnement**

   Créer un fichier `.env` :

   ```env
   # Base de données MongoDB
   MONGODB_URI=mongodb://localhost:27017/steam-notifications
   # Ou MongoDB Atlas :
   # MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/steam-notifications

   # Clé API Steam
   STEAM_API_KEY=votre_cle_api_steam

   # Port du serveur
   PORT=5000

   # Configuration optionnelle
   NODE_ENV=development
   API_AUTH_KEY=votre_cle_auth_api
   MOBILE_REDIRECT_SCHEME=steamnotif
   CORS_ORIGINS=http://localhost:3000,http://10.0.2.2:3000
   ```

## 🏃‍♂️ Lancement du Serveur

### Développement

```bash
# Démarrage avec rechargement automatique
npm run dev

# Ou démarrage simple
npm start
```

### Production

```bash
# Démarrage en mode production
NODE_ENV=production npm start
```

Le serveur démarre sur `http://localhost:5000` par défaut.

## 📡 API Documentation

### Authentification

#### Steam OpenID Callback

```http
GET /auth/steam/return
```

**Paramètres de requête** : Réponse OpenID de Steam
**Réponse** : Redirection vers l'app mobile avec SteamID

### Utilisateurs

#### Enregistrer un utilisateur

```http
POST /api/users/register
Content-Type: application/json

{
  "steamId": "76561198000000000"
}
```

#### Récupérer un utilisateur

```http
GET /api/users/{steamId}
```

#### Suivre un jeu

```http
POST /api/users/{steamId}/follow
Content-Type: application/json

{
  "appId": "730",
  "name": "Counter-Strike 2",
  "logoUrl": "https://..."
}
```

#### Ne plus suivre un jeu

```http
DELETE /api/users/{steamId}/follow/{appId}
```

### Steam API

#### Récupérer les jeux d'un utilisateur

```http
GET /api/steam/games/{steamId}?followedOnly=false
```

#### Récupérer un profil Steam

```http
GET /api/steam/profile/{steamId}
```

### Actualités

#### Actualités d'un jeu spécifique

```http
GET /api/news/game/{appId}?count=5&maxLength=300&language=fr
```

#### Fil d'actualités global

```http
GET /api/news/feed?steamId={steamId}&perGameLimit=10
```

## 🔄 Services et Logique Métier

### Service Steam (`steamService.js`)

**Interface principale avec Steam Web API** :

- `getUserGames(steamId)` - Récupère la bibliothèque de jeux
- `getGameNews(appId, options)` - Actualités d'un jeu
- `getUserProfile(steamId)` - Informations du profil
- `registerOrUpdateUser(steamId)` - Enregistrement utilisateur

### Service de Fil d'Actualités (`newsFeedService.js`)

**Agrégation intelligente d'actualités** :

- Collecte multi-jeux optimisée
- Filtrage par préférences utilisateur
- Tri chronologique et pertinence
- Cache intelligent pour les performances

### Service de Notifications (`notificationService.js`)

**Système de notifications extensible** :

- Support multi-provider (FCM, APNS, etc.)
- Templates de notifications personnalisables
- Gestion des erreurs et retry
- Statistiques d'envoi

### Service de Synchronisation (`gamesSyncService.js`)

**Synchronisation automatisée** :

- Mise à jour des bibliothèques utilisateur
- Détection de nouveaux jeux
- Synchronisation des métadonnées
- Gestion des erreurs API Steam

## ⚡ Système de Tâches Planifiées

### Configuration des Plannings

```javascript
// Schedules dans src/config/cron/schedules.js
const SCHEDULES = {
  NEWS_CHECK: "0 * * * *", // Toutes les heures
  USER_GROUP_SYNC: "30 */2 * * *", // Toutes les 2h à :30
  FULL_SYNC: "0 3 * * 0", // Dimanche à 3h
};
```

### Tâches Disponibles

1. **Vérification des actualités** (`checkNews`)

   - Scan des jeux avec abonnés
   - Récupération des nouvelles actualités
   - Envoi de notifications push

2. **Synchronisation par groupes** (`syncUserGroup`)

   - Mise à jour des bibliothèques par batches
   - Optimisation des appels API
   - Gestion des quotas Steam

3. **Synchronisation complète** (`syncAllUsers`)
   - Vérification complète hebdomadaire
   - Nettoyage des données obsolètes
   - Maintenance de la base de données

## 🛡️ Sécurité et Validation

### Middlewares de Sécurité

- **CORS configuré** pour les origines autorisées
- **Validation des SteamID** avec regex strict
- **Sanitisation des données** utilisateur
- **Gestion des erreurs** sans exposition d'informations sensibles

### Validation des Données

```javascript
// Exemple de validation SteamID
const STEAM_ID_REGEX = /^7656119[0-9]{10}$/;

// Validation des formats de jeux
const validateActiveGamesFormat = (games) => {
  return (
    Array.isArray(games) &&
    games.every((game) => game.appId && game.name && game.lastNewsDate)
  );
};
```

## 📊 Monitoring et Logging

### Logging Structuré

```javascript
// Exemples de logs
console.log(`✅ Utilisateur ${steamId} authentifié avec succès`);
console.error(`❌ Erreur Steam API pour ${steamId}:`, error);
console.log(`📊 Traitement de ${games.length} jeux pour ${steamId}`);
```

### Métriques Importantes

- Nombre d'utilisateurs actifs
- Fréquence des appels Steam API
- Taux de succès des notifications
- Performance des tâches planifiées

## 🐛 Débogage et Maintenance

### Logs de Débogage

```bash
# Activer les logs détaillés
DEBUG=steam-api,mongodb npm start

# Logs des tâches cron
DEBUG=cron-tasks npm start
```

### Problèmes Courants

1. **Quota Steam API dépassé**

   - Implémenter un système de cache plus agressif
   - Espacer les requêtes avec des delays
   - Utiliser plusieurs clés API en rotation

2. **Connexion MongoDB perdue**

   - Vérifier la chaîne de connexion
   - S'assurer que MongoDB est accessible
   - Vérifier les credentials et la whitelist IP

3. **Notifications non reçues**
   - Vérifier les tokens push des utilisateurs
   - Tester la configuration FCM/APNS
   - Vérifier les logs d'erreur du service

### Commandes de Maintenance

```bash
# Vérifier la santé de l'API
curl http://localhost:5000/

# Tester l'authentification
curl http://localhost:5000/auth/steam/return?openid.identity=...

# Vérifier un utilisateur
curl http://localhost:5000/api/users/76561198000000000
```

## 🚀 Déploiement

### Variables d'Environnement Production

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://...
STEAM_API_KEY=...
CORS_ORIGINS=https://votre-frontend.com
```

### Docker (Optionnel)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

### Plateformes de Déploiement

- **Heroku** : Déploiement simple avec MongoDB Atlas
- **DigitalOcean App Platform** : Intégration continue
- **AWS/GCP** : Solutions enterprise avec load balancing
- **VPS** : Déploiement manuel avec PM2

## 📈 Optimisations et Performance

### Cache et Performance

- **Cache MongoDB** avec index sur steamId et appId
- **Limitation des requêtes** Steam API (1000/jour)
- **Batching des opérations** pour réduire la latence
- **Compression gzip** activée sur Express

### Scalabilité

- **Architecture modulaire** prête pour la microservices
- **Séparation des concerns** avec services dédiés
- **Tâches asynchrones** avec queues (Redis/Bull.js)
- **Load balancing** horizontal possible

## 🤝 Contribution et Standards

### Standards de Code

- **ES6+** avec async/await
- **Modules CommonJS** pour la compatibilité Node.js
- **JSDoc** pour la documentation des fonctions
- **Gestion d'erreurs** systématique avec try/catch

### Architecture Pattern

- **MVC Pattern** avec routes/services/models
- **Dependency Injection** via modules
- **Factory Pattern** pour les services
- **Observer Pattern** pour les notifications

### Tests (À implémenter)

```bash
# Framework de test recommandé
npm install --save-dev jest supertest

# Structure de tests
tests/
├── unit/           # Tests unitaires
├── integration/    # Tests d'intégration
└── e2e/           # Tests end-to-end
```

## 📚 Scripts NPM Disponibles

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  }
}
```

## 🔮 Roadmap et Évolutions

### Fonctionnalités Futures

- [ ] **Système de cache Redis** pour améliorer les performances
- [ ] **API GraphQL** en complément du REST
- [ ] **Webhooks Steam** pour les mises à jour en temps réel
- [ ] **Analytics avancées** des comportements utilisateurs
- [ ] **Support multi-langues** pour les actualités
- [ ] **API de modération** des contenus

### Améliorations Techniques

- [ ] **Migration vers TypeScript** pour une meilleure robustesse
- [ ] **Tests automatisés** avec couverture de code
- [ ] **Documentation OpenAPI/Swagger** interactive
- [ ] **Monitoring APM** (New Relic, Datadog)
- [ ] **CI/CD Pipeline** avec GitHub Actions
- [ ] **Rate limiting avancé** par utilisateur

---

## 📞 Support et Contact

Pour toute question ou problème :

1. Vérifier les logs de l'application
2. Consulter la documentation Steam Web API
3. Vérifier la configuration MongoDB
4. Tester les endpoints avec un client REST (Postman, Insomnia)

**Steam Web API Documentation** : https://steamcommunity.com/dev
**MongoDB Documentation** : https://docs.mongodb.com/
**Express.js Documentation** : https://expressjs.com/
